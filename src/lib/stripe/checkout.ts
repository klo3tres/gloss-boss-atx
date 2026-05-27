import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeSdk } from '@/lib/stripe/stripeService';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { promoteFallbackToAppointment } from '@/lib/booking-diagnostics';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { notifyBookingCheckoutPaid } from '@/lib/booking-checkout-notify';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob, findDepositPayment } from '@/lib/payments-resolve';

export type CreateDepositCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code?: string };

function stripeErrorMessage(e: unknown): string {
  const raw =
    e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : '';
  return raw && raw !== 'undefined'
    ? raw
    : 'Checkout could not start. Your booking is saved — try again or call Gloss Boss ATX.';
}

/**
 * Creates Stripe Checkout for appointment deposit. Updates appointment with session id on success.
 * Pass either (appointmentId + accessToken) OR (fallbackBookingId + accessToken).
 */
export async function createDepositCheckoutSession(params: {
  admin: SupabaseClient | null;
  appointmentId?: string;
  accessToken?: string;
  fallbackBookingId?: string;
  origin: string;
  paymentChoice?: 'deposit' | 'full';
}): Promise<CreateDepositCheckoutResult> {
  const { admin, accessToken, origin } = params;
  const appointmentId = params.appointmentId?.trim();
  const fallbackBookingId = params.fallbackBookingId?.trim();

  if (!admin) {
    return { ok: false, error: 'Database unavailable', code: 'SUPABASE_NOT_READY' };
  }
  if (!accessToken?.trim()) {
    return { ok: false, error: 'Missing access token' };
  }

  if (fallbackBookingId) {
    return createFallbackDepositCheckoutSession({
      admin,
      fallbackBookingId,
      accessToken: accessToken.trim(),
      origin,
      paymentChoice: params.paymentChoice,
    });
  }

  if (!appointmentId) {
    return { ok: false, error: 'Missing appointmentId or fallbackBookingId' };
  }

  const stripe = await getStripeSdk(admin);
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' };
  }

  try {
    const { data: appt, error } = await admin
      .from('appointments')
      .select('id, access_token, status, payment_status, deposit_amount_cents, base_price_cents, guest_email, guest_name, service_slug, vehicle_description, service_address, service_city, service_state, service_zip')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt) {
      return { ok: false, error: 'Booking not found' };
    }

    if (appt.access_token !== accessToken.trim()) {
      return { ok: false, error: 'Invalid access token' };
    }

    const payStatus = String((appt as { payment_status?: string }).payment_status ?? '');
    const canCheckout =
      appt.status === 'awaiting_payment' || payStatus === 'awaiting_deposit' || payStatus === 'pay_later';
    if (!canCheckout) {
      return { ok: false, error: 'Booking is not awaiting payment', code: 'INVALID_STATUS' };
    }

    const serviceName = String(appt.service_slug ?? 'Service').replace(/-/g, ' ');
    const vehicleSummary = String(appt.vehicle_description ?? 'Vehicle');
    const serviceAddress = [appt.service_address, appt.service_city, appt.service_state, appt.service_zip].filter(Boolean).join(', ');
    const isFullPay = params.paymentChoice === 'full';
    const amountCents = isFullPay && typeof appt.base_price_cents === 'number' && appt.base_price_cents > 0 ? appt.base_price_cents : appt.deposit_amount_cents;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: appt.guest_email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: isFullPay ? 'Gloss Boss ATX — Paid in full' : 'Gloss Boss ATX — Service deposit (30%)',
              description: `${serviceName} · ${vehicleSummary}${serviceAddress ? ` · ${serviceAddress}` : ''}`.slice(0, 500),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/book/confirmation?appointment_id=${appt.id}&session_id={CHECKOUT_SESSION_ID}&token=${accessToken.trim()}`,
      cancel_url: `${origin}/book?cancelled=1`,
      metadata: {
        appointment_id: appt.id,
        access_token: accessToken.trim(),
        stripe_checkout_kind: isFullPay ? 'booking_full' : 'deposit',
        customer_name: String(appt.guest_name ?? ''),
        service_name: serviceName,
        vehicle_summary: vehicleSummary.slice(0, 500),
        service_address: serviceAddress.slice(0, 500),
      },
    });

    await upsertSessionIdSafe(admin, appt.id, session.id);

    if (!session.url) {
      return { ok: false, error: 'No checkout URL returned' };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    console.warn('[checkout] createDepositCheckoutSession', e);
    return { ok: false, error: stripeErrorMessage(e).slice(0, 280), code: 'STRIPE_ERROR' };
  }
}

async function createFallbackDepositCheckoutSession(params: {
  admin: SupabaseClient;
  fallbackBookingId: string;
  accessToken: string;
  origin: string;
  paymentChoice?: 'deposit' | 'full';
}): Promise<CreateDepositCheckoutResult> {
  const { admin, fallbackBookingId, accessToken, origin } = params;
  const stripe = await getStripeSdk(admin);
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' };
  }

  const { data: row, error } = await admin
    .from('booking_fallbacks')
    .select('id, access_token, deposit_amount_cents, base_price_cents, guest_email, guest_name, status, service_slug, vehicle_description, service_address, service_city, service_state, service_zip')
    .eq('id', fallbackBookingId)
    .maybeSingle();

  if (error || !row || String(row.access_token) !== accessToken) {
    return { ok: false, error: 'Invalid fallback booking' };
  }
  if (String(row.status) === 'converted') {
    return { ok: false, error: 'Booking already converted' };
  }

  const isFullPay = params.paymentChoice === 'full';
  const amount =
    isFullPay && typeof row.base_price_cents === 'number' && row.base_price_cents > 0
      ? row.base_price_cents
      : typeof row.deposit_amount_cents === 'number' && row.deposit_amount_cents > 0 ? row.deposit_amount_cents : 0;
  if (amount < 50) {
    return { ok: false, error: 'Invalid deposit amount' };
  }

  try {
    const serviceName = String(row.service_slug ?? 'Service').replace(/-/g, ' ');
    const vehicleSummary = String(row.vehicle_description ?? 'Vehicle');
    const serviceAddress = [row.service_address, row.service_city, row.service_state, row.service_zip].filter(Boolean).join(', ');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: typeof row.guest_email === 'string' ? row.guest_email : undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: isFullPay ? 'Gloss Boss ATX — Paid in full' : 'Gloss Boss ATX — Service deposit (30%)',
              description: `${serviceName} · ${vehicleSummary}${serviceAddress ? ` · ${serviceAddress}` : ''}`.slice(0, 500),
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/intake?session_id={CHECKOUT_SESSION_ID}&token=${encodeURIComponent(accessToken)}&fallback_booking_id=${row.id}`,
      cancel_url: `${origin}/book?cancelled=1`,
      metadata: {
        fallback_booking_id: String(row.id),
        access_token: accessToken,
        stripe_checkout_kind: isFullPay ? 'booking_full' : 'deposit',
        customer_name: String(row.guest_name ?? ''),
        service_name: serviceName,
        vehicle_summary: vehicleSummary.slice(0, 500),
        service_address: serviceAddress.slice(0, 500),
      },
    });

    await admin
      .from('booking_fallbacks')
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq('id', row.id);

    if (!session.url) {
      return { ok: false, error: 'No checkout URL returned' };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    console.warn('[checkout] createFallbackDepositCheckoutSession', e);
    return { ok: false, error: stripeErrorMessage(e).slice(0, 280), code: 'STRIPE_ERROR' };
  }
}

