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

export function referralLinkForCode(code: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  return `${base}/book?ref=${encodeURIComponent(code)}`;
}

export type ReferralProgramSettings = {
  enabled: boolean;
  referrerRewardType: 'percent' | 'dollar' | 'free_service' | 'custom';
  referrerRewardValue: number;
  referredRewardType: 'percent' | 'dollar' | 'free_service' | 'custom';
  referredRewardValue: number;
  minCompletedBookings: number;
  maxRewardsPerCustomer: number;
  stackingAllowed: boolean;
  reviewRewardEnabled: boolean;
  reviewRewardType: 'percent' | 'dollar' | 'free_service' | 'custom';
  reviewRewardValue: number;
  freeDetailReferralThreshold: number;
  freeDetailServiceSlug: string;
};

export const DEFAULT_REFERRAL_SETTINGS: ReferralProgramSettings = {
  enabled: true,
  referrerRewardType: 'percent',
  referrerRewardValue: 15,
  referredRewardType: 'percent',
  referredRewardValue: 10,
  minCompletedBookings: 1,
  maxRewardsPerCustomer: 10,
  stackingAllowed: false,
  reviewRewardEnabled: true,
  reviewRewardType: 'percent',
  reviewRewardValue: 10,
  freeDetailReferralThreshold: 5,
  freeDetailServiceSlug: 'full-detail',
};

export async function loadReferralProgramSettings(admin: SupabaseClient): Promise<ReferralProgramSettings> {
  const { data } = await admin.from('site_settings').select('value').eq('key', 'referral_program').maybeSingle();
  if (!data?.value) return DEFAULT_REFERRAL_SETTINGS;
  try {
    const raw = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    return { ...DEFAULT_REFERRAL_SETTINGS, ...(raw as Partial<ReferralProgramSettings>) };
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
