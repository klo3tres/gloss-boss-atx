import type { SupabaseClient } from '@supabase/supabase-js';
import { calculateLoyaltyStatus, type LoyaltyStampRow } from '@/lib/loyalty-ledger';

export const DEFAULT_LOYALTY_REWARD_CENTS = 7500;

export type LoyaltyRewardConfig = {
  rewardThreshold: number;
  rewardDescription: string;
  rewardCents: number;
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
  };
}

export async function countRedeemedLoyaltyRewards(admin: SupabaseClient, customerId: string): Promise<number> {
  const { count } = await admin
    .from('customer_credits')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', customerId)
    .eq('type', 'loyalty_reward')
    .neq('status', 'voided');
  return count ?? 0;
}

export function buildLoyaltyRewardView(
  stamps: LoyaltyStampRow[],
  redeemedRewards: number,
  opts: { rewardThreshold?: number } = {},
) {
  const loyalty = calculateLoyaltyStatus(stamps, { rewardThreshold: opts.rewardThreshold, redeemedRewards });
  const claimableRewards = Math.max(0, loyalty.rewardsEarned - redeemedRewards);
  return {
    ...loyalty,
    claimableRewards,
    canClaim: claimableRewards > 0,
  };
}