/**
 * Field / walk-up: charge full quoted total (stored on appointment as deposit_amount_cents = 100% total).
 */
export async function createFieldInvoiceCheckoutSession(params: {
  admin: SupabaseClient | null;
  appointmentId: string;
  accessToken: string;
  origin: string;
  technicianId: string;
}): Promise<CreateDepositCheckoutResult> {
  const { admin, appointmentId, accessToken, origin, technicianId } = params;

  if (!admin) {
    return { ok: false, error: 'Database unavailable', code: 'SUPABASE_NOT_READY' };
  }

  const stripe = await getStripeSdk(admin);
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' };
  }

  try {
    const { data: appt, error } = await admin
      .from('appointments')
      .select('id, access_token, status, deposit_amount_cents, guest_email, base_price_cents')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt) {
      return { ok: false, error: 'Booking not found' };
    }

    if (appt.access_token !== accessToken) {
      return { ok: false, error: 'Invalid access token' };
    }

    if (appt.status !== 'awaiting_payment') {
      return { ok: false, error: 'Invoice is not awaiting payment' };
    }

    const amount =
      typeof appt.deposit_amount_cents === 'number' && appt.deposit_amount_cents > 0
        ? appt.deposit_amount_cents
        : typeof appt.base_price_cents === 'number'
          ? appt.base_price_cents
          : 0;

    if (amount < 500) {
      return { ok: false, error: 'Invalid invoice amount' };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: appt.guest_email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amount,
            product_data: {
              name: 'Gloss Boss ATX — Field service (paid in full)',
              description: `Invoice ${appt.id}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/intake?appointment_id=${appt.id}&session_id={CHECKOUT_SESSION_ID}&token=${accessToken}`,
      cancel_url: `${origin}/tech?invoice=cancel`,
      metadata: {
        appointment_id: appt.id,
        access_token: accessToken,
        technician_id: technicianId,
        tech_field_invoice: '1',
        stripe_checkout_kind: 'field_full',
      },
    });

    await upsertSessionIdSafe(admin, appt.id, session.id);

    if (!session.url) {
      return { ok: false, error: 'No checkout URL returned' };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    console.warn('[checkout] createFieldInvoiceCheckoutSession', e);
    return { ok: false, error: stripeErrorMessage(e).slice(0, 280), code: 'STRIPE_ERROR' };
  }
}

