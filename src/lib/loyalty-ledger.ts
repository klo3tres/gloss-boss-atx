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
  opts: {
    rewardThreshold?: number;
    redeemedRewards?: number;
    resetBehavior?: 'reset_to_zero' | 'subtract_threshold' | 'advance_tier';
    tierThresholds?: number[];
    consumedStamps?: number;
  } = {},
): LoyaltyStatus {
  const redeemedRewards = Math.max(0, Number(opts.redeemedRewards ?? 0) || 0);
  const tierThresholds = (opts.tierThresholds ?? []).map(Number).filter((value) => Number.isFinite(value) && value > 0);
  const tierIndex = opts.resetBehavior === 'advance_tier' ? Math.min(redeemedRewards, Math.max(0, tierThresholds.length - 1)) : 0;
  const rewardThreshold = Math.max(1, Number(tierThresholds[tierIndex] ?? opts.rewardThreshold ?? 5) || 5);
  const cycleSize = rewardThreshold;
  const totalStamps = stamps
    .filter((stamp) => stamp.voided !== true && !stamp.voided_at)
    .reduce((sum, stamp) => sum + Math.max(0, Number(stamp.stamp_count ?? 1) || 1), 0);
  const calculatedConsumed = opts.resetBehavior === 'advance_tier'
    ? Array.from({ length: redeemedRewards }, (_, index) => (tierThresholds[Math.min(index, Math.max(0, tierThresholds.length - 1))] ?? rewardThreshold)).reduce((sum, value) => sum + value, 0)
    : redeemedRewards * cycleSize;
  const consumedBeforeTier = Math.max(0, Number(opts.consumedStamps ?? calculatedConsumed) || 0);
  const effectiveStamps = Math.max(0, totalStamps - consumedBeforeTier);
  const rewardsEarned = redeemedRewards + Math.floor(effectiveStamps / cycleSize);
  const availableRewards = Math.max(0, rewardsEarned - redeemedRewards);
  const remainder = effectiveStamps % cycleSize;
  const rewardReady = availableRewards > 0 || (effectiveStamps > 0 && remainder === 0 && effectiveStamps >= cycleSize);
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
