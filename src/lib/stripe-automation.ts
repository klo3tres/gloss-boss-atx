import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { notifyBookingCheckoutPaid } from '@/lib/booking-checkout-notify';
import { notifyOwnerBookingEvent } from '@/lib/owner-alerts';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { upsertLedgerFromBalanceTransaction } from '@/lib/financial-ledger';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function isoFromUnix(seconds?: number | null) {
  return seconds ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
}

function stripeId(v: unknown) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && 'id' in v) return str((v as { id?: unknown }).id) || null;
  return null;
}

function metadataOf(obj: { metadata?: Stripe.Metadata | null } | null | undefined): Stripe.Metadata {
  return obj?.metadata ?? {};
}

async function safeInsertOutbox(admin: SupabaseClient, row: Row) {
  try {
    const { error } = await admin.from('notification_outbox').insert({
      channel: 'internal',
      provider: 'system',
      status: 'accepted',
      created_at: new Date().toISOString(),
      ...row,
    });
    if (error && !isSchemaDriftError(error.message)) console.warn('[stripe-automation] notification_outbox', error.message);
  } catch (e) {
    console.warn('[stripe-automation] notification_outbox', e);
  }
}

async function safeActivity(admin: SupabaseClient, action: string, entityType: string, entityId: string | null, meta: Row) {
  try {
    await admin.from('activity_logs').insert({
      action,
      entity_type: entityType,
      entity_id: entityId,
      meta,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Activity logs are best effort only.
  }
}

async function hasExistingReceiptNotification(admin: SupabaseClient, appointmentId: string, amountCents: number) {
  try {
    const { data, error } = await admin
      .from('notification_outbox')
      .select('id, kind, payload, created_at')
      .eq('appointment_id', appointmentId)
      .in('kind', ['deposit_receipt', 'payment_receipt'])
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) return false;
    return ((data ?? []) as Row[]).some((row) => {
      const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Row;
      const notifiedAmount = Number(payload.amount_cents ?? payload.paid_cents ?? 0);
      return notifiedAmount === amountCents;
    });
  } catch {
    return false;
  }
}

async function maybeFindAppointment(admin: SupabaseClient, input: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  checkoutSessionId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  customerEmail?: string | null;
  amountCents?: number;
  occurredAt?: string;
}) {
  const appointmentId = str(input.appointmentId);
  if (appointmentId) {
    const { data } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
    if (data) return { appointment: data as Row, fallback: null as Row | null };
  }

  const fallbackBookingId = str(input.fallbackBookingId);
  if (fallbackBookingId) {
    const { data } = await admin.from('booking_fallbacks').select('*').eq('id', fallbackBookingId).maybeSingle();
    if (data) return { appointment: null as Row | null, fallback: data as Row };
  }

  const sessionId = str(input.checkoutSessionId);
  if (sessionId) {
    const { data: appt } = await admin.from('appointments').select('*').eq('stripe_checkout_session_id', sessionId).maybeSingle();
    if (appt) return { appointment: appt as Row, fallback: null as Row | null };
    const { data: fallback } = await admin.from('booking_fallbacks').select('*').eq('stripe_checkout_session_id', sessionId).maybeSingle();
    if (fallback) return { appointment: null as Row | null, fallback: fallback as Row };
  }

  const pi = str(input.paymentIntentId);
  const charge = str(input.chargeId);
  if (pi || charge) {
    const { data } = pi
      ? await admin.from('payments').select('appointment_id, fallback_booking_id').eq('stripe_payment_intent_id', pi).limit(1)
      : await admin.from('payments').select('appointment_id, fallback_booking_id').eq('stripe_charge_id', charge).limit(1);
    const p = data?.[0] as Row | undefined;
    if (p?.appointment_id) {
      const { data: appt } = await admin.from('appointments').select('*').eq('id', String(p.appointment_id)).maybeSingle();
      if (appt) return { appointment: appt as Row, fallback: null as Row | null };
    }
    if (p?.fallback_booking_id) {
      const { data: fallback } = await admin.from('booking_fallbacks').select('*').eq('id', String(p.fallback_booking_id)).maybeSingle();
      if (fallback) return { appointment: null as Row | null, fallback: fallback as Row };
    }
  }

  const email = str(input.customerEmail).toLowerCase();
  if (email.includes('@')) {
    const { data } = await admin
      .from('appointments')
      .select('*')
      .ilike('guest_email', email)
      .order('created_at', { ascending: false })
      .limit(12);
    const rows = (data ?? []) as Row[];
    const amount = input.amountCents ?? 0;
    const best = rows.find((r) => {
      const base = typeof r.base_price_cents === 'number' ? r.base_price_cents : 0;
      const deposit = typeof r.deposit_amount_cents === 'number' ? r.deposit_amount_cents : 0;
      return amount > 0 && (Math.abs(amount - base) <= 2 || Math.abs(amount - deposit) <= 2);
    }) ?? rows[0];
    if (best) return { appointment: best, fallback: null as Row | null };
  }

  return { appointment: null as Row | null, fallback: null as Row | null };
}

