import type { SupabaseClient } from '@supabase/supabase-js';
import { loadReferralProgramSettings, type ReferralProgramSettings } from '@/lib/referral/referral-codes';

export type ReferralDiscountResult = {
  applied: boolean;
  discountCents: number;
  referralCode: string;
  referrerCustomerId: string | null;
  label: string;
};

export function computeReferralDiscountCents(
  subtotalCents: number,
  settings: ReferralProgramSettings,
  side: 'referred' | 'referrer',
): number {
  if (!settings.enabled || subtotalCents <= 0) return 0;
  const type = side === 'referred' ? settings.referredRewardType : settings.referrerRewardType;
  const value = side === 'referred' ? settings.referredRewardValue : settings.referrerRewardValue;
  let discount = 0;
  if (type === 'percent') discount = Math.round(subtotalCents * (value / 100));
  else if (type === 'dollar') discount = Math.round(value * 100);
  if (settings.maxDiscountCents && settings.maxDiscountCents > 0) {
    discount = Math.min(discount, settings.maxDiscountCents);
  }
  return Math.min(discount, subtotalCents);
}

export async function applyReferralDiscountToQuote(
  admin: SupabaseClient,
  input: { referralCode: string; subtotalCents: number },
): Promise<ReferralDiscountResult> {
  const settings = await loadReferralProgramSettings(admin);
  const code = input.referralCode.trim().toUpperCase();
  if (!settings.enabled || !code) {
    return { applied: false, discountCents: 0, referralCode: code, referrerCustomerId: null, label: '' };
  }

  const { data } = await admin.from('customer_referral_codes').select('customer_id, code').ilike('code', code).maybeSingle();
  if (!data?.customer_id) {
    return { applied: false, discountCents: 0, referralCode: code, referrerCustomerId: null, label: 'Invalid referral code' };
  }

  const discountCents = computeReferralDiscountCents(input.subtotalCents, settings, 'referred');
  const label =
    settings.referredRewardType === 'percent'
      ? `${settings.referredRewardValue}% referral discount`
      : settings.referredRewardType === 'dollar'
        ? `$${settings.referredRewardValue.toFixed(2)} referral discount`
        : 'Referral reward will be confirmed with your eligible service';

  return {
    applied: discountCents > 0,
    discountCents,
    referralCode: String(data.code),
    referrerCustomerId: String(data.customer_id),
    label,
  };
}
