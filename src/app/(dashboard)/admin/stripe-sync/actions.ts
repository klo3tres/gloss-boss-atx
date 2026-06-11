'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { syncRecentStripeFinance } from '@/lib/stripe-finance-sync';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function resyncStripeTransactionsAction(formData?: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return;
  const secrets = await getStripeSecrets(admin);
  if (!secrets.secretKey) return;
  const stripe = new Stripe(secrets.secretKey);
  await syncRecentStripeFinance(stripe, admin);
  const scope = String(formData?.get('scope') ?? 'all').trim() || 'all';
  await admin.from('financial_ledger').insert({
    source: 'stripe',
    type: 'adjustment',
    amount: 0,
    gross_amount: 0,
    fee_amount: 0,
    net_amount: 0,
    description: `Manual Stripe resync completed (${scope})`,
    category: 'sync_marker',
    occurred_at: new Date().toISOString(),
  });
  revalidatePath('/admin/stripe-sync');
  revalidatePath('/admin/revenue');
}

export async function addManualExpenseAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return;
  const description = String(formData.get('description') ?? '').trim();
  const amount = Math.round(Number(String(formData.get('amount') ?? '0')) * 100);
  if (!description || amount <= 0) return;
  const category = String(formData.get('category') ?? 'other').trim() || 'other';
  const occurredAt = String(formData.get('occurred_at') ?? '').trim();
  const occurred_at = occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : new Date().toISOString();
  const isTest = formData.get('is_test') === 'on';
  const exclude = formData.get('exclude_from_reports') === 'on';
  const { data } = await admin.from('expenses').insert({
    description,
    category,
    amount_cents: amount,
    payment_method: String(formData.get('payment_method') ?? 'other'),
    occurred_at,
    is_test: isTest,
    exclude_from_reports: exclude,
    created_by: session.user.id,
  }).select('id').maybeSingle();
  await admin.from('financial_ledger').insert({
    source: 'manual',
    type: 'expense',
    amount: -Math.abs(amount),
    gross_amount: -Math.abs(amount),
    fee_amount: 0,
    net_amount: -Math.abs(amount),
    description,
    category,
    is_test: isTest,
    exclude_from_reports: exclude,
    occurred_at,
    metadata: { expense_id: data?.id ?? null },
  });
  revalidatePath('/admin/stripe-sync');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
}

export async function fixStripePaymentAction(params: {
  chargeId: string;
  paymentIntentId: string | null;
  checkoutSessionId: string | null;
  customerEmail: string | null;
  customerName: string | null;
  amountCents: number;
  created: number;
}) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) {
    throw new Error('Unauthorized or database not configured');
  }

  // 1. Match customer
  let customerId: string | null = null;
  let customerName = params.customerName;
  if (params.customerEmail) {
    const { data: customer } = await admin
      .from('customers')
      .select('id, full_name')
      .eq('email', params.customerEmail.trim().toLowerCase())
      .maybeSingle();
    if (customer?.id) {
      customerId = customer.id;
      if (!customerName) customerName = customer.full_name;
    }
  }

  // 2. Match appointment (work order)
  let appointmentId: string | null = null;
  
  if (params.checkoutSessionId) {
    const { data: appt } = await admin
      .from('appointments')
      .select('id')
      .eq('stripe_checkout_session_id', params.checkoutSessionId)
      .maybeSingle();
    if (appt?.id) appointmentId = appt.id;
  }

  if (!appointmentId && params.paymentIntentId) {
    const { data: appt } = await admin
      .from('appointments')
      .select('id')
      .eq('stripe_payment_intent_id', params.paymentIntentId)
      .maybeSingle();
    if (appt?.id) appointmentId = appt.id;
  }

  if (!appointmentId && customerId) {
    const { data: appts } = await admin
      .from('appointments')
      .select('id, base_price_cents, deposit_amount_cents')
      .eq('customer_id', customerId)
      .in('status', ['awaiting_payment', 'pending', 'deposit_paid', 'confirmed', 'completed'])
      .order('scheduled_start', { ascending: false })
      .limit(10);
    
    const match = appts?.find(
      (a) =>
        a.deposit_amount_cents === params.amountCents ||
        a.base_price_cents === params.amountCents ||
        Math.abs((a.base_price_cents || 0) - (a.deposit_amount_cents || 0) - params.amountCents) < 100
    );
    if (match) appointmentId = match.id;
  }

  // 3. Upsert payment record
  const paymentRow: Record<string, any> = {
    customer_id: customerId,
    appointment_id: appointmentId,
    stripe_checkout_session_id: params.checkoutSessionId || null,
    stripe_payment_intent_id: params.paymentIntentId || params.chargeId,
    amount_cents: params.amountCents,
    status: 'succeeded',
    payment_method: 'stripe',
    payment_kind: 'deposit',
    paid_at: new Date(params.created * 1000).toISOString(),
    metadata: {
      fixed_via_diagnostics: true,
      charge_id: params.chargeId,
      customer_email: params.customerEmail,
      customer_name_from_stripe: params.customerName,
      fixed_by_user: session.user.email,
    },
  };

  const { error: insErr } = await admin.from('payments').upsert(paymentRow, { onConflict: 'stripe_payment_intent_id' });
  if (insErr) {
    throw new Error(`Database error: ${insErr.message}`);
  }

  // 4. Update appointment status on successful match
  if (appointmentId) {
    const { data: appt } = await admin.from('appointments').select('base_price_cents').eq('id', appointmentId).maybeSingle();
    const isFull = appt?.base_price_cents === params.amountCents;
    await admin.from('appointments').update({
      payment_status: isFull ? 'paid' : 'deposit_paid',
      status: isFull ? 'confirmed' : 'deposit_paid',
      updated_at: new Date().toISOString(),
    }).eq('id', appointmentId);
  }

  // 5. Sync balance transaction to financial ledger
  const secrets = await getStripeSecrets(admin);
  if (secrets.secretKey) {
    try {
      const stripe = new Stripe(secrets.secretKey);
      const charge = await stripe.charges.retrieve(params.chargeId);
      if (charge.balance_transaction) {
        const btId = typeof charge.balance_transaction === 'string' ? charge.balance_transaction : charge.balance_transaction.id;
        const bt = await stripe.balanceTransactions.retrieve(btId);
        const { upsertLedgerFromBalanceTransaction } = await import('@/lib/financial-ledger');
        await upsertLedgerFromBalanceTransaction(admin, bt, {
          paymentIntentId: params.paymentIntentId,
          chargeId: params.chargeId,
          workOrderId: appointmentId,
        });
      }
    } catch (err) {
      console.warn('[stripe-sync] failed to sync balance transaction from Stripe API', err);
      await admin.from('financial_ledger').insert({
        source: 'stripe',
        type: 'revenue',
        amount: params.amountCents,
        gross_amount: params.amountCents,
        fee_amount: Math.round(params.amountCents * 0.03),
        net_amount: Math.round(params.amountCents * 0.97),
        description: `Stripe sync diagnostic repair (Charge ${params.chargeId})`,
        category: 'charge',
        stripe_payment_intent_id: params.paymentIntentId,
        stripe_charge_id: params.chargeId,
        work_order_id: appointmentId,
        occurred_at: new Date(params.created * 1000).toISOString(),
      });
    }
  }

  revalidatePath('/admin/stripe-sync');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');

  return { ok: true, matchedAppointmentId: appointmentId };
}
