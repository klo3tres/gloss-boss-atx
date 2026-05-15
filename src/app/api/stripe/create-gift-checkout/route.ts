import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { createGiftCheckoutSession } from '@/lib/stripe/checkout';
import { getAppOrigin } from '@/lib/env/app-origin';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { amountCents?: number; email?: string | null };
    const amountCents = Number(body.amountCents);
    const email = body.email?.trim() || null;

    const admin = tryCreateAdminSupabase();
    const origin = getAppOrigin(request);

    const result = await createGiftCheckoutSession({
      admin,
      amountCents,
      purchaserEmail: email,
      origin,
    });

    if (!result.ok) {
      if (result.code === 'STRIPE_NOT_CONFIGURED') {
        return NextResponse.json({
          error: result.error,
          code: result.code,
          message: 'Stripe not connected yet — add keys in environment or Admin → Stripe settings.',
        });
      }      return NextResponse.json({ error: result.error, code: result.code }, { status: 400 });
    }

    return NextResponse.json({ url: result.url });
  } catch (e) {
    console.warn('[api/stripe/create-gift-checkout]', e);
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
