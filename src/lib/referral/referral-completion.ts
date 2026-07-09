import type { SupabaseClient } from '@supabase/supabase-js';
import { loadReferralProgramSettings } from '@/lib/referral/referral-codes';
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

  await recordReferralEvent(admin, {
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
  const ladder = settings.rewardLadder ?? [];
  const tier = [...ladder].reverse().find((t) => completed >= t.threshold);
  const rewardType = tier?.rewardType ?? settings.referrerRewardType;
  const rewardValue = tier?.rewardValue ?? settings.referrerRewardValue;
  const rewardLabel = tier?.label ?? `${rewardValue}${rewardType === 'percent' ? '%' : ''} off next detail`;

  const { data: existingReward } = await admin
    .from('referral_rewards')
    .select('id')
    .eq('customer_id', referrerId)
    .contains('metadata', { appointment_id: appointmentId })
    .maybeSingle();

  if (existingReward?.id) return { ok: true, rewardIssued: false };

  const { data: reward, error } = await admin
    .from('referral_rewards')
    .insert({
      customer_id: referrerId,
      reward_type: rewardType,
      reward_value: rewardValue,
      reward_label: rewardLabel,
      status: 'pending',
      metadata: { appointment_id: appointmentId, referral_code: code, completed_count: completed },
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

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
