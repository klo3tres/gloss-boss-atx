import { NextResponse } from 'next/server';
import { DEFAULT_REFERRAL_SETTINGS, loadReferralProgramSettings } from '@/lib/referral/referral-codes';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function rewardLabel(type: string, value: number) {
  if (type === 'percent') return `${value}%`;
  if (type === 'dollar') return `$${value}`;
  return `${value}`;
}

export async function GET() {
  const admin = tryCreateAdminSupabase();
  const settings = admin ? await loadReferralProgramSettings(admin) : DEFAULT_REFERRAL_SETTINGS;

  return NextResponse.json({
    ok: true,
    enabled: settings.enabled,
    give: rewardLabel(settings.referredRewardType, settings.referredRewardValue),
    get: rewardLabel(settings.referrerRewardType, settings.referrerRewardValue),
    givePercent: settings.referredRewardType === 'percent' ? settings.referredRewardValue : null,
    getPercent: settings.referrerRewardType === 'percent' ? settings.referrerRewardValue : null,
    headline: `Give ${rewardLabel(settings.referredRewardType, settings.referredRewardValue)}, Get ${rewardLabel(settings.referrerRewardType, settings.referrerRewardValue)}`,
    stackingAllowed: settings.stackingAllowed,
    rewardUnlockRule: settings.rewardUnlockRule,
  });
}
