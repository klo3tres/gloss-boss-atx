'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { DEFAULT_REFERRAL_SETTINGS } from '@/lib/referral/referral-codes';

function num(v: FormDataEntryValue | null, fallback: number) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : fallback;
}

export async function saveReferralProgramSettingsAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return;

  const settings = {
    ...DEFAULT_REFERRAL_SETTINGS,
    enabled: formData.get('enabled') === 'on',
    referrerRewardType: String(formData.get('referrer_reward_type') ?? 'percent'),
    referrerRewardValue: num(formData.get('referrer_reward_value'), 15),
    referredRewardType: String(formData.get('referred_reward_type') ?? 'percent'),
    referredRewardValue: num(formData.get('referred_reward_value'), 10),
    minCompletedBookings: num(formData.get('min_completed_bookings'), 1),
    maxRewardsPerCustomer: num(formData.get('max_rewards_per_customer'), 10),
    stackingAllowed: formData.get('stacking_allowed') === 'on',
    reviewRewardEnabled: formData.get('review_reward_enabled') === 'on',
    reviewRewardType: String(formData.get('review_reward_type') ?? 'percent'),
    reviewRewardValue: num(formData.get('review_reward_value'), 10),
    freeDetailReferralThreshold: num(formData.get('free_detail_threshold'), 5),
    freeDetailServiceSlug: String(formData.get('free_detail_service_slug') ?? 'full-detail'),
  };

  await admin.from('site_settings').upsert({ key: 'referral_program', value: settings });
  revalidatePath('/admin/referrals');
}
