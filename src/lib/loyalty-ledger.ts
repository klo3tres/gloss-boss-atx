export type LoyaltyStampRow = {
  stamp_count?: number | null;
  voided?: boolean | null;
  voided_at?: string | null;
};

export type LoyaltyStatus = {
  totalStamps: number;
  rewardThreshold: number;
  cycleSize: number;
  progressStamps: number;
  rewardReady: boolean;
  rewardsEarned: number;
  stampsUntilReward: number;
};

export function calculateLoyaltyStatus(
  stamps: LoyaltyStampRow[] = [],
  opts: { rewardThreshold?: number; redeemedRewards?: number } = {},
): LoyaltyStatus {
  const rewardThreshold = Math.max(1, Number(opts.rewardThreshold ?? 5) || 5);
  const cycleSize = rewardThreshold + 1;
  const redeemedRewards = Math.max(0, Number(opts.redeemedRewards ?? 0) || 0);
  const totalStamps = stamps
    .filter((stamp) => stamp.voided !== true && !stamp.voided_at)
    .reduce((sum, stamp) => sum + Math.max(0, Number(stamp.stamp_count ?? 1) || 1), 0);
  const rewardsEarned = Math.floor(totalStamps / cycleSize);
  const availableRewards = Math.max(0, rewardsEarned - redeemedRewards);
  const remainder = totalStamps % cycleSize;
  const rewardReady = availableRewards > 0 || (totalStamps > 0 && remainder === 0 && totalStamps >= cycleSize);
  const progressStamps = rewardReady ? rewardThreshold : Math.min(rewardThreshold, remainder);
  return {
    totalStamps,
    rewardThreshold,
    cycleSize,
    progressStamps,
    rewardReady,
    rewardsEarned,
    stampsUntilReward: rewardReady ? 0 : Math.max(0, cycleSize - remainder),
  };
}
