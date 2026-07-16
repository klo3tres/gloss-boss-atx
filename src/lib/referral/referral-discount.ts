import type { SupabaseClient } from '@supabase/supabase-js';
import { formatReferredReward, loadReferralProgramSettings, type ReferralProgramSettings } from '@/lib/referral/referral-codes';

export type ReferralDiscountResult = {
  applied: boolean;
  discountCents: number;
  referralCode: string;
  referrerCustomerId: string | null;
  label: string;
  error?: string;
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
  input: {
    referralCode: string;
    subtotalCents: number;
    referredEmail?: string;
    serviceLines?: Array<{ serviceSlug: string; vehicleClass: string; priceCents: number }>;
    addOnLines?: Array<{ slug?: string; cents?: number }>;
  },
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
  if (input.referredEmail?.trim()) {
    const { data: referrer } = await admin.from('customers').select('email').eq('id', data.customer_id).maybeSingle();
    if (String(referrer?.email ?? '').trim().toLowerCase() === input.referredEmail.trim().toLowerCase()) {
      return { applied: false, discountCents: 0, referralCode: code, referrerCustomerId: null, label: 'You cannot use your own referral code.' };
    }
  }

  const eligibleServices = new Set(settings.referredEligibleServiceSlugs ?? []);
  const eligibleAddons = new Set(settings.referredEligibleAddonSlugs ?? []);
  const allowedVehicles = new Set((settings.referredVehicleRestrictions ?? []).map((value) => value.toLowerCase()));
  const exclusions = new Set(settings.referredExclusions ?? []);
  const eligibleService = (input.serviceLines ?? []).find((line) =>
    (eligibleServices.size === 0 || eligibleServices.has(line.serviceSlug))
    && (allowedVehicles.size === 0 || allowedVehicles.has(line.vehicleClass.toLowerCase()))
    && !exclusions.has(line.serviceSlug),
  );
  const eligibleAddon = (input.addOnLines ?? []).find((line) =>
    Boolean(line.slug) && eligibleAddons.has(String(line.slug)) && !exclusions.has(String(line.slug)),
  );
  let discountCents = computeReferralDiscountCents(input.subtotalCents, settings, 'referred');
  if (settings.referredRewardType === 'free_service') {
    const requiredServices = eligibleServices.size > 0 ? eligibleServices : new Set([settings.freeDetailServiceSlug]);
    const service = (input.serviceLines ?? []).find((line) => requiredServices.has(line.serviceSlug)
      && (allowedVehicles.size === 0 || allowedVehicles.has(line.vehicleClass.toLowerCase()))
      && !exclusions.has(line.serviceSlug));
    if (!service) return { applied: false, discountCents: 0, referralCode: String(data.code), referrerCustomerId: String(data.customer_id), label: formatReferredReward(settings), error: 'Choose an eligible service and vehicle to use this referral reward.' };
    discountCents = Math.max(0, service.priceCents);
  } else if (settings.referredRewardType === 'free_addon') {
    if (!eligibleAddon) return { applied: false, discountCents: 0, referralCode: String(data.code), referrerCustomerId: String(data.customer_id), label: formatReferredReward(settings), error: 'Choose an eligible add-on to use this referral reward.' };
    discountCents = Math.max(0, Number(eligibleAddon.cents ?? 0));
  } else if (settings.referredRewardType === 'membership_credit' || settings.referredRewardType === 'custom') {
    discountCents = Math.round(Math.max(0, settings.referredRewardValue) * 100);
  } else if ((eligibleServices.size > 0 || allowedVehicles.size > 0) && !eligibleService) {
    return { applied: false, discountCents: 0, referralCode: String(data.code), referrerCustomerId: String(data.customer_id), label: formatReferredReward(settings), error: 'This referral reward is not eligible for the selected service or vehicle.' };
  }
  const maximumRetailCents = Math.max(0, Number(settings.referredMaximumRetailCents ?? 0));
  if (maximumRetailCents > 0 && discountCents > maximumRetailCents && settings.referredCustomerPaysDifference === false) {
    return { applied: false, discountCents: 0, referralCode: String(data.code), referrerCustomerId: String(data.customer_id), label: formatReferredReward(settings), error: 'Choose an eligible option within this referral reward’s maximum retail value.' };
  }
  if (maximumRetailCents > 0) discountCents = Math.min(discountCents, maximumRetailCents);
  if (settings.maxDiscountCents && settings.maxDiscountCents > 0) discountCents = Math.min(discountCents, settings.maxDiscountCents);
  discountCents = Math.min(input.subtotalCents, discountCents);
  if (discountCents <= 0) return { applied: false, discountCents: 0, referralCode: String(data.code), referrerCustomerId: String(data.customer_id), label: formatReferredReward(settings), error: 'This referral reward has no redeemable value configured yet.' };
  const label = settings.referredRewardLabel?.trim()
    || (discountCents > 0 ? `${formatReferredReward(settings)} referral reward` : 'Referral reward will be confirmed with your eligible service');

  return {
    applied: discountCents > 0,
    discountCents,
    referralCode: String(data.code),
    referrerCustomerId: String(data.customer_id),
    label,
  };
}
