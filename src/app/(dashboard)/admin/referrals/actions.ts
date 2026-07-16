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
function list(v: FormDataEntryValue | null) {
  return String(v ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

export type ReferralSaveResult = { ok: true } | { ok: false; error: string };

export async function saveReferralProgramSettingsAction(
  _prev: ReferralSaveResult | null,
  formData: FormData,
): Promise<ReferralSaveResult> {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) {
    return { ok: false, error: 'Unauthorized or database unavailable.' };
  }

  const settings = {
    ...DEFAULT_REFERRAL_SETTINGS,
    enabled: formData.get('enabled') === 'on',
    referrerRewardType: String(formData.get('referrer_reward_type') ?? 'percent'),
    referrerRewardValue: num(formData.get('referrer_reward_value'), 15),
    referrerRewardLabel: String(formData.get('referrer_reward_label') ?? '').trim(),
    referredRewardType: String(formData.get('referred_reward_type') ?? 'percent'),
    referredRewardValue: num(formData.get('referred_reward_value'), 10),
    referredRewardLabel: String(formData.get('referred_reward_label') ?? '').trim(),
    referredEligibleServiceSlugs: list(formData.get('referred_eligible_services')),
    referredEligibleAddonSlugs: list(formData.get('referred_eligible_addons')),
    referredVehicleRestrictions: list(formData.get('referred_vehicle_restrictions')),
    referredExclusions: list(formData.get('referred_exclusions')),
    referredMaximumRetailCents: Math.max(0, num(formData.get('referred_maximum_retail_dollars'), 0) * 100),
    referredCustomerPaysDifference: formData.get('referred_customer_pays_difference') === 'on',
    referrerEligibleServiceSlugs: list(formData.get('referrer_eligible_services')),
    referrerEligibleAddonSlugs: list(formData.get('referrer_eligible_addons')),
    referrerVehicleRestrictions: list(formData.get('referrer_vehicle_restrictions')),
    referrerExclusions: list(formData.get('referrer_exclusions')),
    referrerMaximumRetailCents: Math.max(0, num(formData.get('referrer_maximum_retail_dollars'), 0) * 100),
    referrerCustomerPaysDifference: formData.get('referrer_customer_pays_difference') === 'on',
    minCompletedBookings: num(formData.get('min_completed_bookings'), 1),
    maxRewardsPerCustomer: num(formData.get('max_rewards_per_customer'), 10),
    stackingAllowed: formData.get('stacking_allowed') === 'on',
    rewardExpirationDays: Math.max(0, num(formData.get('reward_expiration_days'), 0)),
    reviewRewardEnabled: formData.get('review_reward_enabled') === 'on',
    reviewRewardType: String(formData.get('review_reward_type') ?? 'percent'),
    reviewRewardValue: num(formData.get('review_reward_value'), 10),
    freeDetailReferralThreshold: num(formData.get('free_detail_threshold'), 5),
    freeDetailServiceSlug: String(formData.get('free_detail_service_slug') ?? 'full-detail'),
    rewardUnlockRule: String(formData.get('reward_unlock_rule') ?? 'completed_paid') as 'booked' | 'completed_paid',
    rewardLadder: (() => {
      try {
        const raw = String(formData.get('reward_ladder_json') ?? '').trim();
        if (!raw) return DEFAULT_REFERRAL_SETTINGS.rewardLadder;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : DEFAULT_REFERRAL_SETTINGS.rewardLadder;
      } catch {
        return DEFAULT_REFERRAL_SETTINGS.rewardLadder;
      }
    })(),
  };

  const { error } = await admin.from('site_settings').upsert(
    {
      key: 'referral_program',
      value: JSON.stringify(settings),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  if (error) {
    console.error('[referrals] save failed', error.message);
    return { ok: false, error: error.message };
  }

  try {
    const { logTitanActivity } = await import('@/lib/titan/activity-feed');
    await logTitanActivity(admin, {
      kind: 'referral_settings_changed',
      title: 'Referral program settings updated',
      detail: `Stacking ${settings.stackingAllowed ? 'on' : 'off'} · referrer ${settings.referrerRewardValue}${settings.referrerRewardType === 'percent' ? '%' : '¢'} · referred ${settings.referredRewardValue}${settings.referredRewardType === 'percent' ? '%' : '¢'}`,
      metadata: { actor_user_id: session.user.id },
    });
  } catch {
    /* non-blocking */
  }

  revalidatePath('/admin/referrals');
  revalidatePath('/book');
  revalidatePath('/dashboard');
  revalidatePath('/referrals');
  revalidatePath('/');
  revalidatePath('/api/public/referral-settings');
  return { ok: true };
}

export async function issueReferralRewardAction(rewardId: string) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return { error: 'Forbidden' };
  const { error } = await admin.from('referral_rewards').update({ status: 'issued', issued_at: new Date().toISOString() }).eq('id', rewardId);
  revalidatePath('/admin/referrals');
  return error ? { error: error.message } : { ok: true };
}

export async function voidReferralRewardAction(rewardId: string) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return { error: 'Forbidden' };
  const { error } = await admin.from('referral_rewards').update({ status: 'expired' }).eq('id', rewardId);
  revalidatePath('/admin/referrals');
  return error ? { error: error.message } : { ok: true };
}
