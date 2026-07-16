import type { SupabaseClient } from '@supabase/supabase-js';
import { formatReferrerReward, loadReferralProgramSettings } from '@/lib/referral/referral-codes';
import { recordReferralEvent } from '@/lib/referral/referral-events';
import { sendReferralNotification } from '@/lib/referral/referral-notifications';
import { issueReferralReward, redeemReservedReferralRewardForAppointment } from '@/lib/referral/referral-reward-issuer';

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

  if (isCompleted && isPaid) {
    const redemption = await redeemReservedReferralRewardForAppointment(admin, appointmentId);
    if (redemption.error) return { ok: false, error: redemption.error };
  }

  const settings = await loadReferralProgramSettings(admin);
  if (!settings.enabled) return { ok: true, rewardIssued: false };

  if (settings.rewardUnlockRule === 'completed_paid' && (!isCompleted || !isPaid)) {
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

  const completedEvent = isCompleted && isPaid
    ? await recordReferralEvent(admin, {
        referralCode: code,
        referrerCustomerId: referrerId,
        status: 'completed',
        appointmentId,
        referredCustomerId: str(appt.customer_id) || null,
        referredEmail: str((appt as { guest_email?: string }).guest_email) || null,
      })
    : { ok: true as const, eventId: String((await admin.from('referral_events').select('id').eq('appointment_id', appointmentId).maybeSingle()).data?.id ?? '') };
  if (!completedEvent.ok) return { ok: false, error: completedEvent.error };

  const { count: completedCount } = await admin
    .from('referral_events')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_customer_id', referrerId)
    .in('status', ['completed', 'reward_issued']);

  const completed = completedCount ?? 0;
  const { count: bookedCount } = await admin
    .from('referral_events')
    .select('id', { count: 'exact', head: true })
    .eq('referrer_customer_id', referrerId)
    .in('status', ['booked', 'completed', 'reward_issued']);
  const qualifyingCount = settings.rewardUnlockRule === 'booked' ? (bookedCount ?? 0) : completed;
  const referredCustomerId = str(appt.customer_id);
  const referredEmail = str((appt as { guest_email?: string }).guest_email).toLowerCase();
  let firstReferralQuery = admin
    .from('referral_events')
    .select('appointment_id')
    .eq('referrer_customer_id', referrerId)
    .in('status', settings.rewardUnlockRule === 'booked' ? ['booked', 'completed', 'reward_issued'] : ['completed', 'reward_issued'])
    .order('created_at', { ascending: true })
    .limit(1);
  if (referredCustomerId) firstReferralQuery = firstReferralQuery.eq('referred_customer_id', referredCustomerId);
  else if (referredEmail) firstReferralQuery = firstReferralQuery.ilike('referred_email', referredEmail);
  const firstReferral = referredCustomerId || referredEmail ? await firstReferralQuery.maybeSingle() : { data: null };
  const isFirstRewardForPerson = !firstReferral.data?.appointment_id || String(firstReferral.data.appointment_id) === appointmentId;
  const { count: baseRewardCount } = await admin
    .from('referral_rewards')
    .select('id', { count: 'exact', head: true })
    .eq('customer_id', referrerId)
    .eq('reward_scope', 'base')
    .neq('status', 'voided');
  const mayIssueBase = isFirstRewardForPerson
    && qualifyingCount >= Math.max(1, settings.minCompletedBookings)
    && (settings.maxRewardsPerCustomer <= 0 || (baseRewardCount ?? 0) < settings.maxRewardsPerCustomer);
  const base = mayIssueBase ? await issueReferralReward(admin, {
    customerId: referrerId,
    referralEventId: completedEvent.eventId,
    referralCode: code,
    appointmentId,
    issuanceKey: `referral-base:${appointmentId}`,
    scope: 'base',
    rewardType: settings.referrerRewardType,
    rewardValue: settings.referrerRewardValue,
    label: settings.referrerRewardLabel,
    expirationDays: settings.rewardExpirationDays,
    eligibility: {
      stackingAllowed: settings.stackingAllowed,
      maximumRetailCents: settings.referrerMaximumRetailCents || settings.maxDiscountCents,
      eligibleServiceSlugs: settings.referrerEligibleServiceSlugs?.length ? settings.referrerEligibleServiceSlugs : settings.referrerRewardType === 'free_service' ? [settings.freeDetailServiceSlug] : [],
      eligibleAddonSlugs: settings.referrerEligibleAddonSlugs,
      vehicleRestrictions: settings.referrerVehicleRestrictions,
      exclusions: settings.referrerExclusions,
      customerPaysDifference: settings.referrerCustomerPaysDifference,
    },
    metadata: { completed_count: completed },
  }) : { issued: false };
  if (base.error) return { ok: false, error: base.error };

  let issuedAny = base.issued;
  const milestones = isCompleted && isPaid ? [...(settings.rewardLadder ?? [])].sort((a, b) => a.threshold - b.threshold) : [];
  for (const milestone of milestones) {
    if (completed < milestone.threshold) continue;
    const lastCycle = milestone.repeatable ? Math.floor(completed / milestone.threshold) : 1;
    if (lastCycle < 1) continue;
    for (let cycle = 1; cycle <= lastCycle; cycle++) {
      const milestoneResult = await issueReferralReward(admin, {
      customerId: referrerId,
      referralEventId: completedEvent.eventId,
      referralCode: code,
      appointmentId,
      issuanceKey: `referral-milestone:${referrerId}:${milestone.threshold}:${cycle}`,
      scope: 'milestone',
      milestoneThreshold: milestone.threshold,
      rewardType: milestone.rewardType,
      rewardValue: milestone.rewardValue,
      label: milestone.label,
      expirationDays: milestone.expirationDays ?? settings.rewardExpirationDays,
      eligibility: {
        eligibleServiceSlugs: milestone.eligibleServiceSlugs?.length ? milestone.eligibleServiceSlugs : milestone.rewardType === 'free_service' ? [settings.freeDetailServiceSlug] : [],
        eligibleAddonSlugs: milestone.eligibleAddonSlugs,
        serviceCategory: milestone.serviceCategory,
        maximumRetailCents: milestone.maximumRetailCents,
        customerPaysDifference: milestone.customerPaysDifference,
        vehicleRestrictions: milestone.vehicleRestrictions,
        exclusions: milestone.exclusions,
        stackingAllowed: milestone.stackingAllowed,
      },
      metadata: { completed_count: completed, repeatable: milestone.repeatable === true, internal_notes: milestone.internalNotes ?? null },
      });
      if (milestoneResult.error) return { ok: false, error: milestoneResult.error };
      if (milestoneResult.issued) {
        issuedAny = true;
        await sendReferralNotification(admin, {
          kind: 'reward_earned',
          customerId: referrerId,
          referralCode: code,
          rewardLabel: milestone.label,
          completedCount: completed,
          threshold: milestone.threshold,
        });
      }
      if (!milestone.repeatable) break;
    }
  }

  if (base.issued) {
    await sendReferralNotification(admin, {
      kind: 'reward_earned',
      customerId: referrerId,
      referralCode: code,
      rewardLabel: formatReferrerReward(settings),
      completedCount: completed,
      threshold: settings.freeDetailReferralThreshold,
    });
  }

  return { ok: true, rewardIssued: issuedAny };
}
