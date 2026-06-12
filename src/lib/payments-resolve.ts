import type { SupabaseClient } from '@supabase/supabase-js';
import { isPaymentVoided, isRealStripeDeposit } from '@/lib/payment-classification';
import type { Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function digits(v: unknown) {
  return str(v).replace(/\D/g, '');
}

function isSucceeded(row: Row) {
  const st = str(row.status).toLowerCase();
  return st === 'succeeded' || st === 'paid' || st === 'comped' || st === 'manual_comped';
}

function belongsToJob(
  row: Row,
  refs: { appointmentId?: string; fallbackBookingId?: string; sessionId?: string; paymentIntentId?: string },
) {
  const appointmentId = str(refs.appointmentId);
  const fallbackId = str(refs.fallbackBookingId);
  const sessionId = str(refs.sessionId);
  const paymentIntentId = str(refs.paymentIntentId);
  const rowAppointmentId = str(row.appointment_id);
  const rowFallbackId = str(row.fallback_booking_id);
  const rowSessionId = str(row.stripe_checkout_session_id);
  const rowPaymentIntent = str(row.stripe_payment_intent_id);

  if (appointmentId && rowAppointmentId === appointmentId) return true;
  if (fallbackId && rowFallbackId === fallbackId) return true;
  if (sessionId && rowSessionId === sessionId) return true;
  if (paymentIntentId && rowPaymentIntent === paymentIntentId) return true;
  return false;
}

/** Collect payment rows linked to exactly one work order. Do not infer by customer/email/phone. */
export async function fetchPaymentsForJob(
  admin: SupabaseClient,
  job: Row,
  opts: { appointmentId?: string; fallbackBookingId?: string; isFallback?: boolean },
): Promise<Row[]> {
  const appointmentId = str(opts.appointmentId || job.id);
  const fallbackId = str(opts.fallbackBookingId || (opts.isFallback ? job.id : ''));
  const sessionId = str(job.stripe_checkout_session_id || job.final_payment_checkout_session_id);
  const paymentIntentId = str(job.stripe_payment_intent_id || job.final_payment_intent_id);

  const byId = new Map<string, Row>();

  const merge = (rows: Row[] | null | undefined) => {
    for (const r of rows ?? []) {
      const id = str(r.id);
      if (id) byId.set(id, r);
    }
  };

  if (appointmentId && !opts.isFallback) {
    const { data } = await admin.from('payments').select('*').eq('appointment_id', appointmentId).order('paid_at', { ascending: false }).limit(50);
    merge(data as Row[]);
  }
  if (fallbackId) {
    const { data } = await admin.from('payments').select('*').eq('fallback_booking_id', fallbackId).order('paid_at', { ascending: false }).limit(50);
    merge(data as Row[]);
  }

  if (sessionId) {
    const { data } = await admin.from('payments').select('*').eq('stripe_checkout_session_id', sessionId).limit(10);
    merge(data as Row[]);
  }

  if (paymentIntentId) {
    const { data: byIntent } = await admin.from('payments').select('*').eq('stripe_payment_intent_id', paymentIntentId).limit(10);
    merge(byIntent as Row[]);
  }

  return [...byId.values()]
    .filter((row) => belongsToJob(row, { appointmentId: opts.isFallback ? undefined : appointmentId, fallbackBookingId: fallbackId, sessionId, paymentIntentId }))
    .filter(isSucceeded);
}

export function findDepositPayment(payments: Row[]): Row | null {
  for (const p of payments) {
    if (isRealStripeDeposit(p)) return p;
  }
  return null;
}

/** Diagnostic only: customer payments that are not linked to this work order and must not affect totals. */
export async function fetchUnassignedCustomerPaymentsForDiagnostics(
  admin: SupabaseClient,
  job: Row,
  opts: { appointmentId?: string; fallbackBookingId?: string; isFallback?: boolean },
): Promise<Row[]> {
  const customerId = str(job.customer_id);
  const email = str(job.guest_email).toLowerCase();
  const phone = digits(job.guest_phone);
  const appointmentId = str(opts.appointmentId || (!opts.isFallback ? job.id : ''));
  const fallbackId = str(opts.fallbackBookingId || (opts.isFallback ? job.id : ''));
  const sessionId = str(job.stripe_checkout_session_id || job.final_payment_checkout_session_id);
  const paymentIntentId = str(job.stripe_payment_intent_id || job.final_payment_intent_id);
  const byId = new Map<string, Row>();

  const merge = (rows: Row[] | null | undefined) => {
    for (const r of rows ?? []) {
      const id = str(r.id);
      if (id) byId.set(id, r);
    }
  };

  if (customerId) {
    const { data } = await admin.from('payments').select('*').eq('customer_id', customerId).order('paid_at', { ascending: false }).limit(60);
    merge(data as Row[]);
  }
  if (email.includes('@')) {
    const { data } = await admin.from('payments').select('*').ilike('email', email).order('paid_at', { ascending: false }).limit(30);
    merge(data as Row[]);
  }
  if (phone.length >= 10) {
    const { data } = await admin.from('payments').select('*').ilike('phone', `%${phone.slice(-10)}`).order('paid_at', { ascending: false }).limit(30);
    merge(data as Row[]);
  }

  return [...byId.values()]
    .filter((row) => isSucceeded(row) && !isPaymentVoided(row))
    .filter((row) => !belongsToJob(row, { appointmentId, fallbackBookingId: fallbackId, sessionId, paymentIntentId }))
    .slice(0, 30);
}
