import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRewardSummary, type ReferralRewardType } from '@/lib/referral/referral-codes';

export type RewardEligibility = {
  eligibleServiceSlugs?: string[];
  eligibleAddonSlugs?: string[];
  serviceCategory?: string;
  maximumRetailCents?: number;
  customerPaysDifference?: boolean;
  vehicleRestrictions?: string[];
  exclusions?: string[];
  stackingAllowed?: boolean;
};

export async function issueReferralReward(
  admin: SupabaseClient,
  input: {
    customerId: string;
    referralEventId?: string | null;
    referralCode: string;
    appointmentId?: string | null;
    issuanceKey: string;
    scope: 'base' | 'milestone';
    milestoneThreshold?: number | null;
    rewardType: ReferralRewardType;
    rewardValue: number;
    label?: string;
    expirationDays?: number;
    eligibility?: RewardEligibility;
    metadata?: Record<string, unknown>;
  },
): Promise<{ issued: boolean; rewardId?: string; creditId?: string; error?: string }> {
  const existing = await admin.from('referral_rewards').select('id, customer_credit_id, reward_type, reward_value, reward_label, expires_at').eq('issuance_key', input.issuanceKey).maybeSingle();
  if (existing.data?.id) {
    let existingCreditId = existing.data.customer_credit_id ? String(existing.data.customer_credit_id) : undefined;
    const creditType = existing.data.reward_type === 'dollar' || existing.data.reward_type === 'membership_credit';
    if (!existingCreditId && creditType && Number(existing.data.reward_value ?? 0) > 0) {
      const source = `referral:${input.issuanceKey}`;
      const amountCents = Math.max(1, Math.round(Number(existing.data.reward_value) * 100));
      const insertedCredit = await admin.from('customer_credits').insert({
        customer_id: input.customerId,
        amount_cents: amountCents,
        remaining_cents: amountCents,
        type: existing.data.reward_type === 'membership_credit' ? 'membership_credit' : 'referral_reward',
        reason: existing.data.reward_label ?? formatRewardSummary(String(existing.data.reward_type), Number(existing.data.reward_value)),
        source,
        status: 'active',
        expires_at: existing.data.expires_at,
      }).select('id').maybeSingle();
      if (insertedCredit.error && !/duplicate|unique/i.test(insertedCredit.error.message)) return { issued: false, rewardId: String(existing.data.id), error: insertedCredit.error.message };
      existingCreditId = insertedCredit.data?.id ? String(insertedCredit.data.id) : undefined;
      if (!existingCreditId) {
        const recovered = await admin.from('customer_credits').select('id').eq('source', source).maybeSingle();
        existingCreditId = recovered.data?.id ? String(recovered.data.id) : undefined;
      }
      if (existingCreditId) await admin.from('referral_rewards').update({ customer_credit_id: existingCreditId }).eq('id', existing.data.id);
    }
    return { issued: false, rewardId: String(existing.data.id), creditId: existingCreditId };
  }

  const now = new Date();
  const expiresAt = input.expirationDays && input.expirationDays > 0
    ? new Date(now.getTime() + input.expirationDays * 86400000).toISOString()
    : null;
  const label = input.label?.trim() || formatRewardSummary(input.rewardType, input.rewardValue);
  const inserted = await admin.from('referral_rewards').insert({
    customer_id: input.customerId,
    referral_event_id: input.referralEventId ?? null,
    reward_type: input.rewardType,
    reward_value: input.rewardValue,
    reward_label: label,
    reward_scope: input.scope,
    milestone_threshold: input.milestoneThreshold ?? null,
    issuance_key: input.issuanceKey,
    status: 'available',
    issued_at: now.toISOString(),
    expires_at: expiresAt,
    eligibility: input.eligibility ?? {},
    metadata: {
      referral_code: input.referralCode,
      appointment_id: input.appointmentId ?? null,
      expires_at: expiresAt,
      ...input.metadata,
    },
  }).select('id').maybeSingle();
  if (inserted.error || !inserted.data?.id) {
    if (/duplicate|unique/i.test(inserted.error?.message ?? '')) return { issued: false };
    return { issued: false, error: inserted.error?.message ?? 'Reward insert failed' };
  }

  const rewardId = String(inserted.data.id);
  let creditId: string | undefined;
  if ((input.rewardType === 'dollar' || input.rewardType === 'membership_credit') && input.rewardValue > 0) {
    const amountCents = Math.max(1, Math.round(input.rewardValue * 100));
    const source = `referral:${input.issuanceKey}`;
    const credit = await admin.from('customer_credits').insert({
      customer_id: input.customerId,
      amount_cents: amountCents,
      remaining_cents: amountCents,
      type: input.rewardType === 'membership_credit' ? 'membership_credit' : 'referral_reward',
      reason: label,
      source,
      status: 'active',
      expires_at: expiresAt,
    }).select('id').maybeSingle();
    if (credit.error && !/duplicate|unique/i.test(credit.error.message)) return { issued: true, rewardId, error: credit.error.message };
    creditId = credit.data?.id ? String(credit.data.id) : undefined;
    if (creditId) await admin.from('referral_rewards').update({ customer_credit_id: creditId }).eq('id', rewardId);
  }

  await admin.from('customer_timeline_events').insert({
    customer_id: input.customerId,
    event_type: input.scope === 'milestone' ? 'referral_milestone_reward_available' : 'referral_reward_available',
    title: input.scope === 'milestone' ? 'Referral milestone unlocked' : 'Referral reward available',
    detail: label,
    href: '/dashboard',
    metadata: { referral_reward_id: rewardId, issuance_key: input.issuanceKey },
  });

  try {
    const { logTitanActivity } = await import('@/lib/titan/activity-feed');
    await logTitanActivity(admin, {
      kind: 'referral_reward_issued',
      title: input.scope === 'milestone' ? 'Referral milestone issued' : 'Referral reward issued',
      detail: label,
      href: '/admin/referrals',
      metadata: { customer_id: input.customerId, referral_reward_id: rewardId, issuance_key: input.issuanceKey },
    });
  } catch {
    /* non-blocking */
  }
  return { issued: true, rewardId, creditId };
}

