import { NextResponse } from 'next/server';
import { logPaymentDebugEvent } from '@/lib/payment-debug';
import { createDepositCheckoutSession } from '@/lib/stripe/checkout';
import { getStripeKeyHealth } from '@/lib/stripe/key-health';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getAppOrigin } from '@/lib/env/app-origin';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      appointmentId?: string;
      fallbackBookingId?: string;
      accessToken?: string;
      serviceId?: string;
      paymentChoice?: 'deposit' | 'full';
    };

    const appointmentId = body.appointmentId?.trim();
    const fallbackBookingId = body.fallbackBookingId?.trim();
    const accessToken = body.accessToken?.trim();
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing accessToken', code: 'MISSING_TOKEN' }, { status: 400 });
    }
    if (!appointmentId && !fallbackBookingId) {
      return NextResponse.json({ error: 'Missing appointmentId or fallbackBookingId' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    const keyHealth = await getStripeKeyHealth(admin);

    if (!admin) {
      await logPaymentDebugEvent(null, {
        appointmentId,
        fallbackBookingId,
        eventType: 'checkout_supabase_missing',
        paymentMode: body.paymentChoice === 'full' ? 'full' : 'deposit',
        errorCode: 'SUPABASE_NOT_READY',
      });
      return NextResponse.json(
        {
          error: 'Supabase not configured',
          code: 'SUPABASE_NOT_READY',
          appointmentId,
          fallbackBookingId,
          accessToken,
          skipPayment: true,
          payLaterEligible: true,
          customerMessage:
            "We're having trouble opening secure checkout. Your booking can still be saved, and we'll send payment instructions separately.",
        },
        { status: 200 },
      );
    }

    const payChoice = body.paymentChoice === 'full' ? 'full' : 'deposit';

    let customerEmail: string | null = null;
    if (appointmentId) {
      const { data } = await admin.from('appointments').select('guest_email').eq('id', appointmentId).maybeSingle();
      customerEmail = data?.guest_email ?? null;
    } else if (fallbackBookingId) {
      const { data } = await admin.from('booking_fallbacks').select('guest_email').eq('id', fallbackBookingId).maybeSingle();
      customerEmail = data?.guest_email ?? null;
    }

    if (keyHealth.mismatch) {
      await logPaymentDebugEvent(admin, {
        appointmentId,
        fallbackBookingId,
        customerEmail,
        eventType: 'stripe_key_mismatch',
        paymentMode: payChoice,
        stripeMode: keyHealth.secretMode,
        errorMessage: keyHealth.mismatchDetail,
        metadata: { publishableMode: keyHealth.publishableMode },
      });
    }

    const origin = getAppOrigin(request);

    const result = await createDepositCheckoutSession({
      admin,
      appointmentId,
      fallbackBookingId,
      accessToken,
      origin,
      paymentChoice: payChoice,
    });

    if (!result.ok) {
      if (result.code === 'STRIPE_NOT_CONFIGURED') {
        await logPaymentDebugEvent(admin, {
          appointmentId,
          fallbackBookingId,
          customerEmail,
          eventType: 'checkout_stripe_not_configured',
          paymentMode: payChoice,
          stripeMode: keyHealth.configured ? keyHealth.secretMode : 'missing',
          errorCode: result.code,
        });
        return NextResponse.json(
          {
            error: 'STRIPE_NOT_CONFIGURED',
            code: 'STRIPE_NOT_CONFIGURED',
            appointmentId,
            fallbackBookingId,
            accessToken,
            skipPayment: true,
            payLaterEligible: true,
            customerMessage:
              "We're having trouble opening secure checkout. Your booking can still be saved, and we'll send payment instructions separately.",
            message: 'Booking saved. Stripe is not configured yet — we will follow up for payment.',
          },
          { status: 200 },
        );
      }
      if (result.code === 'SUPABASE_NOT_READY') {
        return NextResponse.json(
          {
            error: result.error,
            code: result.code,
            appointmentId,
            fallbackBookingId,
            accessToken,
            skipPayment: true,
            payLaterEligible: true,
            customerMessage:
              "We're having trouble opening secure checkout. Your booking can still be saved, and we'll send payment instructions separately.",
          },
          { status: 200 },
        );
      }
      if (result.code === 'STRIPE_ERROR') {
        await logPaymentDebugEvent(admin, {
          appointmentId,
          fallbackBookingId,
          customerEmail,
          eventType: 'checkout_stripe_error',
          paymentMode: payChoice,
          stripeMode: keyHealth.secretMode,
          errorCode: result.code,
          errorMessage: result.error,
        });
        return NextResponse.json(
          {
            error: result.error,
            code: result.code,
            message: result.error,
            appointmentId,
            fallbackBookingId,
            accessToken,
            payLaterEligible: true,
            customerMessage:
              "We're having trouble opening secure checkout. Your booking can still be saved, and we'll send payment instructions separately.",
          },
          { status: 503 },
        );
      }
      await logPaymentDebugEvent(admin, {
        appointmentId,
        fallbackBookingId,
        customerEmail,
        eventType: 'checkout_failed',
        paymentMode: payChoice,
        errorCode: result.code,
        errorMessage: result.error,
      });
      return NextResponse.json(
        {
          error: result.error,
          code: result.code,
          payLaterEligible: true,
          customerMessage:
            "We're having trouble opening secure checkout. Your booking can still be saved, and we'll send payment instructions separately.",
        },
        { status: 400 },
      );
    }

    await logPaymentDebugEvent(admin, {
      appointmentId,
      fallbackBookingId,
      customerEmail,
      eventType: 'checkout_session_created',
      paymentMode: payChoice,
      stripeMode: keyHealth.secretMode,
      metadata: { hasUrl: Boolean(result.url) },
    });

    return NextResponse.json({ url: result.url, ok: true });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[api/stripe/create-checkout-session]', detail);
    return NextResponse.json(
      {
        error: 'Checkout could not start',
        code: 'CHECKOUT_EXCEPTION',
        payLaterEligible: true,
        customerMessage:
          "We're having trouble opening secure checkout. Your booking can still be saved, and we'll send payment instructions separately.",
        message: detail,
      },
      { status: 503 },
    );
  }
}
