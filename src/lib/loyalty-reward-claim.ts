import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateLoyaltyStatus, type LoyaltyStampRow } from '@/lib/loyalty-ledger';

export const DEFAULT_LOYALTY_REWARD_CENTS = 7500;

export type LoyaltyRewardConfig = {
  rewardThreshold: number;
  rewardDescription: string;
  rewardCents: number;
  rewardType: string;
  freeServiceSlug: string | null;
  eligibleServiceSlugs: string[];
  expirationDays: number;
  customerPaysDifference: boolean;
  maximumValueCents: number;
  resetBehavior: 'reset_to_zero' | 'subtract_threshold' | 'advance_tier';
  tierThresholds: number[];
};

export async function loadLoyaltyRewardConfig(admin: SupabaseClient): Promise<LoyaltyRewardConfig> {
  const { data } = await admin
    .from('loyalty_rules')
    .select('services_required, reward_description, reward_payload')
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload =
    data?.reward_payload && typeof data.reward_payload === 'object'
      ? (data.reward_payload as Record<string, unknown>)
      : {};
  const rewardCents = Math.max(
    0,
    Number(payload.reward_cents ?? payload.credit_cents ?? DEFAULT_LOYALTY_REWARD_CENTS) || DEFAULT_LOYALTY_REWARD_CENTS,
  );

  return {
    rewardThreshold: Math.max(1, Number(data?.services_required ?? 5) || 5),
    rewardDescription: String(data?.reward_description ?? 'Punch card reward — applies to your next detail'),
    rewardCents,
    rewardType: String(payload.reward_type ?? 'credit'),
    freeServiceSlug: payload.free_service_slug ? String(payload.free_service_slug) : null,
    eligibleServiceSlugs: Array.isArray(payload.eligible_service_slugs) ? payload.eligible_service_slugs.map(String).filter(Boolean) : [],
    expirationDays: Math.max(1, Number(payload.expiration_days ?? 365) || 365),
    customerPaysDifference: payload.customer_pays_difference === true,
    maximumValueCents: Math.max(0, Number(payload.maximum_value_cents ?? rewardCents) || rewardCents),
    resetBehavior: ['reset_to_zero', 'subtract_threshold', 'advance_tier'].includes(String(payload.reset_behavior))
      ? String(payload.reset_behavior) as LoyaltyRewardConfig['resetBehavior']
      : 'subtract_threshold',
    tierThresholds: Array.isArray(payload.tier_thresholds)
      ? payload.tier_thresholds.map(Number).filter((value) => Number.isFinite(value) && value > 0)
      : [],
  };
}

export async function loadLoyaltyRewardState(admin: SupabaseClient, customerId: string): Promise<{
  issuedRewards: number;
  redeemedRewards: number;
  consumedStamps: number;
}> {
  const [issued, used, resets] = await Promise.all([
    admin.from('customer_credits').select('id', { count: 'exact', head: true }).eq('customer_id', customerId).eq('type', 'loyalty_reward').neq('status', 'voided'),
    admin.from('customer_credits').select('id', { count: 'exact', head: true }).eq('customer_id', customerId).eq('type', 'loyalty_reward').eq('status', 'used'),
    admin.from('loyalty_reset_events').select('consumed_punches').eq('customer_id', customerId),
  ]);
  return {
    issuedRewards: issued.count ?? 0,
    redeemedRewards: used.count ?? 0,
    consumedStamps: resets.error ? 0 : (resets.data ?? []).reduce((sum, row) => sum + Math.max(0, Number(row.consumed_punches ?? 0) || 0), 0),
  };
}

export function buildLoyaltyRewardView(
  stamps: LoyaltyStampRow[],
  issuedRewards: number,
  opts: { rewardThreshold?: number; redeemedRewards?: number; resetBehavior?: LoyaltyRewardConfig['resetBehavior']; tierThresholds?: number[]; consumedStamps?: number } = {},
) {
  const loyalty = calculateLoyaltyStatus(stamps, {
    rewardThreshold: opts.rewardThreshold,
    redeemedRewards: opts.redeemedRewards ?? issuedRewards,
    resetBehavior: opts.resetBehavior,
    tierThresholds: opts.tierThresholds,
    consumedStamps: opts.consumedStamps,
  });
  const claimableRewards = Math.max(0, loyalty.rewardsEarned - issuedRewards);
  return {
    ...loyalty,
    claimableRewards,
    canClaim: claimableRewards > 0,
  };
}