export async function redeemReservedReferralRewardForAppointment(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ redeemed: boolean; rewardId?: string; error?: string }> {
  const reward = await admin
    .from('referral_rewards')
    .select('id, customer_id, reward_label, status')
    .eq('reserved_appointment_id', appointmentId)
    .eq('status', 'reserved')
    .maybeSingle();
  if (reward.error) return { redeemed: false, error: reward.error.message };
  if (!reward.data?.id) return { redeemed: false };
  const now = new Date().toISOString();
  const update = await admin
    .from('referral_rewards')
    .update({ status: 'redeemed', redeemed_at: now })
    .eq('id', reward.data.id)
    .eq('status', 'reserved');
  if (update.error) return { redeemed: false, error: update.error.message };
  await admin.from('customer_timeline_events').insert({
    customer_id: reward.data.customer_id,
    event_type: 'referral_reward_redeemed',
    title: 'Reward redeemed',
    detail: reward.data.reward_label ?? 'Referral reward',
    href: `/portal/job?appointment_id=${encodeURIComponent(appointmentId)}`,
    metadata: { referral_reward_id: reward.data.id, appointment_id: appointmentId },
  });
  try {
    const { logTitanActivity } = await import('@/lib/titan/activity-feed');
    await logTitanActivity(admin, {
      kind: 'referral_reward_redeemed',
      title: 'Referral reward redeemed',
      detail: reward.data.reward_label ?? 'Referral reward',
      href: `/admin/work-orders/${encodeURIComponent(appointmentId)}`,
      metadata: { customer_id: reward.data.customer_id, referral_reward_id: reward.data.id, appointment_id: appointmentId },
    });
  } catch {
    /* non-blocking */
  }
  return { redeemed: true, rewardId: String(reward.data.id) };
}

export async function redeemReferralRewardForCredit(
  admin: SupabaseClient,
  creditId: string,
  appointmentId: string,
): Promise<{ redeemed: boolean; rewardId?: string; error?: string }> {
  const reward = await admin
    .from('referral_rewards')
    .select('id, customer_id, reward_label, status')
    .eq('customer_credit_id', creditId)
    .maybeSingle();
  if (reward.error) return { redeemed: false, error: reward.error.message };
  if (!reward.data?.id) return { redeemed: false };
  if (reward.data.status === 'redeemed') return { redeemed: true, rewardId: String(reward.data.id) };
  const now = new Date().toISOString();
  const update = await admin.from('referral_rewards').update({
    status: 'redeemed',
    redeemed_at: now,
    reserved_appointment_id: appointmentId,
  }).eq('id', reward.data.id);
  if (update.error) return { redeemed: false, error: update.error.message };
  await admin.from('customer_timeline_events').insert({
    customer_id: reward.data.customer_id,
    event_type: 'referral_reward_redeemed',
    title: 'Referral credit redeemed',
    detail: reward.data.reward_label ?? 'Referral credit',
    href: `/portal/job?appointment_id=${encodeURIComponent(appointmentId)}`,
    metadata: { referral_reward_id: reward.data.id, credit_id: creditId, appointment_id: appointmentId },
  });
  try {
    const { logTitanActivity } = await import('@/lib/titan/activity-feed');
    await logTitanActivity(admin, {
      kind: 'referral_reward_redeemed',
      title: 'Referral credit redeemed',
      detail: reward.data.reward_label ?? 'Referral credit',
      href: `/admin/work-orders/${encodeURIComponent(appointmentId)}`,
      metadata: { customer_id: reward.data.customer_id, referral_reward_id: reward.data.id, credit_id: creditId, appointment_id: appointmentId },
    });
  } catch {
    /* non-blocking */
  }
  return { redeemed: true, rewardId: String(reward.data.id) };
}
