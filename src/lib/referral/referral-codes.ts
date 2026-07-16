import type { SupabaseClient } from '@supabase/supabase-js';

function randomCode(len = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function ensureCustomerReferralCode(
  admin: SupabaseClient,
  customerId: string,
): Promise<{ code: string; created: boolean }> {
  const existing = await admin
    .from('customer_referral_codes')
    .select('code')
    .eq('customer_id', customerId)
    .maybeSingle();

  if (existing.data?.code) {
    return { code: String(existing.data.code), created: false };
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const { error } = await admin.from('customer_referral_codes').insert({
      customer_id: customerId,
      code,
    });
    if (!error) return { code, created: true };
    if (!/duplicate|unique/i.test(error.message)) break;
  }

  const fallback = `GB${customerId.slice(0, 6).toUpperCase()}`;
  await admin.from('customer_referral_codes').upsert({ customer_id: customerId, code: fallback });
  return { code: fallback, created: true };
}

export function formatRewardSummary(type: string, value: number, label?: string): string {
  if (label?.trim()) return label.trim();
  if (type === 'percent') return `${value}% off`;
  if (type === 'dollar') return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} credit`;
  if (type === 'free_addon') return 'Free add-on';
  if (type === 'free_service') return value > 0 ? `Free service ($${value} value)` : 'Free service';
  if (type === 'membership_credit') return value > 0 ? `$${value} membership credit` : 'Membership credit';
  if (type === 'custom') return value ? `Custom reward (${value})` : 'Custom reward';
  return String(value);
}

export function formatReferredReward(settings: Pick<ReferralProgramSettings, 'referredRewardType' | 'referredRewardValue' | 'referredRewardLabel'>): string {
  if (settings.referredRewardLabel?.trim()) return settings.referredRewardLabel.trim();
  if (settings.referredRewardType === 'dollar') return `$${Number(settings.referredRewardValue).toLocaleString('en-US', { maximumFractionDigits: 2 })} off`;
  return formatRewardSummary(settings.referredRewardType, settings.referredRewardValue);
}

export function formatReferrerReward(settings: Pick<ReferralProgramSettings, 'referrerRewardType' | 'referrerRewardValue' | 'referrerRewardLabel'>): string {
  return formatRewardSummary(settings.referrerRewardType, settings.referrerRewardValue, settings.referrerRewardLabel);
}

export function formatReferralHeadline(settings: Pick<ReferralProgramSettings, 'referredRewardType' | 'referredRewardValue' | 'referredRewardLabel' | 'referrerRewardType' | 'referrerRewardValue' | 'referrerRewardLabel'>): string {
  return `Give ${formatReferredReward(settings)}. Get ${formatReferrerReward(settings)}.`;
}

export function formatReferralTerms(settings: ReferralProgramSettings): string {
  const parts = [`Your reward unlocks after your friend's ${settings.rewardUnlockRule === 'booked' ? 'eligible booking' : 'completed paid appointment'}.`];
  if (settings.referredEligibleServiceSlugs?.length) parts.push(`Friend offer services: ${settings.referredEligibleServiceSlugs.join(', ')}.`);
  if (settings.referredVehicleRestrictions?.length) parts.push(`Eligible vehicles: ${settings.referredVehicleRestrictions.join(', ')}.`);
  if (settings.referredMaximumRetailCents) parts.push(`Friend offer maximum value: $${(settings.referredMaximumRetailCents / 100).toFixed(2)}.`);
  if (settings.rewardExpirationDays) parts.push(`Issued rewards expire after ${settings.rewardExpirationDays} days.`);
  parts.push(settings.stackingAllowed ? 'Stacking is allowed where checkout confirms eligibility.' : 'Referral rewards do not stack with other promotions.');
  return parts.join(' ');
}

/** Durable customer referral booking link — no expiry query params. */
export function referralLinkForCode(code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  return `${base}/book?ref=${encodeURIComponent(code)}`;
}

export type ReferralRewardLadderTier = {
  threshold: number;
  rewardType: ReferralRewardType;
  rewardValue: number;
  label: string;
  eligibleServiceSlugs?: string[];
  eligibleAddonSlugs?: string[];
  serviceCategory?: string;
  maximumRetailCents?: number;
  customerPaysDifference?: boolean;
  vehicleRestrictions?: string[];
  exclusions?: string[];
  expirationDays?: number;
  stackingAllowed?: boolean;
  repeatable?: boolean;
  internalNotes?: string;
};

export type ReferralRewardType = 'percent' | 'dollar' | 'free_addon' | 'free_service' | 'membership_credit' | 'custom';

