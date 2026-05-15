import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { createDepositCheckoutSession } from '@/lib/stripe/checkout';
import { getAppOrigin } from '@/lib/env/app-origin';

export async function POST(request: Request) {
  try {
    const { appointmentId, accessToken } = (await request.json()) as {
      appointmentId?: string;
      accessToken?: string;
    };

    if (!appointmentId || !accessToken) {
      return NextResponse.json({ error: 'Missing appointmentId or accessToken' }, { status: 400 });
    }

    const admin = tryCreateAdminSupabase();
    const origin = getAppOrigin(request);

    if (!admin) {
      return NextResponse.json(
        { code: 'SUPABASE_NOT_READY', skipPayment: true, appointmentId, accessToken },
        { status: 200 }
      );
    }

    const result = await createDepositCheckoutSession({ admin, appointmentId, accessToken, origin });

    if (!result.ok) {
      if (result.code === 'STRIPE_NOT_CONFIGURED') {
        return NextResponse.json(
          {
            code: 'STRIPE_NOT_CONFIGURED',
            skipPayment: true,
            appointmentId,
            accessToken,
            message: 'Booking saved. Configure Stripe to collect deposits online.',
          },
          { status: 200 }
        );
      }
      const status = result.code === 'SUPABASE_NOT_READY' ? 200 : 400;
      if (result.code === 'SUPABASE_NOT_READY') {
        return NextResponse.json({ code: result.code, skipPayment: true, appointmentId, accessToken }, { status: 200 });
      }
      return NextResponse.json({ error: result.error, code: result.code }, { status });
    }

    return NextResponse.json({ url: result.url });
  } catch (e) {
    console.warn('[api/checkout]', e);
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 });
  }
}
