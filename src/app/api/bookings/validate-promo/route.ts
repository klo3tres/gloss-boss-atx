import { NextResponse } from 'next/server';
import { computeQuoteFromInputs, type VehicleLineInput } from '@/lib/booking-server-shared';
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
      allowFreeTestPromo?: boolean;
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

    let allowFreeTestPromo = body.allowFreeTestPromo === true;
    let freePromoRowEnabled = false;
    if (!allowFreeTestPromo) {
      const ss = await admin.from('site_settings').select('key, value, allow_free_test_promo').limit(20);
      if (!ss.error) {
        allowFreeTestPromo = ((ss.data ?? []) as Record<string, unknown>[]).some(
          (r) =>
            r.allow_free_test_promo === true ||
            (String(r.key ?? '') === 'allow_free_test_promo' && String(r.value ?? '').toLowerCase() === 'true'),
        );
      }
    }
    if (promoCode === 'FREE') {
      const freeRow = await admin.from('promo_codes').select('enabled, archived').eq('code', 'FREE').maybeSingle();
      freePromoRowEnabled = freeRow.data?.enabled === true && freeRow.data?.archived !== true;
      if (!freePromoRowEnabled && !allowFreeTestPromo) {
        return NextResponse.json(
          {
            ok: false,
            error:
              'FREE is blocked: enable the FREE promo row in Admin → Promotions AND turn on the “FREE promo master gate” toggle.',
          },
          { status: 400 },
        );
      }
      if (!allowFreeTestPromo) {
        return NextResponse.json(
          {
            ok: false,
            error: 'FREE is blocked by the master gate. Enable “FREE test promo” in Admin → Promotions.',
          },
          { status: 400 },
        );
      }
      if (!freePromoRowEnabled) {
        return NextResponse.json(
          { ok: false, error: 'FREE promo row is disabled. Enable the FREE code in Admin → Promotions.' },
          { status: 400 },
        );
      }
    }

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
