'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import type { Row } from '@/lib/work-order-resolve';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { upsertLedgerFromBalanceTransaction } from '@/lib/financial-ledger';
import { resolveStripePaymentTarget, upsertMergedStripePayment } from '@/lib/stripe-payment-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export type StripeSyncResult = {
  ok: boolean;
  error?: string;
  blocker?: string;
  diagnostics?: string[];
  appointmentId?: string;
  stripeSessionId?: string;
  stripePaymentIntent?: string;
  stripeChargeId?: string;
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

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function emailOfCharge(charge: Stripe.Charge | null | undefined) {
  return str(charge?.billing_details?.email).toLowerCase();
}

function emailOfSession(session: Stripe.Checkout.Session | null | undefined) {
  return str(session?.customer_details?.email || session?.customer_email).toLowerCase();
}

function emailOfIntent(pi: Stripe.PaymentIntent | null | undefined) {
  return str(pi?.receipt_email).toLowerCase();
}

async function upsertStripePaymentForJob(params: {
  admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>;
  stripe: Stripe;
  job: Row;
  jobId: string;
  isFallback: boolean;
  sessionObj?: Stripe.Checkout.Session | null;
  paymentIntent?: Stripe.PaymentIntent | null;
  charge?: Stripe.Charge | null;
  sourceReason: string;
}) {
  const { admin, stripe, job, jobId, isFallback, sessionObj, paymentIntent, charge } = params;
  const paymentIntentId = str(paymentIntent?.id || (typeof sessionObj?.payment_intent === 'string' ? sessionObj.payment_intent : sessionObj?.payment_intent?.id) || (typeof charge?.payment_intent === 'string' ? charge.payment_intent : ''));
  const chargeId = str(charge?.id || (typeof paymentIntent?.latest_charge === 'string' ? paymentIntent.latest_charge : paymentIntent?.latest_charge?.id));
  const sessionId = str(sessionObj?.id || job.stripe_checkout_session_id || job.final_payment_checkout_session_id);
  const amountCents = cents(sessionObj?.amount_total) || cents(paymentIntent?.amount_received) || cents(paymentIntent?.amount) || cents(charge?.amount);
  if (amountCents <= 0) return { ok: false as const, error: 'Stripe API object lacks required amount fields.', paymentId: null as string | null };
  const status = charge?.status === 'failed' || paymentIntent?.status === 'requires_payment_method' ? 'failed' : 'succeeded';
  if (status !== 'succeeded') return { ok: false as const, error: `Stripe object is not succeeded. Current status: ${status}.`, paymentId: null as string | null };
  const paidAt = new Date(((sessionObj?.created ?? paymentIntent?.created ?? charge?.created ?? Math.floor(Date.now() / 1000)) as number) * 1000).toISOString();

  const target = await resolveStripePaymentTarget(admin, stripe, {
    session: sessionObj,
    paymentIntent,
    charge,
    sessionId,
    paymentIntentId,
    chargeId,
    amountCents,
    customerEmail: str(job.guest_email) || emailOfSession(sessionObj) || emailOfIntent(paymentIntent) || emailOfCharge(charge),
    metadata: {
      ...sessionObj?.metadata,
      ...paymentIntent?.metadata,
      ...charge?.metadata,
    },
  });

  const merged = await upsertMergedStripePayment(admin, stripe, {
    appointmentId: isFallback ? null : target.appointmentId ?? jobId,
    fallbackBookingId: isFallback ? target.fallbackBookingId ?? jobId : null,
    customerId: str(job.customer_id) || target.customerId,
    amountCents,
    status,
    paymentKind: str(sessionObj?.metadata?.stripe_checkout_kind || paymentIntent?.metadata?.stripe_checkout_kind || charge?.metadata?.stripe_checkout_kind) || 'stripe_repair',
    stripeCheckoutSessionId: sessionId || null,
    stripePaymentIntentId: paymentIntentId || null,
    stripeChargeId: chargeId || null,
    paidAt,
    email: str(job.guest_email) || emailOfSession(sessionObj) || emailOfIntent(paymentIntent) || emailOfCharge(charge) || null,
    source: 'work_order_stripe_repair',
    matchReason: params.sourceReason,
    metadata: {
      reason: params.sourceReason,
      stripe_customer_email: emailOfSession(sessionObj) || emailOfIntent(paymentIntent) || emailOfCharge(charge) || null,
    },
  });

  if (!merged.ok) {
    return { ok: false as const, error: merged.error ?? 'Payment write failed.', paymentId: null as string | null };
  }

  return { ok: true as const, error: null, paymentId: merged.paymentId };
}

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
  const stripePaymentIntent = str(job.stripe_payment_intent_id || job.final_payment_intent_id);
  const jobEmail = str(job.guest_email).toLowerCase();
  const expectedAmounts = Array.from(new Set([
    cents(job.deposit_amount_cents),
    cents(job.base_price_cents),
    cents(job.final_total_cents),
    cents(job.balance_due_cents),
  ].filter((n) => n > 0)));

  const before = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : jobId,
    fallbackBookingId: isFallback ? jobId : undefined,
    isFallback,
  });

  const diagnostics: string[] = [
    `Work order table: ${table}`,
    `Work order id: ${jobId}`,
    `Expected amounts: ${expectedAmounts.map(money).join(', ') || 'none'}`,
    `Customer email: ${jobEmail || 'missing'}`,
    `Stored checkout session: ${stripeSessionId || 'missing'}`,
    `Stored payment intent: ${stripePaymentIntent || 'missing'}`,
  ];

  const secrets = await getStripeSecrets(admin);
  if (!secrets.secretKey) {
    return { ok: false, blocker: 'missing_stripe_secret_key', error: 'Missing Stripe secret key. Add STRIPE_SECRET_KEY in Vercel or Admin > Stripe setup.', diagnostics, matchedBefore: before.length, matchedAfter: before.length, attachedIds: [], paymentRows: [] };
  }
  if (!secrets.webhookSecret) diagnostics.push('Webhook signing secret missing. Manual repair can still run, but automatic webhook writes will not verify.');
  const stripeMode = secrets.secretKey.startsWith('sk_live') ? 'live' : secrets.secretKey.startsWith('sk_test') ? 'test' : 'unknown';
  diagnostics.push(`Stripe key mode: ${stripeMode}`);
  if (stripeMode !== 'live') diagnostics.push('Live production payment may be invisible with a non-live Stripe key.');

  let stripe: Stripe;
  try {
    stripe = new Stripe(secrets.secretKey);
    const account = await stripe.accounts.retrieve();
    diagnostics.push(`Stripe account reachable: ${account.id}`);
  } catch (e) {
    return { ok: false, blocker: 'wrong_stripe_secret_key', error: `Stripe API rejected this secret key: ${e instanceof Error ? e.message : String(e)}`, diagnostics, matchedBefore: before.length, matchedAfter: before.length, attachedIds: [], paymentRows: [] };
  }

  let sessionObj: Stripe.Checkout.Session | null = null;
  let paymentIntent: Stripe.PaymentIntent | null = null;
  let charge: Stripe.Charge | null = null;
  let sourceReason = '';

  try {
    if (stripeSessionId) {
      sessionObj = await stripe.checkout.sessions.retrieve(stripeSessionId, { expand: ['payment_intent', 'payment_intent.latest_charge'] });
      diagnostics.push(`Checkout session found: ${sessionObj.id} / ${money(cents(sessionObj.amount_total))} / ${sessionObj.payment_status}`);
      paymentIntent = typeof sessionObj.payment_intent === 'object' ? sessionObj.payment_intent as Stripe.PaymentIntent : null;
      const latest = paymentIntent?.latest_charge;
      charge = typeof latest === 'object' ? latest as Stripe.Charge : null;
      sourceReason = 'exact_checkout_session_id';
    }
  } catch (e) {
    diagnostics.push(`Stored checkout session retrieve failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!paymentIntent && stripePaymentIntent) {
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(stripePaymentIntent, { expand: ['latest_charge'] });
      diagnostics.push(`Payment intent found: ${paymentIntent.id} / ${money(cents(paymentIntent.amount_received || paymentIntent.amount))} / ${paymentIntent.status}`);
      const latest = paymentIntent.latest_charge;
      charge = typeof latest === 'object' ? latest as Stripe.Charge : null;
      sourceReason = 'exact_payment_intent_id';
    } catch (e) {
      diagnostics.push(`Stored payment intent retrieve failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  if (!charge && !paymentIntent && !sessionObj && expectedAmounts.length > 0) {
    const charges = await stripe.charges.list({ limit: 100 });
    const amountMatches = charges.data.filter((c) => c.status === 'succeeded' && expectedAmounts.includes(c.amount));
    diagnostics.push(`Stripe charge fallback scan: ${amountMatches.length} succeeded amount match(es) in latest 100 charges.`);
    const emailMatches = amountMatches.filter((c) => !jobEmail || emailOfCharge(c) === jobEmail);
    if (amountMatches.length > 0 && emailMatches.length === 0 && jobEmail) {
      diagnostics.push(`Customer email mismatch. Amount matched Stripe, but none used ${jobEmail}. Stripe emails: ${amountMatches.map((c) => emailOfCharge(c) || 'none').join(', ')}`);
    }
    const picked = emailMatches[0] ?? (jobEmail ? null : amountMatches[0]);
    if (picked) {
      charge = picked;
      if (typeof picked.payment_intent === 'string') {
        paymentIntent = await stripe.paymentIntents.retrieve(picked.payment_intent, { expand: ['latest_charge'] }).catch(() => null);
      }
      sourceReason = 'fallback_amount_email_charge_match';
      diagnostics.push(`Fallback charge selected: ${picked.id} / ${money(picked.amount)} / ${emailOfCharge(picked) || 'no email'}`);
    }
  }

  if (!sessionObj && !paymentIntent && !charge) {
    const blocker = stripeMode !== 'live' ? 'wrong_environment_live_test_mismatch' : (!stripeSessionId && !stripePaymentIntent ? 'missing_payment_intent_metadata' : 'stripe_api_object_not_found');
    return {
      ok: false,
      blocker,
      error: blocker === 'wrong_environment_live_test_mismatch'
        ? 'Stripe key is not live mode, so the live $58.14 payment cannot be read.'
        : 'No Stripe session, payment intent, or high-confidence charge match was found. Add Stripe metadata or paste the exact Session/PaymentIntent in the manual link tool.',
      diagnostics,
      matchedBefore: before.length,
      matchedAfter: before.length,
      attachedIds: [],
      paymentRows: [],
    };
  }

  const stripeEmail = emailOfSession(sessionObj) || emailOfIntent(paymentIntent) || emailOfCharge(charge);
  if (jobEmail && stripeEmail && stripeEmail !== jobEmail && sourceReason === 'fallback_amount_email_charge_match') {
    return { ok: false, blocker: 'customer_email_mismatch', error: `Stripe customer email ${stripeEmail} does not match work order email ${jobEmail}.`, diagnostics, matchedBefore: before.length, matchedAfter: before.length, attachedIds: [], paymentRows: [] };
  }

  const write = await upsertStripePaymentForJob({
    admin,
    stripe,
    job,
    jobId,
    isFallback,
    sessionObj,
    paymentIntent,
    charge,
    sourceReason,
  });
  if (!write.ok) {
    return { ok: false, blocker: write.error?.toLowerCase().includes('duplicate') ? 'duplicate_key_conflict' : 'database_constraint_or_insert_failed', error: write.error ?? 'Payment write failed.', diagnostics, matchedBefore: before.length, matchedAfter: before.length, attachedIds: [], paymentRows: [] };
  }

  const after = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : jobId,
    fallbackBookingId: isFallback ? jobId : undefined,
    isFallback,
  });

  revalidatePath(`/tech/work-orders/${jobId}`);
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');

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
    stripePaymentIntent: str(paymentIntent?.id || stripePaymentIntent) || undefined,
    stripeChargeId: str(charge?.id) || undefined,
    diagnostics,
    matchedBefore: before.length,
    matchedAfter: after.length,
    attachedIds: write.paymentId ? [write.paymentId] : [],
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
