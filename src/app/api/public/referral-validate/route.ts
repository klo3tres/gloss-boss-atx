import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { applyReferralDiscountToQuote } from '@/lib/referral/referral-discount';
import { recordReferralEvent } from '@/lib/referral/referral-events';

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')?.trim() ?? '';
  const subtotal = Number(request.nextUrl.searchParams.get('subtotal_cents') ?? '0');
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  if (!code) return NextResponse.json({ valid: false, error: 'Missing code' }, { status: 400 });

  const result = await applyReferralDiscountToQuote(admin, {
    referralCode: code,
    subtotalCents: Number.isFinite(subtotal) && subtotal > 0 ? subtotal : 10000,
  });

  if (result.referrerCustomerId) {
    await recordReferralEvent(admin, {
      referralCode: code,
      referrerCustomerId: result.referrerCustomerId,
      status: 'clicked',
    });
  }

  return NextResponse.json({
    valid: Boolean(result.referrerCustomerId),
    label: result.label,
    discountCents: result.discountCents,
    referralCode: result.referralCode,
  });
}
