'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { processCheckoutSessionCompleted } from '@/lib/stripe/checkout';
import { isSchemaDriftError } from '@/lib/booking-server-shared';

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
  const sessionId = String(formData.get('sessionId') ?? '').trim();
  const paymentIntentId = String(formData.get('paymentIntentId') ?? '').trim();
  const amountRaw = String(formData.get('amountCents') ?? '').trim();
  const confirm = String(formData.get('confirm') ?? '').trim().toUpperCase();
  if (confirm !== 'REFUND') return;
  const stripe = await getStripeSdk(gate.admin);
  if (!stripe) return;
  let pi = paymentIntentId;
  if (!pi && sessionId.startsWith('cs_')) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    pi = typeof session.payment_intent === 'string' ? session.payment_intent : '';
  }
  if (!pi.startsWith('pi_')) return;
  const amount = Number(amountRaw);
  const refund = await stripe.refunds.create({
    payment_intent: pi,
    ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}),
  });
  const row = {
    stripe_refund_id: refund.id,
    stripe_payment_intent_id: pi,
    stripe_checkout_session_id: sessionId || null,
    amount_cents: refund.amount,
    status: refund.status ?? 'pending',
    actor_id: gate.userId,
    payload: refund as unknown as Record<string, unknown>,
  };
  const ins = await gate.admin.from('payment_refunds').insert(row);
  if (ins.error && !isSchemaDriftError(ins.error.message)) console.warn('[payments] refund row', ins.error.message);
  await gate.admin.from('payment_reconciliation_events').insert({
    stripe_checkout_session_id: sessionId || null,
    stripe_payment_intent_id: pi,
    action: 'refund',
    status: refund.status ?? 'pending',
    actor_id: gate.userId,
    payload: row.payload,
  });
  revalidatePath('/admin/payments');
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

