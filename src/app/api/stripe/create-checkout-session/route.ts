import { NextResponse } from 'next/server';

import { logPaymentDebugEvent } from '@/lib/payment-debug';

import { createDepositCheckoutSession } from '@/lib/stripe/checkout';

import { getStripeKeyHealth } from '@/lib/stripe/key-health';

import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

import { getAppOrigin } from '@/lib/env/app-origin';



export const runtime = 'nodejs';



const CHECKOUT_UNAVAILABLE =

  'Secure card checkout is not available right now. Your booking is saved — use Pay later or call Gloss Boss ATX at (512) 481-2319.';



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

      console.error('[api/stripe/create-checkout-session] SUPABASE_NOT_READY');

      return NextResponse.json(

        {

          error: 'Database unavailable for checkout',

          code: 'SUPABASE_NOT_READY',

          customerMessage: CHECKOUT_UNAVAILABLE,

          payLaterEligible: true,

        },

        { status: 503 },

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

      console.error('[api/stripe/create-checkout-session] stripe key mismatch', keyHealth.mismatchDetail);

    }



    if (!keyHealth.configured) {

      await logPaymentDebugEvent(admin, {

        appointmentId,

        fallbackBookingId,

        customerEmail,

        eventType: 'checkout_stripe_not_configured',

        paymentMode: payChoice,

        errorCode: 'STRIPE_NOT_CONFIGURED',

      });

      console.error('[api/stripe/create-checkout-session] STRIPE_NOT_CONFIGURED — set STRIPE_SECRET_KEY and webhook secret');

      return NextResponse.json(

        {

          error: 'Stripe is not configured on the server',

          code: 'STRIPE_NOT_CONFIGURED',

          customerMessage:

            'Card checkout is not set up yet (missing Stripe keys in server environment). Your booking is saved — choose Pay later or call (512) 481-2319.',

          payLaterEligible: true,

          stripeConfigured: false,

        },

        { status: 503 },

      );

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

          stripeMode: keyHealth.secretMode,

          errorCode: result.code,

        });

        console.error('[api/stripe/create-checkout-session] STRIPE_NOT_CONFIGURED from checkout lib');

        return NextResponse.json(

          {

            error: result.error,

            code: 'STRIPE_NOT_CONFIGURED',

            customerMessage:

              'Card checkout is not set up yet. Your booking is saved — choose Pay later or call (512) 481-2319.',

            payLaterEligible: true,

            stripeConfigured: false,

          },

          { status: 503 },

        );

      }

      if (result.code === 'SUPABASE_NOT_READY') {

        console.error('[api/stripe/create-checkout-session] SUPABASE_NOT_READY from checkout lib', result.error);

        return NextResponse.json(

          {

            error: result.error,

            code: result.code,

            customerMessage: CHECKOUT_UNAVAILABLE,

            payLaterEligible: true,

          },

          { status: 503 },

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

        console.error('[api/stripe/create-checkout-session] STRIPE_ERROR', result.error);

        return NextResponse.json(

          {

            error: result.error,

            code: result.code,

            message: result.error,

            appointmentId,

            fallbackBookingId,

            accessToken,

            payLaterEligible: true,

            customerMessage: `Stripe checkout failed: ${result.error}. Your booking is saved.`,

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

      console.error('[api/stripe/create-checkout-session] checkout_failed', result.code, result.error);

      return NextResponse.json(

        {

          error: result.error,

          code: result.code,

          payLaterEligible: true,

          customerMessage: result.error ?? CHECKOUT_UNAVAILABLE,

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

    console.error('[api/stripe/create-checkout-session] exception', detail);

    return NextResponse.json(

      {

        error: 'Checkout could not start',

        code: 'CHECKOUT_EXCEPTION',

        payLaterEligible: true,

        customerMessage: `Checkout error: ${detail}. Your booking may still be saved.`,

        message: detail,

      },

      { status: 503 },

    );

  }

}


