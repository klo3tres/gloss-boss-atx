import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { displayMoney } from '@/lib/display-format';
import { buildLoyaltyRewardView, countRedeemedLoyaltyRewards, loadLoyaltyRewardConfig } from '@/lib/loyalty-reward-claim';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import { recommendMembershipTier } from '@/lib/membership-roi';

export type CustomerIntelligence = {
  lifetimeValueCents: number;
  avgSpendCents: number;
  visitCount: number;
  avgDaysBetweenVisits: number | null;
  membershipProbability: number;
  referralProbability: number;
  nextRecommendedService: string;
  primaryVehicle: string | null;
  ceramicStatus: string;
  loyaltyProgress: string;
  loyaltyStamps: number;
  rewardThreshold: number;
  rewardReady: boolean;
  revenueGeneratedLabel: string;
  openOpportunities: number;
  recommendedMembershipTier: string;
  membershipPitch: string;
  lastVisitLabel: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function loadCustomerIntelligence(
  admin: SupabaseClient,
  customerId: string,
  customerRow?: Record<string, unknown>,
): Promise<CustomerIntelligence> {
  const { data: appts } = await admin
    .from('appointments')
    .select('id, status, scheduled_start, completed_at, service_slug, vehicle_description, base_price_cents, payment_status')
    .eq('customer_id', customerId)
    .order('scheduled_start', { ascending: false })
    .limit(80);

  const rows = (appts ?? []) as Array<Record<string, unknown>>;
  const completed = rows.filter((a) => str(a.status) === 'completed');
  const paidCents = completed.reduce((s, a) => s + (Number(a.base_price_cents) || 0), 0);
  const visitCount = completed.length;
  const avgSpendCents = visitCount > 0 ? Math.round(paidCents / visitCount) : 17500;

  const dates = completed
    .map((a) => new Date(str(a.completed_at) || str(a.scheduled_start)).getTime())
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
    topService.includes('ceramic') ? 'ceramic-maintenance' : topService.includes('interior') ? 'interior-detail' : 'exterior-detail';

  const primaryVehicle = str(completed[0]?.vehicle_description) || str(customerRow?.default_vehicle) || null;

  const ceramicStatus = completed.some((a) => str(a.service_slug).includes('ceramic'))
    ? 'Ceramic client — schedule maintenance washes'
    : 'No ceramic on file';

  const [{ data: stamps }, rewardConfig, redeemedRewards] = await Promise.all([
    admin.from('loyalty_stamps').select('stamp_count, voided, voided_at').eq('customer_id', customerId),
    loadLoyaltyRewardConfig(admin),
    countRedeemedLoyaltyRewards(admin, customerId),
  ]);

  let oppCount = 0;
  let referralCount = 0;
  try {
    const email = str(customerRow?.email);
    const phone = str(customerRow?.phone);
    if (email || phone) {
      const q = admin
        .from('revenue_opportunities')
        .select('id', { count: 'exact', head: true })
        .in('status', ['new', 'contacted', 'follow_up', 'quoted']);
      const { count } = email
        ? await q.eq('contact_email', email)
        : await q.eq('contact_phone', phone);
      oppCount = count ?? 0;
    }
    const { count: refCount } = await admin
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .eq('referrer_customer_id', customerId);
    referralCount = refCount ?? 0;
  } catch {
    /* optional tables */
  }

  const loyaltyView = buildLoyaltyRewardView((stamps ?? []) as never[], redeemedRewards, {
    rewardThreshold: rewardConfig.rewardThreshold,
  });

  const visitsPerYear = avgDaysBetweenVisits ? Math.min(24, Math.round(365 / avgDaysBetweenVisits)) : Math.max(visitCount, 2);
  const roi = recommendMembershipTier(visitsPerYear, avgSpendCents / 100);
  const membershipProbability = Math.min(
    95,
    Math.max(10, visitCount * 18 + (avgDaysBetweenVisits && avgDaysBetweenVisits < 75 ? 25 : 0)),
  );
  const referralProbability = Math.min(90, 20 + referralCount * 15 + (visitCount >= 2 ? 20 : 0));

  const customerName = str(customerRow?.full_name) || 'Customer';

  return {
    lifetimeValueCents: paidCents,
    avgSpendCents,
    visitCount,
    avgDaysBetweenVisits,
    membershipProbability,
    referralProbability,
    nextRecommendedService: nextRecommendedService.replace(/-/g, ' '),
    primaryVehicle,
    ceramicStatus,
    loyaltyProgress: `${loyaltyView.progressStamps} / ${rewardConfig.rewardThreshold} stamps`,
    loyaltyStamps: loyaltyView.totalStamps,
    rewardThreshold: rewardConfig.rewardThreshold,
    rewardReady: loyaltyView.rewardReady,
    revenueGeneratedLabel: displayMoney(paidCents),
    openOpportunities: oppCount,
    recommendedMembershipTier: roi.best.meta.tier.toUpperCase(),
    membershipPitch: buildMembershipPitch(customerName, primaryVehicle, visitCount, avgSpendCents, roi.best.meta.tier, roi.explanation),
    lastVisitLabel,
  };
}

function buildMembershipPitch(
  name: string,
  vehicle: string | null,
  visits: number,
  avgCents: number,
  tier: string,
  explanation: string,
): string {
  const who = name.split(/\s+/)[0] || 'Customer';
  const v = vehicle ?? 'their vehicle';
  return `${who} · ${v} · ${visits} visits · avg ${displayMoney(avgCents)}. Recommend ${tier.toUpperCase()}. ${explanation}`;
}
