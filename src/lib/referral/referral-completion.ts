import type { SupabaseClient } from '@supabase/supabase-js';
import { formatRewardSummary, loadReferralProgramSettings } from '@/lib/referral/referral-codes';
import { recordReferralEvent } from '@/lib/referral/referral-events';
import { sendReferralNotification } from '@/lib/referral/referral-notifications';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isPaidStatus(paymentStatus: string) {
  const p = paymentStatus.toLowerCase();
  return ['paid', 'succeeded', 'deposit_paid'].includes(p) || p.includes('paid');
}

export async function processReferralJobCompletion(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ ok: boolean; rewardIssued?: boolean; error?: string }> {
  const settings = await loadReferralProgramSettings(admin);
  if (!settings.enabled) return { ok: true, rewardIssued: false };

  const { data: appt } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, booking_pricing_breakdown, payment_status, status, job_completed_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appt) return { ok: false, error: 'Appointment not found' };

  const apptStatus = str(appt.status);
  const paymentStatus = str((appt as { payment_status?: string }).payment_status);
  const isCompleted = apptStatus === 'completed' || Boolean(str((appt as { job_completed_at?: string }).job_completed_at));
  const isPaid = isPaidStatus(paymentStatus);

  if (settings.rewardUnlockRule === 'completed_paid' && (!isCompleted || !isPaid)) {
    return { ok: true, rewardIssued: false };
  }
  if (settings.rewardUnlockRule === 'booked') {
    return { ok: true, rewardIssued: false };
  }

  const breakdown = (appt as { booking_pricing_breakdown?: Record<string, unknown> }).booking_pricing_breakdown ?? {};
  const referralCode = str(breakdown.referral_code);
  const referrerCustomerId = str(breakdown.referrer_customer_id) || null;
  if (!referralCode) {
    const { data: ev } = await admin.from('referral_events').select('*').eq('appointment_id', appointmentId).maybeSingle();
    if (!ev?.referral_code) return { ok: true, rewardIssued: false };
  }

  const code =
    referralCode ||
    str(
      (await admin.from('referral_events').select('referral_code, referrer_customer_id').eq('appointment_id', appointmentId).maybeSingle())
        .data?.referral_code,
    );
  const referrerId =
    referrerCustomerId ||
    str(
      (await admin.from('referral_events').select('referrer_customer_id').eq('appointment_id', appointmentId).maybeSingle()).data
        ?.referrer_customer_id,
    );

  if (!code || !referrerId) return { ok: true, rewardIssued: false };

  const completedEvent = await recordReferralEvent(admin, {
    referralCode: code,
    referrerCustomerId: referrerId,
    status: 'completed',
    appointmentId,
    referredCustomerId: str(appt.customer_id) || null,
    referredEmail: str((appt as { guest_email?: string }).guest_email) || null,
  });

  const { count: completedCount } = await admin
    .from('referral_events')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_customer_id', referrerId)
    .in('status', ['completed', 'reward_issued']);

  const completed = completedCount ?? 0;
  // The per-referral reward always comes from the referrer setting. Ladder
  // milestones are separate bonuses and must never replace the saved base reward.
  const rewardType = settings.referrerRewardType;
  const rewardValue = settings.referrerRewardValue;
  const rewardLabel = formatRewardSummary(rewardType, rewardValue);

  const { data: existingReward } = await admin
    .from('referral_rewards')
    .select('id, status')
    .eq('customer_id', referrerId)
    .contains('metadata', { appointment_id: appointmentId })
    .maybeSingle();

  if (existingReward?.id) return { ok: true, rewardIssued: false };

  const now = new Date();
  const expiresAt = settings.rewardExpirationDays && settings.rewardExpirationDays > 0
    ? new Date(now.getTime() + settings.rewardExpirationDays * 86400000).toISOString()
    : null;

  const { data: reward, error } = await admin
    .from('referral_rewards')
    .insert({
      customer_id: referrerId,
      referral_event_id: completedEvent.eventId ?? null,
      reward_type: rewardType,
      reward_value: rewardValue,
      reward_label: rewardLabel,
      status: 'issued',
      issued_at: now.toISOString(),
      expires_at: expiresAt,
      metadata: { appointment_id: appointmentId, referral_code: code, completed_count: completed, expires_at: expiresAt },
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  if (rewardType === 'dollar' && rewardValue > 0) {
    const amountCents = Math.max(1, Math.round(rewardValue * 100));
    const source = `referral:${appointmentId}`;
    const existingCredit = await admin.from('customer_credits').select('id').eq('source', source).maybeSingle();
    const credit = existingCredit.data?.id
      ? { data: existingCredit.data, error: null }
      : await admin.from('customer_credits').insert({
        customer_id: referrerId,
        amount_cents: amountCents,
        remaining_cents: amountCents,
        type: 'referral_reward',
        reason: rewardLabel,
        source,
        status: 'active',
        expires_at: expiresAt,
      }).select('id').maybeSingle();
    if (credit.error) return { ok: false, error: `Reward saved but account credit failed: ${credit.error.message}` };
    if (credit.data?.id && reward?.id) {
      await admin.from('referral_rewards').update({ customer_credit_id: credit.data.id }).eq('id', reward.id);
    }
  }

  await admin.from('customer_timeline_events').insert({
    customer_id: referrerId,
    event_type: 'referral_reward_available',
    title: 'Referral reward available',
    detail: rewardLabel,
    href: '/dashboard',
    metadata: { appointment_id: appointmentId, referral_code: code, referral_reward_id: reward?.id },
  });

  try {
    const { logTitanActivity } = await import('@/lib/titan/activity-feed');
    await logTitanActivity(admin, {
      kind: 'referral_reward_issued',
      title: 'Referral reward issued',
      detail: rewardLabel,
      metadata: { customer_id: referrerId, appointment_id: appointmentId, referral_reward_id: reward?.id },
    });
  } catch {
    /* non-blocking */
  }

  await recordReferralEvent(admin, {
    referralCode: code,
    referrerCustomerId: referrerId,
    status: 'reward_issued',
    appointmentId,
  });

  await sendReferralNotification(admin, {
    kind: 'reward_earned',
    customerId: referrerId,
    referralCode: code,
    rewardLabel,
    completedCount: completed,
    threshold: settings.freeDetailReferralThreshold,
  });

  return { ok: true, rewardIssued: Boolean(reward?.id) };
}