export async function createCustomerFinalBalanceCheckoutSession(params: {
  admin: SupabaseClient | null;
  appointmentId: string;
  origin: string;
  technicianId?: string | null;
}): Promise<CreateDepositCheckoutResult & { balanceCents?: number }> {
  const { admin, appointmentId, origin, technicianId } = params;
  if (!admin) return { ok: false, error: 'Database unavailable', code: 'SUPABASE_NOT_READY' };

  const stripe = await getStripeSdk(admin);
  if (!stripe) return { ok: false, error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' };

  try {
    const { data: appt, error } = await admin
      .from('appointments')
      .select('*')
      .eq('id', appointmentId)
      .maybeSingle();
    if (error || !appt) return { ok: false, error: 'Job not found' };

    const jobRow = appt as Record<string, unknown>;
    const payments = await fetchPaymentsForJob(admin, jobRow, { appointmentId });
    const pricing = resolveJobPricing(jobRow, payments);
    const balanceCents = pricing.remainingBalanceCents;
    const depositPayment = findDepositPayment(payments);

    if (balanceCents < 50) {
      await admin
        .from('appointments')
        .update({ payment_status: 'paid', balance_due_cents: 0, updated_at: new Date().toISOString() })
        .eq('id', appointmentId);
      return { ok: false, error: 'No balance due', code: 'NO_BALANCE_DUE', balanceCents };
    }

    const token = String(appt.access_token ?? '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: typeof appt.guest_email === 'string' ? appt.guest_email : undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: balanceCents,
            product_data: {
              name: 'Gloss Boss ATX — Final service balance',
              description: `${String(appt.service_slug ?? 'Service').replace(/-/g, ' ')} · ${String(appt.vehicle_description ?? appointmentId)}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/customer?payment=success&appointment_id=${appointmentId}`,
      cancel_url: `${origin}/customer?payment=cancelled&appointment_id=${appointmentId}`,
      metadata: {
        appointment_id: appointmentId,
        fallback_booking_id: '',
        customer_id: appt.customer_id != null ? String(appt.customer_id) : '',
        access_token: token,
        technician_id: technicianId ?? '',
        stripe_checkout_kind: 'customer_final_balance',
        payment_type: 'remaining_balance',
        work_order_id: appointmentId,
        original_deposit_payment_id: depositPayment?.id ? String(depositPayment.id) : '',
      },
    });

    await admin
      .from('appointments')
      .update({
        final_payment_checkout_session_id: session.id,
        final_payment_url: session.url ?? null,
        final_payment_created_at: new Date().toISOString(),
        balance_due_cents: balanceCents,
        payment_status: 'balance_due',
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId);

    await syncJobBalanceDue(admin, jobRow, pricing, { appointmentId });

    return session.url ? { ok: true, url: session.url, balanceCents } : { ok: false, error: 'No checkout URL returned' };
  } catch (e) {
    console.warn('[checkout] createCustomerFinalBalanceCheckoutSession', e);
    return { ok: false, error: stripeErrorMessage(e).slice(0, 280), code: 'STRIPE_ERROR' };
  }
}

async function upsertSessionIdSafe(admin: SupabaseClient, appointmentId: string, sessionId: string): Promise<void> {
  const u = await admin
    .from('appointments')
    .update({ stripe_checkout_session_id: sessionId, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);
  if (u.error && isSchemaDriftError(u.error.message)) {
    await admin.from('appointments').update({ updated_at: new Date().toISOString() }).eq('id', appointmentId);
  }
}

export type CreateGiftCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code?: string };

export async function createGiftCheckoutSession(params: {
  admin: SupabaseClient | null;
  amountCents: number;
  purchaserEmail: string | null;
  origin: string;
}): Promise<CreateGiftCheckoutResult> {
  const { admin, amountCents, purchaserEmail, origin } = params;

  if (!Number.isFinite(amountCents) || amountCents < 1000 || amountCents > 500_000) {
    return { ok: false, error: 'Amount must be between $10 and $5,000', code: 'INVALID_AMOUNT' };
  }

  const stripe = await getStripeSdk(admin);
  if (!stripe) {
    return { ok: false, error: 'Stripe is not configured', code: 'STRIPE_NOT_CONFIGURED' };
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: purchaserEmail ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: amountCents,
            product_data: {
              name: 'Gloss Boss ATX — Gift card',
              description: 'Digital gift card (redeem with team at booking)',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/gift-cards/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/gift-cards?cancelled=1`,
      metadata: {
        kind: 'gift_card',
        amount_cents: String(amountCents),
      },
    });

    if (!session.url) {
      return { ok: false, error: 'No checkout URL returned' };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    console.warn('[checkout] createGiftCheckoutSession', e);
    return { ok: false, error: 'Checkout failed' };
  }
}

async function upsertPaymentRow(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const full = await admin.from('payments').upsert(row, { onConflict: 'stripe_checkout_session_id' });
  if (!full.error) return { ok: true };
  const msg = full.error.message ?? '';
  console.warn('[checkout] payments upsert', msg);
  if (!isSchemaDriftError(msg)) return { ok: false, error: msg };

  const sid = row.stripe_checkout_session_id;
  const aid = row.appointment_id;
  const amt = row.amount_cents;
  const minimal = {
    appointment_id: aid,
    stripe_checkout_session_id: sid,
    amount_cents: amt,
    status: row.status ?? 'succeeded',
  };
  const m = await admin.from('payments').upsert(minimal, { onConflict: 'stripe_checkout_session_id' });
  if (m.error) {
    console.warn('[checkout] payments minimal upsert', m.error.message);
    return { ok: false, error: m.error.message };
  }
  return { ok: true };
}

async function updateAppointmentPaidSafe(
  admin: SupabaseClient,
  appointmentId: string,
  extras: Record<string, unknown>,
): Promise<void> {
  const base = { status: 'deposit_paid', payment_status: 'deposit_paid', deposit_paid_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...extras };
  let u = await admin.from('appointments').update(base).eq('id', appointmentId);
  if (u.error && isSchemaDriftError(u.error.message)) {
    u = await admin
      .from('appointments')
      .update({ status: 'deposit_paid', payment_status: 'deposit_paid', deposit_paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', appointmentId);
  }
  if (u.error && isSchemaDriftError(u.error.message)) {
    u = await admin.from('appointments').update({ status: 'deposit_paid' }).eq('id', appointmentId);
  }
  if (u.error) {
    console.warn('[checkout] appointment paid update', u.error.message);
  }
}

export async function processCheckoutSessionCompleted(params: {
  admin: SupabaseClient | null;
  session: Stripe.Checkout.Session;
}): Promise<void> {
  const { admin, session } = params;
  if (!admin) return;

  if (session.metadata?.kind === 'gift_card') {
    const amount = session.amount_total ?? Number(session.metadata?.amount_cents) ?? 0;
    console.info('[checkout] gift card purchase completed', session.id, amount);
    try {
      const { notifyOwnerBookingEvent } = await import('@/lib/owner-alerts');
      await notifyOwnerBookingEvent({
        kind: 'gift_card',
        guestEmail: session.customer_details?.email ?? session.customer_email ?? '—',
        guestName: session.customer_details?.name ?? 'Gift card buyer',
        totalCents: amount,
        paidCents: amount,
        extraNote: `Gift card checkout ${session.id}`,
      });
    } catch (e) {
      console.warn('[checkout] gift card owner notify', e);
    }
    return;
  }

  let appointmentId = session.metadata?.appointment_id as string | undefined;
  const fallbackId = session.metadata?.fallback_booking_id;
  const accessTok = session.metadata?.access_token;

  if (!appointmentId && fallbackId && accessTok) {
    const promoted = await promoteFallbackToAppointment(admin, fallbackId, accessTok);
    if (promoted?.id) {
      appointmentId = promoted.id;
      await upsertSessionIdSafe(admin, appointmentId, session.id);
    } else {
      console.error('[checkout] fallback promotion failed for session', session.id, fallbackId);
      return;
    }
  }

  const amount = session.amount_total ?? 0;

  if (!appointmentId) {
    console.warn('[checkout] checkout.session.completed missing appointment / fallback', session.id);
    return;
  }

  const kind = session.metadata?.stripe_checkout_kind;
  const isField = session.metadata?.tech_field_invoice === '1' || kind === 'field_full';
  const isFinalBalance = kind === 'customer_final_balance';
  const isBookingFull = kind === 'booking_full';
  const technicianId = session.metadata?.technician_id ?? null;

  try {
    const paymentRow: Record<string, unknown> = {
      appointment_id: appointmentId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
      amount_cents: amount,
      status: 'succeeded',
      payment_method: 'stripe',
      payment_kind: isFinalBalance ? 'customer_final_balance' : isField ? 'field_full' : isBookingFull ? 'booking_full' : 'deposit',
      paid_at: new Date().toISOString(),
    };
    if (technicianId && typeof technicianId === 'string') {
      paymentRow.technician_id = technicianId;
    }

    const payResult = await upsertPaymentRow(admin, paymentRow);
    if (!payResult.ok) {
      console.error('[checkout] payment row not saved', appointmentId, payResult.error);
      throw new Error(payResult.error ?? 'payment row upsert failed');
    }

    const extras: Record<string, unknown> = {};
    if (isFinalBalance) {
      await admin
        .from('appointments')
        .update({
          payment_status: 'paid',
          balance_due_cents: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId);
    } else if (isBookingFull) {
      extras.stripe_checkout_kind = 'booking_full';
      extras.payment_status = 'full_paid';
      extras.balance_due_cents = 0;
      extras.full_paid_at = new Date().toISOString();
    } else if (isField) {
      extras.field_invoice_paid_at = new Date().toISOString();
      extras.stripe_checkout_kind = 'field_full';
    } else {
      extras.stripe_checkout_kind = 'deposit';
    }

    if (!isFinalBalance) {
      await updateAppointmentPaidSafe(admin, appointmentId, extras);
    }

    await recordJobTimelineEvent(admin, {
      appointmentId,
      eventType: 'payment_received',
      meta: {
        amount_cents: amount,
        field_full: isField,
        final_balance: isFinalBalance,
        session_id: session.id,
      },
      createdBy: typeof technicianId === 'string' ? technicianId : null,
    });

    const { data: appt } = await admin
      .from('appointments')
      .select('guest_email, guest_name, scheduled_start, base_price_cents, deposit_amount_cents')
      .eq('id', appointmentId)
      .maybeSingle();

    const paymentKind = isFinalBalance
      ? 'customer_final_balance'
      : isBookingFull
        ? 'booking_full'
        : isField
          ? 'field_full'
          : 'deposit';

    void notifyBookingCheckoutPaid({
      admin,
      appointmentId,
      paidCents: amount,
      paymentKind,
    }).catch((e) => console.warn('[checkout] booking notify', e));

    console.info(
      '[checkout] checkout.session.completed',
      appointmentId,
      'amount',
      amount,
      isFinalBalance ? 'customer_final_balance' : isField ? 'field_full' : 'deposit',
    );
  } catch (e) {
    console.error('[checkout] processCheckoutSessionCompleted', e);
    throw e;
  }
}