async function upsertPayment(admin: SupabaseClient, row: Row): Promise<Row | null> {
  const pi = str(row.stripe_payment_intent_id);
  const session = str(row.stripe_checkout_session_id);
  const charge = str(row.stripe_charge_id);

  let existing: Row | null = null;
  if (pi) {
    const { data } = await admin.from('payments').select('*').eq('stripe_payment_intent_id', pi).maybeSingle();
    existing = (data as Row | null) ?? null;
  }
  if (!existing && session) {
    const { data } = await admin.from('payments').select('*').eq('stripe_checkout_session_id', session).maybeSingle();
    existing = (data as Row | null) ?? null;
  }
  if (!existing && charge) {
    const { data, error } = await admin.from('payments').select('*').eq('stripe_charge_id', charge).maybeSingle();
    if (!error) existing = (data as Row | null) ?? null;
  }

  if (existing?.id) {
    const { data, error } = await admin.from('payments').update(row).eq('id', existing.id).select('*').maybeSingle();
    if (!error) return (data as Row | null) ?? { ...existing, ...row };
    if (!isSchemaDriftError(error.message)) console.warn('[stripe-automation] payment update', error.message);
    return existing;
  }

  const { data, error } = await admin.from('payments').insert(row).select('*').maybeSingle();
  if (!error) return data as Row | null;
  if (isSchemaDriftError(error.message)) {
    const lean = {
      appointment_id: row.appointment_id ?? null,
      stripe_checkout_session_id: row.stripe_checkout_session_id ?? null,
      stripe_payment_intent_id: row.stripe_payment_intent_id ?? null,
      amount_cents: row.amount_cents ?? 0,
      status: row.status ?? 'succeeded',
    };
    const leanInsert = await admin.from('payments').insert(lean).select('*').maybeSingle();
    if (!leanInsert.error) return leanInsert.data as Row | null;
  }
  console.warn('[stripe-automation] payment insert', error.message);
  return null;
}

async function ensureReceipt(admin: SupabaseClient, payment: Row | null, input: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  customerId?: string | null;
  amountCents: number;
  method: string;
  status?: string;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
}) {
  const paymentId = str(payment?.id);
  if (paymentId) {
    const { data: existing } = await admin.from('receipts').select('*').eq('payment_id', paymentId).maybeSingle();
    if (existing) return existing as Row;
  }

  const ref = paymentId || str(input.paymentIntentId) || str(input.chargeId) || str(input.sessionId) || str(input.appointmentId) || str(input.fallbackBookingId) || 'stripe';
  const receiptNumber = `RCPT-${ref.slice(-8).toUpperCase()}`;
  const row: Row = {
    appointment_id: input.appointmentId || null,
    fallback_booking_id: input.fallbackBookingId || null,
    customer_id: input.customerId || null,
    payment_id: paymentId || null,
    receipt_number: receiptNumber,
    amount_cents: input.amountCents,
    payment_method: input.method,
    status: input.status ?? 'issued',
    paid_at: new Date().toISOString(),
    metadata: {
      source: 'stripe_automation',
      stripe_checkout_session_id: input.sessionId || null,
      stripe_payment_intent_id: input.paymentIntentId || null,
      stripe_charge_id: input.chargeId || null,
    },
  };
  let ins = await admin.from('receipts').insert(row).select('*').maybeSingle();
  if (ins.error && isSchemaDriftError(ins.error.message)) {
    ins = await admin.from('receipts').insert({
      appointment_id: input.appointmentId || null,
      payment_id: paymentId || null,
      receipt_number: receiptNumber,
      amount_cents: input.amountCents,
      payment_method: input.method,
      status: input.status ?? 'issued',
    }).select('*').maybeSingle();
  }
  if (ins.error) {
    console.warn('[stripe-automation] receipt insert', ins.error.message);
    return null;
  }
  return ins.data as Row | null;
}

