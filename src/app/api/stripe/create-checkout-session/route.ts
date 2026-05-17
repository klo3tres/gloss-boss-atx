import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { createDepositCheckoutSession } from '@/lib/stripe/checkout';
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
      return NextResponse.json({ error: 'Missing accessToken' }, { status: 400 });
    }
    if (!appointmentId && !fallbackBookingId) {
      return NextResponse.json({ error: 'Missing appointmentId or fallbackBookingId' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json(
        {
          error: 'Supabase not configured',
          code: 'SUPABASE_NOT_READY',
          appointmentId,
          fallbackBookingId,
          accessToken,
          skipPayment: true,
        },
        { status: 200 },
      );
    }

    const origin = getAppOrigin(request);

    const result = await createDepositCheckoutSession({
      admin,
      appointmentId,
      fallbackBookingId,
      accessToken,
      origin,
      paymentChoice: body.paymentChoice === 'full' ? 'full' : 'deposit',
    });

    if (!result.ok) {
      if (result.code === 'STRIPE_NOT_CONFIGURED') {
        return NextResponse.json(
          {
            error: 'STRIPE_NOT_CONFIGURED',
            code: 'STRIPE_NOT_CONFIGURED',
            appointmentId,
            fallbackBookingId,
            accessToken,
            skipPayment: true,
            message: 'Booking saved. Stripe is not configured yet — we will follow up for deposit.',
          },
          { status: 200 },
        );
      }
      if (result.code === 'SUPABASE_NOT_READY') {
        return NextResponse.json(
          { error: result.error, code: result.code, appointmentId, fallbackBookingId, accessToken, skipPayment: true },
          { status: 200 },
        );
      }
      if (result.code === 'STRIPE_ERROR') {
        return NextResponse.json(
          {
            error: result.error,
            code: result.code,
            message: result.error,
            appointmentId,
            fallbackBookingId,
            accessToken,
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (e) {
    console.warn('[api/stripe/create-checkout-session]', e);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
