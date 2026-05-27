'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import type { Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export type StripeSyncResult = {
  ok: boolean;
  error?: string;
  appointmentId?: string;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
  matchedBefore: number;
  matchedAfter: number;
  attachedIds: string[];
  paymentRows: Array<{
    id: string;
    amount_cents: number;
    payment_kind: string;
    payment_method: string;
    status: string;
    appointment_id: string;
    stripe_checkout_session_id: string;
    stripe_payment_intent_id: string;
  }>;
};

export async function syncStripePaymentsForWorkOrderAction(formData: FormData): Promise<StripeSyncResult> {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false, error: 'Unauthorized', matchedBefore: 0, matchedAfter: 0, attachedIds: [], paymentRows: [] };
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return {
      ok: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY missing. Cannot sync Stripe payments.',
      matchedBefore: 0,
      matchedAfter: 0,
      attachedIds: [],
      paymentRows: [],
    };
  }

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const source = str(formData.get('source'));
  const table = source === 'fallback' || fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  if (!jobId) {
    return { ok: false, error: 'Missing work order id', matchedBefore: 0, matchedAfter: 0, attachedIds: [], paymentRows: [] };
  }

  const { data: jobRow } = await admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!jobRow) {
    return { ok: false, error: 'Work order not found', matchedBefore: 0, matchedAfter: 0, attachedIds: [], paymentRows: [] };
  }

  const job = jobRow as Row;
  const isFallback = table === 'booking_fallbacks';
  const stripeSessionId = str(job.stripe_checkout_session_id || job.final_payment_checkout_session_id);
  const stripePaymentIntent = str(job.stripe_payment_intent_id);

  const before = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : jobId,
    fallbackBookingId: isFallback ? jobId : undefined,
    isFallback,
  });

  const attachedIds: string[] = [];
  const candidates = new Map<string, Row>();

  const addCandidates = (rows: Row[] | null | undefined) => {
    for (const r of rows ?? []) {
      const id = str(r.id);
      if (id) candidates.set(id, r);
    }
  };

  if (stripeSessionId) {
    const { data } = await admin.from('payments').select('*').eq('stripe_checkout_session_id', stripeSessionId).limit(20);
    addCandidates(data as Row[]);
  }
  if (stripePaymentIntent) {
    const { data } = await admin.from('payments').select('*').eq('stripe_payment_intent_id', stripePaymentIntent).limit(20);
    addCandidates(data as Row[]);
  }

  const email = str(job.guest_email).toLowerCase();
  if (email.includes('@')) {
    const { data } = await admin.from('payments').select('*').ilike('email', email).order('paid_at', { ascending: false }).limit(30);
    addCandidates(data as Row[]);
  }

  const customerId = str(job.customer_id);
  if (customerId) {
    const { data } = await admin
      .from('payments')
      .select('*')
      .eq('customer_id', customerId)
      .order('paid_at', { ascending: false })
      .limit(30);
    addCandidates(data as Row[]);
  }

  for (const pay of candidates.values()) {
    const payId = str(pay.id);
    if (!payId) continue;
    const alreadyLinked =
      (!isFallback && str(pay.appointment_id) === jobId) || (isFallback && str(pay.fallback_booking_id) === jobId);
    if (alreadyLinked) continue;

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (!isFallback) {
      patch.appointment_id = jobId;
    } else {
      patch.fallback_booking_id = jobId;
    }
    if (!str(pay.payment_method)) {
      patch.payment_method = 'stripe';
    }
    const kind = str(pay.payment_kind).toLowerCase();
    if (!kind || kind === 'discount') {
      patch.payment_kind = stripeSessionId && str(pay.stripe_checkout_session_id) === stripeSessionId ? 'deposit' : 'stripe';
    }

    const { error } = await admin.from('payments').update(patch).eq('id', payId);
    if (!error) attachedIds.push(payId);
  }

  const after = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : jobId,
    fallbackBookingId: isFallback ? jobId : undefined,
    isFallback,
  });

  revalidatePath(`/tech/work-orders/${jobId}`);
  revalidatePath('/admin/work-orders');

  const paymentRows = after.map((p) => ({
    id: str(p.id),
    amount_cents: typeof p.amount_cents === 'number' ? p.amount_cents : 0,
    payment_kind: str(p.payment_kind),
    payment_method: str(p.payment_method),
    status: str(p.status),
    appointment_id: str(p.appointment_id),
    stripe_checkout_session_id: str(p.stripe_checkout_session_id),
    stripe_payment_intent_id: str(p.stripe_payment_intent_id),
  }));

  return {
    ok: true,
    appointmentId: isFallback ? undefined : jobId,
    stripeSessionId: stripeSessionId || undefined,
    stripePaymentIntent: stripePaymentIntent || undefined,
    matchedBefore: before.length,
    matchedAfter: after.length,
    attachedIds,
    paymentRows,
  };
}

