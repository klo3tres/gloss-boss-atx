import type Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { upsertLedgerFromBalanceTransaction } from '@/lib/financial-ledger';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function metaStr(meta: Stripe.Metadata | Record<string, unknown> | null | undefined, key: string) {
  const v = meta?.[key];
  return v == null ? '' : String(v).trim();
}

export type StripePaymentTarget = {
  appointmentId: string | null;
  fallbackBookingId: string | null;
  customerId: string | null;
  matchReason: string;
  confidence: 'high' | 'medium' | 'low';
};

export type ResolveStripePaymentInput = {
  session?: Stripe.Checkout.Session | null;
  paymentIntent?: Stripe.PaymentIntent | null;
  charge?: Stripe.Charge | null;
  sessionId?: string | null;
  paymentIntentId?: string | null;
  chargeId?: string | null;
  amountCents?: number;
  customerEmail?: string | null;
  metadata?: Stripe.Metadata | Record<string, unknown> | null;
};

function mergedMetadata(...sources: Array<Stripe.Metadata | Record<string, unknown> | null | undefined>) {
  return Object.assign({}, ...sources.filter(Boolean)) as Record<string, string>;
}

/** Resolve work order / appointment for a Stripe payment object. */
export async function resolveStripePaymentTarget(
  admin: SupabaseClient,
  stripe: Stripe | null | undefined,
  input: ResolveStripePaymentInput,
): Promise<StripePaymentTarget> {
  const none = (reason: string): StripePaymentTarget => ({
    appointmentId: null,
    fallbackBookingId: null,
    customerId: null,
    matchReason: reason,
    confidence: 'low',
  });

  const meta = mergedMetadata(
    input.metadata,
    input.session?.metadata,
    input.paymentIntent?.metadata,
    input.charge?.metadata,
  );

  const appointmentFromMeta =
    metaStr(meta, 'appointment_id') ||
    metaStr(meta, 'work_order_id') ||
    metaStr(meta, 'appointmentId') ||
    metaStr(meta, 'workOrderId');
  const fallbackFromMeta = metaStr(meta, 'fallback_booking_id');
  const customerFromMeta = metaStr(meta, 'customer_id');

  if (appointmentFromMeta) {
    const { data } = await admin.from('appointments').select('id, customer_id').eq('id', appointmentFromMeta).maybeSingle();
    if (data) {
      return {
        appointmentId: String((data as Row).id),
        fallbackBookingId: null,
        customerId: str((data as Row).customer_id) || customerFromMeta || null,
        matchReason: 'metadata.appointment_id',
        confidence: 'high',
      };
    }
  }

  if (fallbackFromMeta) {
    const { data } = await admin.from('booking_fallbacks').select('id, customer_id').eq('id', fallbackFromMeta).maybeSingle();
    if (data) {
      return {
        appointmentId: null,
        fallbackBookingId: String((data as Row).id),
        customerId: str((data as Row).customer_id) || customerFromMeta || null,
        matchReason: 'metadata.fallback_booking_id',
        confidence: 'high',
      };
    }
  }

  const sessionId =
    str(input.sessionId) ||
    str(input.session?.id) ||
    metaStr(meta, 'checkout_session_id');

  if (sessionId) {
    const { data: appt } = await admin
      .from('appointments')
      .select('id, customer_id')
      .or(`stripe_checkout_session_id.eq.${sessionId},final_payment_checkout_session_id.eq.${sessionId}`)
      .maybeSingle();
    if (appt) {
      return {
        appointmentId: String((appt as Row).id),
        fallbackBookingId: null,
        customerId: str((appt as Row).customer_id) || customerFromMeta || null,
        matchReason: 'appointment.stripe_checkout_session_id',
        confidence: 'high',
      };
    }
    const { data: fallback } = await admin
      .from('booking_fallbacks')
      .select('id, customer_id')
      .eq('stripe_checkout_session_id', sessionId)
      .maybeSingle();
    if (fallback) {
      return {
        appointmentId: null,
        fallbackBookingId: String((fallback as Row).id),
        customerId: str((fallback as Row).customer_id) || customerFromMeta || null,
        matchReason: 'booking_fallback.stripe_checkout_session_id',
        confidence: 'high',
      };
    }
  }

  const paymentIntentId =
    str(input.paymentIntentId) ||
    str(input.paymentIntent?.id) ||
    (typeof input.charge?.payment_intent === 'string'
      ? input.charge.payment_intent
      : str(input.charge?.payment_intent?.id));

  if (paymentIntentId) {
    const { data: apptByPi } = await admin
      .from('appointments')
      .select('id, customer_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .maybeSingle();
    if (apptByPi) {
      return {
        appointmentId: String((apptByPi as Row).id),
        fallbackBookingId: null,
        customerId: str((apptByPi as Row).customer_id) || customerFromMeta || null,
        matchReason: 'appointment.stripe_payment_intent_id',
        confidence: 'high',
      };
    }

    const { data: payRow } = await admin
      .from('payments')
      .select('appointment_id, fallback_booking_id, customer_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .limit(1)
      .maybeSingle();
    if (payRow?.appointment_id) {
      return {
        appointmentId: str(payRow.appointment_id),
        fallbackBookingId: null,
        customerId: str(payRow.customer_id) || customerFromMeta || null,
        matchReason: 'payments.stripe_payment_intent_id',
        confidence: 'high',
      };
    }
    if (payRow?.fallback_booking_id) {
      return {
        appointmentId: null,
        fallbackBookingId: str(payRow.fallback_booking_id),
        customerId: str(payRow.customer_id) || customerFromMeta || null,
        matchReason: 'payments.stripe_payment_intent_id.fallback',
        confidence: 'high',
      };
    }
  }

  if (stripe && paymentIntentId) {
    try {
      const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
      const sess = sessions.data[0];
      if (sess) {
        const nested = await resolveStripePaymentTarget(admin, stripe, {
          session: sess,
          sessionId: sess.id,
          paymentIntentId,
          amountCents: input.amountCents,
          customerEmail: input.customerEmail,
        });
        if (nested.appointmentId || nested.fallbackBookingId) {
          return { ...nested, matchReason: `checkout.sessions.list:${nested.matchReason}`, confidence: 'high' };
        }
      }
    } catch (e) {
      console.warn('[stripe-payment-resolve] checkout.sessions.list failed', e);
    }

    if (!input.paymentIntent) {
      try {
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        const nested = await resolveStripePaymentTarget(admin, stripe, {
          paymentIntent: pi,
          paymentIntentId: pi.id,
          amountCents: input.amountCents ?? pi.amount_received ?? pi.amount,
          customerEmail: input.customerEmail ?? pi.receipt_email,
        });
        if (nested.appointmentId || nested.fallbackBookingId) {
          return { ...nested, matchReason: `payment_intent.retrieve:${nested.matchReason}`, confidence: 'high' };
        }
      } catch {
        /* ignore */
      }
    }
  }

  const chargeId = str(input.chargeId) || str(input.charge?.id);
  if (chargeId) {
    const { data: payByCharge } = await admin
      .from('payments')
      .select('appointment_id, fallback_booking_id, customer_id')
      .eq('stripe_charge_id', chargeId)
      .maybeSingle();
    if (payByCharge?.appointment_id) {
      return {
        appointmentId: str(payByCharge.appointment_id),
        fallbackBookingId: null,
        customerId: str(payByCharge.customer_id) || customerFromMeta || null,
        matchReason: 'payments.stripe_charge_id',
        confidence: 'high',
      };
    }
  }

  const email = str(input.customerEmail || input.charge?.billing_details?.email || input.session?.customer_details?.email || input.session?.customer_email || input.paymentIntent?.receipt_email).toLowerCase();
  const amount = input.amountCents ?? input.session?.amount_total ?? input.paymentIntent?.amount_received ?? input.charge?.amount ?? 0;

  if (email.includes('@') && amount > 0) {
    const { data } = await admin
      .from('appointments')
      .select('id, customer_id, guest_email, deposit_amount_cents, base_price_cents, created_at')
      .ilike('guest_email', email)
      .order('created_at', { ascending: false })
      .limit(12);
    const rows = (data ?? []) as Row[];
    const exactDeposit = rows.find((r) => {
      const deposit = typeof r.deposit_amount_cents === 'number' ? r.deposit_amount_cents : 0;
      return deposit > 0 && Math.abs(deposit - amount) <= 2;
    });
    if (exactDeposit) {
      return {
        appointmentId: String(exactDeposit.id),
        fallbackBookingId: null,
        customerId: str(exactDeposit.customer_id) || customerFromMeta || null,
        matchReason: 'email_and_deposit_amount',
        confidence: 'medium',
      };
    }
  }

  return none('no_match');
}

export type UpsertMergedStripePaymentInput = {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  customerId?: string | null;
  amountCents: number;
  status?: string;
  paymentKind?: string;
  stripeCheckoutSessionId?: string | null;
  stripePaymentIntentId?: string | null;
  stripeChargeId?: string | null;
  paidAt: string;
  email?: string | null;
  metadata?: Record<string, unknown>;
  source: string;
  matchReason?: string;
};

export type UpsertMergedStripePaymentResult = {
  ok: boolean;
  paymentId: string | null;
  merged: boolean;
  excludedDuplicateIds: string[];
  error?: string;
};

function isManualRepairRow(row: Row) {
  const meta = (row.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Row;
  const source = str(meta.source);
  return source.includes('repair_jarvis') || source.includes('repair_') || source === 'manual' || source === 'work_order_stripe_repair';
}

function leanPaymentPayload(payload: Record<string, unknown>) {
  return {
    appointment_id: payload.appointment_id ?? null,
    fallback_booking_id: payload.fallback_booking_id ?? null,
    stripe_checkout_session_id: payload.stripe_checkout_session_id ?? null,
    stripe_payment_intent_id: payload.stripe_payment_intent_id ?? null,
    stripe_charge_id: payload.stripe_charge_id ?? null,
    amount_cents: payload.amount_cents ?? 0,
    status: payload.status ?? 'succeeded',
    payment_method: payload.payment_method ?? 'stripe',
    payment_kind: payload.payment_kind ?? 'deposit',
    paid_at: payload.paid_at ?? null,
    metadata: payload.metadata ?? {},
  };
}

async function insertPaymentWithFallback(admin: SupabaseClient, payload: Record<string, unknown>) {
  let ins = await admin.from('payments').insert(payload).select('id').maybeSingle();
  if (ins.error && isSchemaDriftError(ins.error.message)) {
    ins = await admin.from('payments').insert(leanPaymentPayload(payload)).select('id').maybeSingle();
  }
  if (ins.error) {
    return {
      ok: false as const,
      paymentId: null,
      result: { ok: false, paymentId: null, merged: false, excludedDuplicateIds: [], error: ins.error.message } as UpsertMergedStripePaymentResult,
    };
  }
  return { ok: true as const, paymentId: str(ins.data?.id), result: null };
}

async function markDuplicatePayments(
  admin: SupabaseClient,
  duplicateIds: string[],
  winnerId: string,
) {
  for (const dupId of duplicateIds) {
    if (!dupId || dupId === winnerId) continue;
    const { data: row } = await admin.from('payments').select('metadata').eq('id', dupId).maybeSingle();
    const prevMeta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Row;
    await admin
      .from('payments')
      .update({
        exclude_from_revenue: true,
        status: str(prevMeta.source).includes('repair') ? 'voided' : undefined,
        metadata: {
          ...prevMeta,
          merged_into_payment_id: winnerId,
          duplicate_of_stripe: true,
          merged_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', dupId);
  }
}

/** Upsert one canonical payment row; merge orphans and backfill Stripe IDs on appointment-linked rows. */
export async function upsertMergedStripePayment(
  admin: SupabaseClient,
  stripe: Stripe | null | undefined,
  input: UpsertMergedStripePaymentInput,
): Promise<UpsertMergedStripePaymentResult> {
  let appointmentId = str(input.appointmentId) || null;
  let fallbackBookingId = str(input.fallbackBookingId) || null;
  let customerId = str(input.customerId) || null;

  if (!appointmentId && !fallbackBookingId) {
    const target = await resolveStripePaymentTarget(admin, stripe, {
      sessionId: input.stripeCheckoutSessionId,
      paymentIntentId: input.stripePaymentIntentId,
      chargeId: input.stripeChargeId,
      amountCents: input.amountCents,
      customerEmail: input.email,
      metadata: input.metadata,
    });
    appointmentId = target.appointmentId;
    fallbackBookingId = target.fallbackBookingId;
    customerId = customerId || target.customerId;
  }

  const pi = str(input.stripePaymentIntentId);
  const session = str(input.stripeCheckoutSessionId);
  const charge = str(input.stripeChargeId);

  const candidates: Row[] = [];
  if (pi) {
    const { data } = await admin.from('payments').select('*').eq('stripe_payment_intent_id', pi);
    candidates.push(...((data ?? []) as Row[]));
  }
  if (session) {
    const { data } = await admin.from('payments').select('*').eq('stripe_checkout_session_id', session);
    for (const row of (data ?? []) as Row[]) {
      if (!candidates.some((c) => str(c.id) === str(row.id))) candidates.push(row);
    }
  }
  if (charge) {
    const { data } = await admin.from('payments').select('*').eq('stripe_charge_id', charge);
    for (const row of (data ?? []) as Row[]) {
      if (!candidates.some((c) => str(c.id) === str(row.id))) candidates.push(row);
    }
  }

  if (appointmentId) {
    const { data } = await admin
      .from('payments')
      .select('*')
      .eq('appointment_id', appointmentId)
      .eq('amount_cents', input.amountCents)
      .in('status', ['succeeded', 'paid'])
      .is('stripe_payment_intent_id', null);
    for (const row of (data ?? []) as Row[]) {
      const method = str(row.payment_method).toLowerCase();
      if ((method === 'stripe' || isManualRepairRow(row)) && !candidates.some((c) => str(c.id) === str(row.id))) {
        candidates.push(row);
      }
    }
  }

  const payload: Record<string, unknown> = {
    appointment_id: appointmentId,
    fallback_booking_id: fallbackBookingId,
    customer_id: customerId,
    amount_cents: input.amountCents,
    status: input.status ?? 'succeeded',
    payment_method: 'stripe',
    payment_kind: input.paymentKind ?? 'deposit',
    provider: 'stripe',
    stripe_checkout_session_id: session || null,
    stripe_payment_intent_id: pi || null,
    stripe_charge_id: charge || null,
    paid_at: input.paidAt,
    created_at: input.paidAt,
    exclude_from_revenue: false,
    is_test: false,
    metadata: {
      ...(input.metadata ?? {}),
      source: input.source,
      match_reason: input.matchReason ?? null,
      auto_attached_at: new Date().toISOString(),
      customer_email: input.email ?? null,
    },
  };

  const winner =
    candidates.find((c) => str(c.stripe_payment_intent_id) === pi && pi) ??
    candidates.find((c) => str(c.stripe_checkout_session_id) === session && session) ??
    candidates.find((c) => str(c.appointment_id) === appointmentId && appointmentId && !str(c.stripe_payment_intent_id)) ??
    candidates[0] ??
    null;

  let paymentId: string | null = null;
  let merged = false;

  if (winner?.id) {
    let { data, error } = await admin.from('payments').update(payload).eq('id', winner.id).select('id').maybeSingle();
    if (error && isSchemaDriftError(error.message)) {
      const lean = leanPaymentPayload(payload);
      ({ data, error } = await admin.from('payments').update(lean).eq('id', winner.id).select('id').maybeSingle());
    }
    if (error) {
      return { ok: false, paymentId: null, merged: false, excludedDuplicateIds: [], error: error.message };
    }
    paymentId = str(data?.id || winner.id);
    merged = true;
  } else if (pi) {
    let { data, error } = await admin.from('payments').upsert(payload, { onConflict: 'stripe_payment_intent_id' }).select('id').maybeSingle();
    if (error && isSchemaDriftError(error.message)) {
      ({ data, error } = await admin.from('payments').upsert(leanPaymentPayload(payload), { onConflict: 'stripe_payment_intent_id' }).select('id').maybeSingle());
    }
    if (!error) {
      paymentId = str(data?.id);
    } else if (session) {
      let u2 = await admin.from('payments').upsert(payload, { onConflict: 'stripe_checkout_session_id' }).select('id').maybeSingle();
      if (u2.error && isSchemaDriftError(u2.error.message)) {
        u2 = await admin.from('payments').upsert(leanPaymentPayload(payload), { onConflict: 'stripe_checkout_session_id' }).select('id').maybeSingle();
      }
      if (u2.error) {
        const ins = await insertPaymentWithFallback(admin, payload);
        if (!ins.ok) return ins.result;
        paymentId = ins.paymentId;
      } else {
        paymentId = str(u2.data?.id);
      }
    } else {
      const ins = await insertPaymentWithFallback(admin, payload);
      if (!ins.ok) return ins.result;
      paymentId = ins.paymentId;
    }
  } else if (session) {
    let { data, error } = await admin.from('payments').upsert(payload, { onConflict: 'stripe_checkout_session_id' }).select('id').maybeSingle();
    if (error && isSchemaDriftError(error.message)) {
      ({ data, error } = await admin.from('payments').upsert(leanPaymentPayload(payload), { onConflict: 'stripe_checkout_session_id' }).select('id').maybeSingle());
    }
    if (error) {
      const ins = await insertPaymentWithFallback(admin, payload);
      if (!ins.ok) return ins.result;
      paymentId = ins.paymentId;
    } else {
      paymentId = str(data?.id);
    }
  } else {
    const ins = await insertPaymentWithFallback(admin, payload);
    if (!ins.ok) return ins.result;
    paymentId = ins.paymentId;
  }

  const duplicateIds = candidates.map((c) => str(c.id)).filter((id) => id && id !== paymentId);
  if (paymentId && duplicateIds.length > 0) {
    await markDuplicatePayments(admin, duplicateIds, paymentId);
  }

  if (appointmentId && paymentId) {
    const apptPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (session) apptPatch.stripe_checkout_session_id = session;
    if (pi) apptPatch.stripe_payment_intent_id = pi;
    const u = await admin.from('appointments').update(apptPatch).eq('id', appointmentId);
    if (u.error && !isSchemaDriftError(u.error.message)) {
      console.warn('[stripe-payment-resolve] appointment stripe id patch', u.error.message);
    }
  }

  if (stripe && charge && paymentId) {
    try {
      const ch = await stripe.charges.retrieve(charge);
      const btId = typeof ch.balance_transaction === 'string' ? ch.balance_transaction : ch.balance_transaction?.id;
      if (btId) {
        const tx = await stripe.balanceTransactions.retrieve(btId);
        await upsertLedgerFromBalanceTransaction(admin, tx, {
          paymentIntentId: pi || null,
          chargeId: charge,
          paymentId,
          workOrderId: appointmentId,
        });
      }
    } catch (e) {
      console.warn('[stripe-payment-resolve] ledger sync', e);
    }
  }

  return {
    ok: Boolean(paymentId),
    paymentId,
    merged,
    excludedDuplicateIds: duplicateIds,
    error: paymentId ? undefined : 'Payment row not written',
  };
}

/** Build session + payment_intent metadata for checkout.sessions.create. */
export function buildCheckoutStripeMetadata(fields: {
  appointment_id?: string;
  fallback_booking_id?: string;
  stripe_checkout_kind: string;
  customer_id?: string;
  work_order_id?: string;
  [key: string]: string | undefined;
}) {
  const sessionMetadata: Record<string, string> = {};
  const piMetadata: Record<string, string> = {};
  const piKeys = new Set(['appointment_id', 'fallback_booking_id', 'stripe_checkout_kind', 'customer_id', 'work_order_id']);

  for (const [key, raw] of Object.entries(fields)) {
    const v = raw == null ? '' : String(raw).trim();
    if (!v) continue;
    sessionMetadata[key] = v;
    if (piKeys.has(key)) piMetadata[key] = v;
  }

  if (piMetadata.appointment_id && !piMetadata.work_order_id) {
    piMetadata.work_order_id = piMetadata.appointment_id;
    sessionMetadata.work_order_id = piMetadata.appointment_id;
  }

  return {
    metadata: sessionMetadata,
    payment_intent_data: Object.keys(piMetadata).length ? { metadata: piMetadata } : undefined,
  };
}

export async function updateAppointmentStripeIds(
  admin: SupabaseClient,
  appointmentId: string,
  ids: { sessionId?: string | null; paymentIntentId?: string | null },
) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (ids.sessionId) patch.stripe_checkout_session_id = ids.sessionId;
  if (ids.paymentIntentId) patch.stripe_payment_intent_id = ids.paymentIntentId;
  if (Object.keys(patch).length <= 1) return;
  const u = await admin.from('appointments').update(patch).eq('id', appointmentId);
  if (u.error && !isSchemaDriftError(u.error.message)) {
    console.warn('[stripe-payment-resolve] updateAppointmentStripeIds', u.error.message);
  }
}
