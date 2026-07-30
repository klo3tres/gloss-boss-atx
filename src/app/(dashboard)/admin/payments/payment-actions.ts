'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { processCheckoutSessionCompleted } from '@/lib/stripe/checkout';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { applyPaymentRefundState } from '@/lib/payment-refund-state';
import { randomUUID } from 'node:crypto';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) return null;
  return { userId: session.user.id, admin: tryCreateAdminSupabase() };
}

export async function reconcileStripeSessionAction(formData: FormData): Promise<void> {
  const gate = await requireAdmin();
  if (!gate?.admin) return;
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  if (!sessionId.startsWith('cs_')) return;
  const stripe = await getStripeSdk(gate.admin);
  if (!stripe) return;
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent'] });
  await processCheckoutSessionCompleted({ admin: gate.admin, session });
  await gate.admin.from('payment_reconciliation_events').insert({
    stripe_checkout_session_id: sessionId,
    action: 'reconcile',
    status: 'processed',
    actor_id: gate.userId,
    payload: { payment_status: session.payment_status, amount_total: session.amount_total },
  });
  revalidatePath('/admin/payments');
  revalidatePath('/admin');
  revalidatePath('/admin/booking-health');
}

export async function refundStripePaymentAction(formData: FormData): Promise<void> {
  const gate = await requireAdmin();
  if (!gate?.admin) return;
  const paymentId = String(formData.get('paymentId') ?? '').trim();
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const paymentIntentId = String(formData.get('paymentIntentId') ?? '').trim();
  const amountRaw = String(formData.get('amountCents') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim() || 'Customer refund';
  const confirm = String(formData.get('confirm') ?? '').trim().toUpperCase();
  if (confirm !== 'REFUND') return;

  let paymentQuery = gate.admin
    .from('payments')
    .select('id, appointment_id, fallback_booking_id, customer_id, amount_cents, refunded_amount_cents, stripe_payment_intent_id, stripe_checkout_session_id, payment_method, provider');
  if (paymentId) paymentQuery = paymentQuery.eq('id', paymentId);
  else if (paymentIntentId) paymentQuery = paymentQuery.eq('stripe_payment_intent_id', paymentIntentId);
  else paymentQuery = paymentQuery.eq('stripe_checkout_session_id', sessionId);
  const payment = await paymentQuery.limit(1).maybeSingle();
  if (payment.error || !payment.data?.id) return;

  const originalCents = Math.max(0, Number(payment.data.amount_cents ?? 0));
  const alreadyRefundedCents = Math.max(0, Number(payment.data.refunded_amount_cents ?? 0));
  const refundableCents = Math.max(0, originalCents - alreadyRefundedCents);
  const requestedCents = amountRaw ? Number(amountRaw) : refundableCents;
  if (!Number.isInteger(requestedCents) || requestedCents <= 0 || requestedCents > refundableCents) return;

  const stripe = await getStripeSdk(gate.admin);
  let pi = paymentIntentId || String(payment.data.stripe_payment_intent_id ?? '');
  const savedSessionId = sessionId || String(payment.data.stripe_checkout_session_id ?? '');
  if (!pi && savedSessionId.startsWith('cs_') && stripe) {
    const session = await stripe.checkout.sessions.retrieve(savedSessionId);
    pi = typeof session.payment_intent === 'string' ? session.payment_intent : '';
  }

  let refundId = `manual_refund_${randomUUID()}`;
  let refundStatus = 'succeeded';
  let refundPayload: Record<string, unknown> = {
    kind: 'manual_external_refund',
    reason,
    payment_id: payment.data.id,
  };
  if (pi.startsWith('pi_')) {
    if (!stripe) return;
    const refund = await stripe.refunds.create(
      { payment_intent: pi, amount: requestedCents, metadata: { payment_id: String(payment.data.id), reason: reason.slice(0, 500) } },
      { idempotencyKey: `refund-${payment.data.id}-${alreadyRefundedCents + requestedCents}`.slice(0, 255) },
    );
    refundId = refund.id;
    refundStatus = refund.status ?? 'pending';
    refundPayload = refund as unknown as Record<string, unknown>;
  }

  const row = {
    stripe_refund_id: refundId,
    stripe_payment_intent_id: pi || null,
    stripe_checkout_session_id: savedSessionId || null,
    amount_cents: requestedCents,
    status: refundStatus,
    actor_id: gate.userId,
    customer_id: payment.data.customer_id ?? null,
    appointment_id: payment.data.appointment_id ?? null,
    fallback_booking_id: payment.data.fallback_booking_id ?? null,
    payload: { ...refundPayload, reason, payment_id: payment.data.id },
  };
  let ins = await gate.admin.from('payment_refunds').upsert(row, { onConflict: 'stripe_refund_id' });
  if (ins.error && isSchemaDriftError(ins.error.message)) {
    ins = await gate.admin.from('payment_refunds').upsert({
      stripe_refund_id: refundId,
      stripe_payment_intent_id: pi || null,
      stripe_checkout_session_id: savedSessionId || null,
      amount_cents: requestedCents,
      status: refundStatus,
      actor_id: gate.userId,
      payload: row.payload,
    }, { onConflict: 'stripe_refund_id' });
  }
  if (ins.error) return;

  const applied = await applyPaymentRefundState(gate.admin, {
    paymentId: String(payment.data.id),
    refundedTotalCents: alreadyRefundedCents + requestedCents,
  });
  if (!applied.ok) return;

  await gate.admin.from('payment_reconciliation_events').insert({
    stripe_checkout_session_id: savedSessionId || null,
    stripe_payment_intent_id: pi || null,
    action: 'refund',
    status: applied.fullyRefunded ? 'refunded' : 'partially_refunded',
    actor_id: gate.userId,
    payload: row.payload,
  });
  revalidatePath('/admin/payments');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  if (applied.appointmentId) revalidatePath(`/admin/work-orders/${applied.appointmentId}`);
}

export async function excludePaymentFromRevenueAction(formData: FormData): Promise<void> {
  const gate = await requireAdmin();
  if (!gate?.admin) return;
  const paymentId = String(formData.get('paymentId') ?? '').trim();
  const reason = String(formData.get('reason') ?? 'admin_cleanup').trim() || 'admin_cleanup';
  if (!paymentId) return;

  const current = await gate.admin.from('payments').select('metadata').eq('id', paymentId).maybeSingle();
  const metadata = current.data?.metadata && typeof current.data.metadata === 'object' ? (current.data.metadata as Record<string, unknown>) : {};
  const update = await gate.admin
    .from('payments')
    .update({
      exclude_from_revenue: true,
      metadata: {
        ...metadata,
        excluded_by_admin: true,
        excluded_by: gate.userId,
        excluded_reason: reason,
        excluded_at: new Date().toISOString(),
      },
    })
    .eq('id', paymentId);

  if (update.error && !isSchemaDriftError(update.error.message)) console.warn('[payments] exclude row', update.error.message);
  revalidatePath('/admin/payments');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
}