export async function recordManualStripePaymentAction(formData: FormData): Promise<StripeSyncResult> {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false, error: 'Unauthorized', matchedBefore: 0, matchedAfter: 0, attachedIds: [], paymentRows: [] };
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return {
      ok: false,
      error: 'SUPABASE_SERVICE_ROLE_KEY missing.',
      matchedBefore: 0,
      matchedAfter: 0,
      attachedIds: [],
      paymentRows: [],
    };
  }

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const jobId = fallbackBookingId || appointmentId;
  const amountDollars = Number(str(formData.get('amountDollars')));
  const reason = str(formData.get('reason'));
  const reference = str(formData.get('reference'));
  if (!jobId || !Number.isFinite(amountDollars) || amountDollars <= 0) {
    return { ok: false, error: 'Invalid amount', matchedBefore: 0, matchedAfter: 0, attachedIds: [], paymentRows: [] };
  }
  if (!reason) {
    return { ok: false, error: 'Reason required for manual Stripe payment', matchedBefore: 0, matchedAfter: 0, attachedIds: [], paymentRows: [] };
  }

  const isFallback = Boolean(fallbackBookingId && !appointmentId);
  const { data: jobRow } = await admin
    .from(isFallback ? 'booking_fallbacks' : 'appointments')
    .select('*')
    .eq('id', jobId)
    .maybeSingle();
  if (!jobRow) {
    return { ok: false, error: 'Work order not found', matchedBefore: 0, matchedAfter: 0, attachedIds: [], paymentRows: [] };
  }

  const job = jobRow as Row;
  const before = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : jobId,
    fallbackBookingId: isFallback ? jobId : undefined,
    isFallback,
  });

  const cents = Math.round(amountDollars * 100);
  const { error } = await admin.from('payments').insert({
    appointment_id: isFallback ? null : jobId,
    fallback_booking_id: isFallback ? jobId : null,
    customer_id: str(job.customer_id) || null,
    email: str(job.guest_email) || null,
    amount_cents: cents,
    status: 'succeeded',
    payment_method: 'stripe',
    payment_kind: 'deposit',
    stripe_checkout_session_id: reference || str(job.stripe_checkout_session_id) || null,
    stripe_payment_intent_id: str(job.stripe_payment_intent_id) || null,
    paid_at: new Date().toISOString(),
    metadata: { manual_record: true, reason, recorded_by: session.user.id },
  });
  if (error) {
    return { ok: false, error: error.message, matchedBefore: before.length, matchedAfter: before.length, attachedIds: [], paymentRows: [] };
  }

  const after = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : jobId,
    fallbackBookingId: isFallback ? jobId : undefined,
    isFallback,
  });

  revalidatePath(`/tech/work-orders/${jobId}`);

  return {
    ok: true,
    matchedBefore: before.length,
    matchedAfter: after.length,
    attachedIds: [],
    paymentRows: after.map((p) => ({
      id: str(p.id),
      amount_cents: typeof p.amount_cents === 'number' ? p.amount_cents : 0,
      payment_kind: str(p.payment_kind),
      payment_method: str(p.payment_method),
      status: str(p.status),
      appointment_id: str(p.appointment_id),
      stripe_checkout_session_id: str(p.stripe_checkout_session_id),
      stripe_payment_intent_id: str(p.stripe_payment_intent_id),
    })),
  };
}
