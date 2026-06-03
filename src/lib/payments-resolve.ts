import type { SupabaseClient } from '@supabase/supabase-js';
import { isRealStripeDeposit } from '@/lib/payment-classification';
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

/** Collect payment rows linked to a work order by id, customer, email, phone, or Stripe session. */
export async function fetchPaymentsForJob(
  admin: SupabaseClient,
  job: Row,
  opts: { appointmentId?: string; fallbackBookingId?: string; isFallback?: boolean },
): Promise<Row[]> {
  const appointmentId = str(opts.appointmentId || job.id);
  const fallbackId = str(opts.fallbackBookingId || (opts.isFallback ? job.id : ''));
  const customerId = str(job.customer_id);
  const email = str(job.guest_email).toLowerCase();
  const phone = digits(job.guest_phone);
  const sessionId = str(job.stripe_checkout_session_id || job.final_payment_checkout_session_id);

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

  if (customerId) {
    const { data } = await admin
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('paid_at', { ascending: false })
      .limit(30);
    merge(data as Row[]);
  }

  if (email.includes('@')) {
    const { data } = await admin.from('payments').select('*').ilike('email', email).order('paid_at', { ascending: false }).limit(20);
    merge(data as Row[]);
    const { data: meta } = await admin
      .from('payments')
      .select('*')
      .contains('metadata', { guest_email: email })
      .order('paid_at', { ascending: false })
      .limit(10);
    if (meta) merge(meta as Row[]);
  }

  if (phone.length >= 10) {
    const tail = phone.slice(-10);
    const { data } = await admin.from('payments').select('*').ilike('phone', `%${tail}`).order('paid_at', { ascending: false }).limit(20);
    merge(data as Row[]);
  }

  return [...byId.values()].filter(isSucceeded);
}

export function findDepositPayment(payments: Row[]): Row | null {
  for (const p of payments) {
    if (isRealStripeDeposit(p)) return p;
  }
  return null;
}
