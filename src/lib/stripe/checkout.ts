import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getStripeSdk } from '@/lib/stripe/stripeService';

export type CreateDepositCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code?: string };

/**
 * Creates Stripe Checkout for appointment deposit. Updates appointment with session id on success.
 */
export async function createDepositCheckoutSession(params: {
  admin: SupabaseClient | null;
  appointmentId: string;
  accessToken: string;
  origin: string;
}): Promise<CreateDepositCheckoutResult> {
  const { admin, appointmentId, accessToken, origin } = params;

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
      .select('id, access_token, status, deposit_amount_cents, guest_email')
      .eq('id', appointmentId)
      .maybeSingle();

    if (error || !appt) {
      return { ok: false, error: 'Booking not found' };
    }

    if (appt.access_token !== accessToken) {
      return { ok: false, error: 'Invalid access token' };
    }

    if (appt.status !== 'awaiting_payment') {
      return { ok: false, error: 'Booking is not awaiting payment' };
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: appt.guest_email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: appt.deposit_amount_cents,
            product_data: {
              name: 'Gloss Boss ATX — Service deposit (30%)',
              description: `Booking ${appt.id}`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/acknowledgement/${appt.id}?session_id={CHECKOUT_SESSION_ID}&token=${accessToken}`,
      cancel_url: `${origin}/book?cancelled=1`,
      metadata: {
        appointment_id: appt.id,
        access_token: accessToken,
      },
    });

    await admin.from('appointments').update({ stripe_checkout_session_id: session.id }).eq('id', appt.id);

    if (!session.url) {
      return { ok: false, error: 'No checkout URL returned' };
    }

    return { ok: true, url: session.url };
  } catch (e) {
    console.warn('[checkout] createDepositCheckoutSession', e);
    return { ok: false, error: 'Checkout failed' };
  }
}

export type CreateGiftCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; error: string; code?: string };

/**
 * One-time gift card purchase (no DB row required; fulfillment can be manual or email-based).
 */
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

export async function processCheckoutSessionCompleted(params: {
  admin: SupabaseClient | null;
  session: Stripe.Checkout.Session;
}): Promise<void> {
  const { admin, session } = params;
  if (!admin) return;

  if (session.metadata?.kind === 'gift_card') {
    console.info('[checkout] gift card purchase completed', session.id, session.amount_total);
    return;
  }

  const appointmentId = session.metadata?.appointment_id;
  const amount = session.amount_total ?? 0;

  if (!appointmentId) return;

  try {
    await admin.from('payments').upsert(
      {
        appointment_id: appointmentId,
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? null,
        amount_cents: amount,
        status: 'succeeded',
      },
      { onConflict: 'stripe_checkout_session_id' }
    );

    await admin.from('appointments').update({ status: 'deposit_paid', updated_at: new Date().toISOString() }).eq('id', appointmentId);
  } catch (e) {
    console.warn('[checkout] processCheckoutSessionCompleted', e);
  }
}
