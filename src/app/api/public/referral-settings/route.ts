import { NextResponse } from 'next/server';
import { DEFAULT_REFERRAL_SETTINGS, formatReferralHeadline, formatReferralTerms, formatReferredReward, formatReferrerReward, loadReferralProgramSettings } from '@/lib/referral/referral-codes';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export async function GET() {
  const admin = tryCreateAdminSupabase();
  const settings = admin ? await loadReferralProgramSettings(admin) : DEFAULT_REFERRAL_SETTINGS;

  return NextResponse.json({
    ok: true,
    enabled: settings.enabled,
    give: formatReferredReward(settings),
    get: formatReferrerReward(settings),
    givePercent: settings.referredRewardType === 'percent' ? settings.referredRewardValue : null,
    getPercent: settings.referrerRewardType === 'percent' ? settings.referrerRewardValue : null,
    headline: formatReferralHeadline(settings),
    terms: formatReferralTerms(settings),
    stackingAllowed: settings.stackingAllowed,
    rewardUnlockRule: settings.rewardUnlockRule,
  });
}
