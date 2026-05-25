import { NextResponse } from 'next/server';
import { computeQuoteFromInputs, type VehicleLineInput } from '@/lib/booking-server-shared';
import { isFreePromoEnabled } from '@/lib/free-promo';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      promoCode?: string;
      paymentChoice?: 'deposit' | 'full';
      lines?: VehicleLineInput[];
      addOns?: string[];
      offerId?: string;
    };

    const admin = tryCreateAdminSupabase();
    if (!admin) {
      return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });
    }

    const promoCode = String(body.promoCode ?? '').trim().toUpperCase();
    if (!promoCode) {
      return NextResponse.json({ ok: false, error: 'Enter a promo code.' }, { status: 400 });
    }

    const lines = (body.lines ?? []).filter(
      (l) => l?.serviceSlug && l?.vehicleClass && l?.vehicleDescription,
    ) as VehicleLineInput[];
    if (lines.length === 0) {
      return NextResponse.json({ ok: false, error: 'Add at least one vehicle before applying a promo.' }, { status: 400 });
    }

    if (promoCode === 'FREE') {
      const freeOn = await isFreePromoEnabled(admin);
      if (!freeOn) {
        return NextResponse.json(
          {
            ok: false,
            error: 'FREE promo is disabled. In Admin → Promotions, enable the FREE row and save.',
          },
          { status: 400 },
        );
      }
    }

    const allowFreeTestPromo = promoCode === 'FREE' ? await isFreePromoEnabled(admin) : false;

    const quote = await computeQuoteFromInputs(admin, {
      lines,
      addOns: body.addOns ?? [],
      offerRef: body.offerId,
      promoCode,
      paymentChoice: body.paymentChoice === 'full' ? 'full' : 'deposit',
      allowFreeTestPromo,
    });

    if (!quote.ok) {
      return NextResponse.json({ ok: false, error: quote.error }, { status: quote.status });
    }

    const p = quote.promo;
    return NextResponse.json({
      ok: true,
      code: promoCode,
      message: p.message,
      comped: p.freePromoApplied,
      testOneDollar: p.testOneDollar,
      promoDiscountCents: quote.breakdown.promoDiscountCents,
      finalTotalCents: quote.breakdown.finalTotalCents,
      depositCents: quote.breakdown.depositCents,
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not validate promo.' }, { status: 400 });
  }
}
