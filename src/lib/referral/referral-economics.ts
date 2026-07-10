import type { ReferralProgramSettings } from '@/lib/referral/referral-codes';

export type ReferralEconomicsInsight = {
  currentRewardLabel: string;
  suggestedRewardLabel: string;
  avgReferralSpend: number;
  expectedRoiMultiple: number;
  rationale: string;
};

function formatReward(type: string, value: number): string {
  if (type === 'percent') return `${value}%`;
  if (type === 'dollar') return `$${value}`;
  if (type === 'free_service') return 'Free service';
  return `${value}`;
}

/** Titan-style referral economics — uses avg ticket from completed referred jobs when available. */
export function analyzeReferralEconomics(
  settings: ReferralProgramSettings,
  avgReferralSpend = 220,
): ReferralEconomicsInsight {
  const current =
    settings.referrerRewardType === 'dollar'
      ? settings.referrerRewardValue
      : Math.round(avgReferralSpend * (settings.referrerRewardValue / 100));

  const suggested = Math.min(75, Math.max(current + 10, Math.round(avgReferralSpend * 0.16)));
  const expectedRoiMultiple = suggested > 0 ? Math.round((avgReferralSpend / suggested) * 10) / 10 : 0;

  return {
    currentRewardLabel: formatReward(settings.referrerRewardType, settings.referrerRewardValue),
    suggestedRewardLabel: `$${suggested}`,
    avgReferralSpend,
    expectedRoiMultiple,
    rationale: `Average referred customer spends $${avgReferralSpend.toFixed(0)}. Increasing referrer reward to $${suggested} projects ~${expectedRoiMultiple}x ROI while staying below one detail margin.`,
  };
}