async function updateJobAfterPayment(admin: SupabaseClient, appointment: Row | null, amountCents: number) {
  if (!appointment?.id) return { remainingCents: 0, totalCents: amountCents, kind: 'deposit' as const };
  const appointmentId = String(appointment.id);
  const payments = await fetchPaymentsForJob(admin, appointment, { appointmentId });
  const pricing = resolveJobPricing(appointment, payments);
  await syncJobBalanceDue(admin, appointment, pricing, { appointmentId });
  const remainingCents = pricing.remainingBalanceCents;
  const totalCents = pricing.finalTotalCents;
  const now = new Date().toISOString();
  const patch =
    remainingCents <= 0
      ? { payment_status: 'paid', balance_due_cents: 0, paid_at: now, updated_at: now }
      : { payment_status: 'deposit_paid', balance_due_cents: remainingCents, deposit_paid_at: now, updated_at: now };
  const { error } = await admin.from('appointments').update(patch).eq('id', appointmentId);
  if (error && !isSchemaDriftError(error.message)) console.warn('[stripe-automation] appointment payment patch', error.message);
  return {
    remainingCents,
    totalCents,
    kind: remainingCents <= 0 ? 'booking_full' as const : 'deposit' as const,
  };
}

export async function automateStripePayment(params: {
  admin: SupabaseClient;
  stripe?: Stripe;
  session?: Stripe.Checkout.Session | null;
  paymentIntent?: Stripe.PaymentIntent | null;
  charge?: Stripe.Charge | null;
  eventType: string;
  sendCustomerReceipt?: boolean;
}) {
  const session = params.session ?? null;
  const pi = params.paymentIntent ?? null;
  const charge = params.charge ?? null;
  const meta = { ...metadataOf(session), ...metadataOf(pi), ...metadataOf(charge) };
  const sessionId = session?.id ?? (str(meta.checkout_session_id) || null);
  const paymentIntentId = stripeId(session?.payment_intent) ?? pi?.id ?? stripeId(charge?.payment_intent);
  const chargeId = charge?.id ?? stripeId(pi?.latest_charge);
  const amountCents = session?.amount_total ?? pi?.amount_received ?? pi?.amount ?? charge?.amount ?? 0;
  const occurredAt = isoFromUnix(session?.created ?? pi?.created ?? charge?.created);
  const customerEmail =
    session?.customer_details?.email ?? session?.customer_email ?? pi?.receipt_email ?? charge?.billing_details?.email ?? (str(meta.customer_email) || null);
  const customerName = session?.customer_details?.name ?? charge?.billing_details?.name ?? (str(meta.customer_name) || null);

  const found = await maybeFindAppointment(params.admin, {
    appointmentId: str(meta.appointment_id) || null,
    fallbackBookingId: str(meta.fallback_booking_id) || null,
    checkoutSessionId: sessionId,
    paymentIntentId,
    chargeId,
    customerEmail,
    amountCents,
    occurredAt,
  });
  const appointment = found.appointment;
  const fallback = found.fallback;
  const appointmentId = str(appointment?.id) || null;
  const fallbackBookingId = str(fallback?.id) || null;
  const customerId = str(appointment?.customer_id) || str(fallback?.customer_id) || null;

  const payment = await upsertPayment(params.admin, {
    appointment_id: appointmentId,
    fallback_booking_id: fallbackBookingId,
    customer_id: customerId,
    amount_cents: amountCents,
    status: charge?.status === 'failed' || pi?.status === 'requires_payment_method' ? 'failed' : 'succeeded',
    payment_method: 'stripe',
    payment_kind: str(meta.stripe_checkout_kind) || str(meta.payment_type) || 'stripe_automated',
    provider: 'stripe',
    stripe_checkout_session_id: sessionId,
    stripe_payment_intent_id: paymentIntentId,
    stripe_charge_id: chargeId,
    paid_at: occurredAt,
    created_at: occurredAt,
    exclude_from_revenue: false,
    is_test: false,
    metadata: {
      source: 'stripe_webhook_automation',
      event_type: params.eventType,
      customer_email: customerEmail,
      customer_name: customerName,
    },
  });

  const receipt = await ensureReceipt(params.admin, payment, {
    appointmentId,
    fallbackBookingId,
    customerId,
    amountCents,
    method: 'stripe',
    sessionId,
    paymentIntentId,
    chargeId,
  });

  let totals = { remainingCents: 0, totalCents: amountCents, kind: 'deposit' as 'deposit' | 'booking_full' };
  if (appointment) totals = await updateJobAfterPayment(params.admin, appointment, amountCents);

  if (appointmentId) {
    await recordJobTimelineEvent(params.admin, {
      appointmentId,
      eventType: 'payment_received',
      meta: {
        amount_cents: amountCents,
        stripe_checkout_session_id: sessionId,
        stripe_payment_intent_id: paymentIntentId,
        stripe_charge_id: chargeId,
        receipt_id: receipt?.id ?? null,
      },
    });
    await safeActivity(params.admin, 'stripe_payment_automated', 'appointment', appointmentId, {
      amount_cents: amountCents,
      payment_id: payment?.id ?? null,
      receipt_id: receipt?.id ?? null,
    });
    const alreadyNotified = await hasExistingReceiptNotification(params.admin, appointmentId, amountCents);
    if (params.sendCustomerReceipt !== false && !alreadyNotified) {
      await notifyBookingCheckoutPaid({
        admin: params.admin,
        appointmentId,
        paidCents: amountCents,
        paymentKind: totals.kind,
      }).catch((e) => console.warn('[stripe-automation] customer receipt notify', e));
    }
  }

  await safeInsertOutbox(params.admin, {
    kind: appointmentId ? 'stripe_payment_automated' : 'stripe_payment_unmatched',
    template_key: appointmentId ? 'stripe_payment_automated' : 'stripe_payment_unmatched',
    appointment_id: appointmentId,
    fallback_booking_id: fallbackBookingId,
    payload: {
      amount_cents: amountCents,
      amount: dollars(amountCents),
      payment_id: payment?.id ?? null,
      receipt_id: receipt?.id ?? null,
      stripe_checkout_session_id: sessionId,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      customer_email: customerEmail,
      matched: Boolean(appointmentId || fallbackBookingId),
    },
  });

  if (!appointmentId && !fallbackBookingId) {
    await notifyOwnerBookingEvent({
      kind: 'payment_failed',
      guestName: customerName ?? 'Unmatched Stripe customer',
      guestEmail: customerEmail ?? 'unknown',
      totalCents: amountCents,
      paidCents: amountCents,
      extraNote: `Stripe payment succeeded but could not be matched automatically. Charge ${chargeId ?? 'n/a'} PI ${paymentIntentId ?? 'n/a'}. Use Advanced Repair Tools only for this edge case.`,
    }).catch((e) => console.warn('[stripe-automation] unmatched owner alert', e));
  }

  if (params.stripe && charge?.balance_transaction) {
    try {
      const txId = stripeId(charge.balance_transaction);
      if (txId) {
        const tx = await params.stripe.balanceTransactions.retrieve(txId);
        await upsertLedgerFromBalanceTransaction(params.admin, tx, {
          paymentIntentId,
          chargeId,
          workOrderId: appointmentId,
        });
      }
    } catch (e) {
      console.warn('[stripe-automation] balance transaction sync', e);
    }
  }

  return { payment, receipt, appointmentId, fallbackBookingId };
}

export async function automateStripeRefund(params: {
  admin: SupabaseClient;
  stripe?: Stripe;
  refund?: Stripe.Refund | null;
  charge?: Stripe.Charge | null;
  eventType: string;
}) {
  const refund = params.refund ?? null;
  const charge = params.charge ?? null;
  const paymentIntentId = stripeId(refund?.payment_intent) ?? stripeId(charge?.payment_intent);
  const chargeId = refund ? stripeId(refund.charge) : charge?.id ?? null;
  const amountCents = refund?.amount ?? charge?.amount_refunded ?? 0;
  const occurredAt = isoFromUnix(refund?.created ?? charge?.created);

  if (paymentIntentId) {
    await params.admin.from('payments').update({
      refunded_at: occurredAt,
      refunded_amount_cents: amountCents,
      status: amountCents > 0 ? 'refunded' : 'succeeded',
    }).eq('stripe_payment_intent_id', paymentIntentId);
  }

  await safeInsertOutbox(params.admin, {
    kind: 'stripe_refund_recorded',
    template_key: 'stripe_refund_recorded',
    payload: {
      amount_cents: amountCents,
      stripe_payment_intent_id: paymentIntentId,
      stripe_charge_id: chargeId,
      event_type: params.eventType,
    },
  });
}