export type ReferralProgramSettings = {
  enabled: boolean;
  referrerRewardType: ReferralRewardType;
  referrerRewardValue: number;
  referrerRewardLabel?: string;
  referredRewardType: ReferralRewardType;
  referredRewardValue: number;
  referredRewardLabel?: string;
  referredEligibleServiceSlugs?: string[];
  referredEligibleAddonSlugs?: string[];
  referredVehicleRestrictions?: string[];
  referredExclusions?: string[];
  referredMaximumRetailCents?: number;
  referredCustomerPaysDifference?: boolean;
  referrerEligibleServiceSlugs?: string[];
  referrerEligibleAddonSlugs?: string[];
  referrerVehicleRestrictions?: string[];
  referrerExclusions?: string[];
  referrerMaximumRetailCents?: number;
  referrerCustomerPaysDifference?: boolean;
  minCompletedBookings: number;
  maxRewardsPerCustomer: number;
  stackingAllowed: boolean;
  maxDiscountCents?: number;
  rewardExpirationDays?: number;
  rewardUnlockRule: 'booked' | 'completed_paid';
  reviewRewardEnabled: boolean;
  reviewRewardType: 'percent' | 'dollar' | 'free_service' | 'custom';
  reviewRewardValue: number;
  freeDetailReferralThreshold: number;
  freeDetailServiceSlug: string;
  rewardLadder: ReferralRewardLadderTier[];
};

export const DEFAULT_REFERRAL_SETTINGS: ReferralProgramSettings = {
  enabled: true,
  referrerRewardType: 'percent',
  referrerRewardValue: 15,
  referrerRewardLabel: '',
  referredRewardType: 'percent',
  referredRewardValue: 10,
  referredRewardLabel: '',
  referredEligibleServiceSlugs: [],
  referredEligibleAddonSlugs: [],
  referredVehicleRestrictions: [],
  referredExclusions: [],
  referredMaximumRetailCents: 0,
  referredCustomerPaysDifference: true,
  referrerEligibleServiceSlugs: [],
  referrerEligibleAddonSlugs: [],
  referrerVehicleRestrictions: [],
  referrerExclusions: [],
  referrerMaximumRetailCents: 0,
  referrerCustomerPaysDifference: true,
  minCompletedBookings: 1,
  maxRewardsPerCustomer: 10,
  stackingAllowed: false,
  maxDiscountCents: 0,
  rewardExpirationDays: 0,
  rewardUnlockRule: 'completed_paid',
  reviewRewardEnabled: true,
  reviewRewardType: 'percent',
  reviewRewardValue: 10,
  freeDetailReferralThreshold: 5,
  freeDetailServiceSlug: 'full-detail',
  rewardLadder: [
    { threshold: 1, rewardType: 'percent', rewardValue: 15, label: '15% off next detail' },
    { threshold: 3, rewardType: 'custom', rewardValue: 0, label: 'Free upgrade' },
    { threshold: 5, rewardType: 'free_service', rewardValue: 0, label: 'Free full detail' },
  ],
};

export async function loadReferralProgramSettings(admin: SupabaseClient): Promise<ReferralProgramSettings> {
  const { data } = await admin.from('site_settings').select('value').eq('key', 'referral_program').maybeSingle();
  if (!data?.value) return DEFAULT_REFERRAL_SETTINGS;
  try {
    const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    const merged = { ...DEFAULT_REFERRAL_SETTINGS, ...(raw as Partial<ReferralProgramSettings>) };
    merged.referrerRewardValue = Math.max(0, Number(merged.referrerRewardValue) || 0);
    merged.referredRewardValue = Math.max(0, Number(merged.referredRewardValue) || 0);
    merged.freeDetailReferralThreshold = Math.max(1, Number(merged.freeDetailReferralThreshold) || 1);
    merged.rewardLadder = Array.isArray(merged.rewardLadder)
      ? merged.rewardLadder
          .filter((tier) => tier && Number(tier.threshold) > 0)
          .map((tier) => ({ ...tier, threshold: Math.max(1, Math.floor(Number(tier.threshold))), rewardValue: Math.max(0, Number(tier.rewardValue) || 0), label: String(tier.label ?? '').trim() || formatRewardSummary(String(tier.rewardType), Number(tier.rewardValue) || 0) }))
          .sort((a, b) => a.threshold - b.threshold)
      : [];
    if (!merged.rewardLadder?.length) merged.rewardLadder = DEFAULT_REFERRAL_SETTINGS.rewardLadder;
    if (!merged.rewardUnlockRule) merged.rewardUnlockRule = 'completed_paid';
    return merged;
  } catch {
    return DEFAULT_REFERRAL_SETTINGS;
  }
}

export async function resolveReferrerByCode(
  admin: SupabaseClient,
  code: string,
): Promise<{ customerId: string; code: string } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;
  const { data } = await admin
    .from('customer_referral_codes')
    .select('customer_id, code')
    .ilike('code', normalized)
    .maybeSingle();
  if (!data?.customer_id) return null;
  return { customerId: String(data.customer_id), code: String(data.code) };
}
