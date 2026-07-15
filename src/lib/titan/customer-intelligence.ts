import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayMoney } from '@/lib/display-format';
import { buildLoyaltyRewardView, loadLoyaltyRewardConfig, loadLoyaltyRewardState } from '@/lib/loyalty-reward-claim';
import { recommendMembershipTier } from '@/lib/membership-roi';

export type CustomerIntelligence = {
  lifetimeValueCents: number;
  avgSpendCents: number;
  visitCount: number;
  avgDaysBetweenVisits: number | null;
  avgServiceLengthMinutes: number | null;
  membershipProbability: number;
  membershipReason: string;
  referralProbability: number;
  referralReason: string;
  reviewProbability: number;
  reviewReason: string;
  upsellProbability: number;
  upsellReason: string;
  nextRecommendedService: string;
  nextServiceReason: string;
  primaryVehicle: string | null;
  ceramicStatus: string;
  loyaltyProgress: string;
  loyaltyStamps: number;
  rewardThreshold: number;
  rewardReady: boolean;
  revenueGeneratedLabel: string;
  openOpportunities: number;
  outstandingBalanceCents: number;
  outstandingBalanceLabel: string;
  projectedAnnualRevenueCents: number;
  projectedAnnualRevenueLabel: string;
  expectedMemberAnnualValueCents: number;
  expectedMemberAnnualValueLabel: string;
  recommendedMembershipTier: string;
  membershipPitch: string;
  lastVisitLabel: string;
  lastContactLabel: string;
  lastMessagePreview: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isSuvLike(vehicle: string | null): boolean {
  if (!vehicle) return false;
  return /suv|truck|suburban|tahoe|expedition|yukon|f-?150|silverado|ram|4runner|highlander|pilot|telluride|palisade/i.test(
    vehicle,
  );
}

export async function loadCustomerIntelligence(
  admin: SupabaseClient,
  customerId: string,
  customerRow?: Record<string, unknown>,
): Promise<CustomerIntelligence> {
  const { data: appts } = await admin
    .from('appointments')
    .select(
      'id, status, scheduled_start, completed_at, job_completed_at, service_slug, vehicle_description, base_price_cents, payment_status, balance_due_cents, duration_minutes, assigned_tech_id',
    )
    .eq('customer_id', customerId)
    .order('scheduled_start', { ascending: false })
    .limit(80);

  const rows = (appts ?? []) as Array<Record<string, unknown>>;
  const completed = rows.filter((a) => str(a.status) === 'completed');
  const apptIds = rows.map((a) => str(a.id)).filter(Boolean);

  let paidFromPayments = 0;
  if (apptIds.length) {
    const { data: pays } = await admin
      .from('payments')
      .select('amount_cents, status, refunded_amount_cents')
      .in('appointment_id', apptIds)
      .in('status', ['succeeded', 'paid', 'completed']);
    for (const p of pays ?? []) {
      const row = p as { amount_cents?: number; refunded_amount_cents?: number };
      paidFromPayments += Math.max(0, (Number(row.amount_cents) || 0) - (Number(row.refunded_amount_cents) || 0));
    }
  }

  const bookedCents = completed.reduce((s, a) => s + (Number(a.base_price_cents) || 0), 0);
  const lifetimeValueCents = paidFromPayments > 0 ? paidFromPayments : bookedCents;
  const visitCount = completed.length;
  const avgSpendCents = visitCount > 0 ? Math.round(lifetimeValueCents / visitCount) : 17500;

  const durations = completed
    .map((a) => Number(a.duration_minutes) || 0)
    .filter((n) => n > 0);
  const avgServiceLengthMinutes =
    durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;

  const dates = completed
    .map((a) => new Date(str(a.completed_at) || str(a.job_completed_at) || str(a.scheduled_start)).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a);

  let avgDaysBetweenVisits: number | null = null;
  if (dates.length >= 2) {
    const gaps: number[] = [];
    for (let i = 0; i < dates.length - 1; i++) {
      gaps.push(Math.round((dates[i]! - dates[i + 1]!) / 86400000));
    }
    avgDaysBetweenVisits = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
  }

  const lastVisit = dates[0] ? new Date(dates[0]) : null;
  const lastVisitLabel = lastVisit
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'America/Chicago' }).format(lastVisit)
    : 'No completed visits yet';

  const serviceCounts = new Map<string, number>();
  for (const a of completed) {
    const slug = str(a.service_slug) || 'full-detail';
    serviceCounts.set(slug, (serviceCounts.get(slug) ?? 0) + 1);
  }
  const topService = [...serviceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'interior-detail';
  const nextRecommendedService =
    topService.includes('ceramic')
      ? 'ceramic-maintenance'
      : topService.includes('interior')
        ? 'interior-detail'
        : 'exterior-detail';
  const nextServiceReason = `Most booked: ${topService.replace(/-/g, ' ')}. Rotate care to protect finish and interior.`;

  const primaryVehicle = str(completed[0]?.vehicle_description) || str(customerRow?.default_vehicle) || null;
  const ceramicStatus = completed.some((a) => str(a.service_slug).includes('ceramic'))
    ? 'Ceramic client — schedule maintenance washes'
    : 'No ceramic on file';

  const outstandingBalanceCents = rows.reduce((s, a) => s + Math.max(0, Number(a.balance_due_cents) || 0), 0);

  const [{ data: stamps }, rewardConfig, rewardState, plansRes, lastMsgRes, reviewRes] = await Promise.all([
    admin.from('loyalty_stamps').select('stamp_count, voided, voided_at').eq('customer_id', customerId),
    loadLoyaltyRewardConfig(admin),
    loadLoyaltyRewardState(admin, customerId),
    admin
      .from('membership_plans')
      .select('tier, name, discount_percent, price_yearly_cents, price_monthly_cents, archived')
      .eq('archived', false)
      .limit(20),
    admin
      .from('notification_outbox')
      .select('created_at, sent_at, channel, payload, kind')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('customer_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('customer_id', customerId),
  ]);

  let oppCount = 0;
  let referralCount = 0;
  try {
    const email = str(customerRow?.email);
    const phone = str(customerRow?.phone);
    if (email || phone) {
      let q = admin
        .from('titan_opportunities')
        .select('id', { count: 'exact', head: true })
        .in('status', ['new', 'contacted', 'follow_up', 'quoted']);
      if (email) q = q.eq('contact_email', email);
      else if (phone) q = q.eq('contact_phone', phone);
      const { count } = await q;
      oppCount = count ?? 0;
    }
    const { count: refCount } = await admin
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_customer_id', customerId);
    referralCount = refCount ?? 0;
  } catch {
    /* optional */
  }

  const loyaltyView = buildLoyaltyRewardView((stamps ?? []) as never[], rewardState.issuedRewards, {
    rewardThreshold: rewardConfig.rewardThreshold,
    redeemedRewards: rewardState.redeemedRewards,
    consumedStamps: rewardState.consumedStamps,
    resetBehavior: rewardConfig.resetBehavior,
    tierThresholds: rewardConfig.tierThresholds,
  });

  const visitsPerYear = avgDaysBetweenVisits
    ? Math.min(24, Math.round(365 / avgDaysBetweenVisits))
    : Math.max(visitCount, 2);
  const planOverrides = (plansRes.data ?? []).map((p) => {
    const row = p as Record<string, unknown>;
    return {
      tier: str(row.tier) || str(row.name),
      discount_percent: row.discount_percent != null ? Number(row.discount_percent) : undefined,
      price_yearly_cents:
        row.price_yearly_cents != null
          ? Number(row.price_yearly_cents)
          : row.price_monthly_cents != null
            ? Number(row.price_monthly_cents) * 12
            : undefined,
    };
  });
  const roi = recommendMembershipTier(visitsPerYear, avgSpendCents / 100, planOverrides);

  const monthsSpan =
    dates.length >= 2 ? Math.max(1, Math.round((dates[0]! - dates[dates.length - 1]!) / (30 * 86400000))) : 1;
  const membershipProbability = Math.min(
    95,
    Math.max(
      8,
      visitCount * 16 +
        (avgDaysBetweenVisits && avgDaysBetweenVisits < 75 ? 22 : 0) +
        (avgSpendCents >= 18000 ? 10 : 0) +
        (isSuvLike(primaryVehicle) ? 8 : 0) +
        (roi.best.netSavings > 100 ? 12 : 0),
    ),
  );
  const membershipReason = [
    visitCount > 0 ? `${visitCount} visit${visitCount === 1 ? '' : 's'} in ~${monthsSpan} month${monthsSpan === 1 ? '' : 's'}` : 'Limited visit history',
    `Average spend ${displayMoney(avgSpendCents)}`,
    primaryVehicle ? primaryVehicle : null,
    avgDaysBetweenVisits != null ? `Typically books every ${avgDaysBetweenVisits} days` : null,
    isSuvLike(primaryVehicle) ? 'SUV/truck class — higher ticket fit' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const referralProbability = Math.min(90, 18 + referralCount * 18 + (visitCount >= 2 ? 22 : 0) + (lifetimeValueCents > 40000 ? 10 : 0));
  const referralReason =
    referralCount > 0
      ? `${referralCount} prior referral event${referralCount === 1 ? '' : 's'} on file`
      : visitCount >= 2
        ? 'Repeat customer — strong trust signal for referrals'
        : 'Needs more completed jobs before referral ask';

  const hasReview = (reviewRes.count ?? 0) > 0;
  const reviewProbability = hasReview ? 15 : Math.min(88, 35 + visitCount * 15 + (lifetimeValueCents > 20000 ? 10 : 0));
  const reviewReason = hasReview
    ? 'Already left a review — ask only after next standout job'
    : visitCount > 0
      ? 'Completed job(s) with no review on file — highest reply window is 24–48h post-service'
      : 'No completed job yet';

  const upsellProbability = Math.min(
    85,
    (topService.includes('interior') ? 40 : 25) + (isSuvLike(primaryVehicle) ? 15 : 0) + (visitCount >= 2 ? 20 : 0),
  );
  const upsellReason = topService.includes('interior')
    ? 'Interior-heavy history — exterior or ceramic maintenance is the natural upsell'
    : ceramicStatus.startsWith('Ceramic')
      ? 'Ceramic client — sell maintenance washes on cadence'
      : 'Offer package upgrade on next booking';

  const projectedAnnualRevenueCents = Math.round(visitsPerYear * avgSpendCents);
  const expectedMemberAnnualValueCents = Math.max(
    0,
    Math.round(projectedAnnualRevenueCents + roi.best.netSavings * 100),
  );

  const lastMsg = lastMsgRes.data as Record<string, unknown> | null;
  const lastContactAt = str(lastMsg?.sent_at) || str(lastMsg?.created_at);
  const lastContactLabel = lastContactAt
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }).format(
        new Date(lastContactAt),
      )
    : 'No outbound contact logged';
  const payload = (lastMsg?.payload ?? {}) as { body_preview?: string; body?: string };
  const lastMessagePreview = str(payload.body_preview || payload.body).slice(0, 140) || null;

  const customerName = str(customerRow?.full_name) || 'Customer';

  return {
    lifetimeValueCents,
    avgSpendCents,
    visitCount,
    avgDaysBetweenVisits,
    avgServiceLengthMinutes,
    membershipProbability,
    membershipReason,
    referralProbability,
    referralReason,
    reviewProbability,
    reviewReason,
    upsellProbability,
    upsellReason,
    nextRecommendedService: nextRecommendedService.replace(/-/g, ' '),
    nextServiceReason,
    primaryVehicle,
    ceramicStatus,
    loyaltyProgress: `${loyaltyView.progressStamps} / ${rewardConfig.rewardThreshold} stamps`,
    loyaltyStamps: loyaltyView.totalStamps,
    rewardThreshold: rewardConfig.rewardThreshold,
    rewardReady: loyaltyView.rewardReady,
    revenueGeneratedLabel: displayMoney(lifetimeValueCents),
    openOpportunities: oppCount,
    outstandingBalanceCents,
    outstandingBalanceLabel: displayMoney(outstandingBalanceCents),
    projectedAnnualRevenueCents,
    projectedAnnualRevenueLabel: displayMoney(projectedAnnualRevenueCents),
    expectedMemberAnnualValueCents,
    expectedMemberAnnualValueLabel: displayMoney(expectedMemberAnnualValueCents),
    recommendedMembershipTier: roi.best.meta.tier.toUpperCase(),
    membershipPitch: buildMembershipPitch(
      customerName,
      primaryVehicle,
      visitCount,
      avgSpendCents,
      roi.best.meta.tier,
      membershipReason,
      expectedMemberAnnualValueCents,
    ),
    lastVisitLabel,
    lastContactLabel,
    lastMessagePreview,
  };
}

function buildMembershipPitch(
  name: string,
  vehicle: string | null,
  visits: number,
  avgCents: number,
  tier: string,
  reason: string,
  expectedAnnualCents: number,
): string {
  const who = name.split(/\s+/)[0] || 'Customer';
  const v = vehicle ?? 'their vehicle';
  return `${who} · ${v} · ${visits} visits · avg ${displayMoney(avgCents)}. Recommend ${tier.toUpperCase()} — expected annual value if member ${displayMoney(expectedAnnualCents)}. Why: ${reason}`;
}
