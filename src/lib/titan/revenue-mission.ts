import type { TitanBriefing, TitanAction } from '@/lib/titan-briefing';
import { TITAN_MISSION } from '@/lib/titan/branding';

export type RevenueSourceId =
  | 'follow_ups'
  | 'open_estimates'
  | 'previous_customers'
  | 'opportunities'
  | 'referral_pipeline'
  | 'partner_prospects';

export type RevenueSource = {
  id: RevenueSourceId;
  label: string;
  amountCents: number;
  href: string;
  engine: 'recovery' | 'pipeline' | 'acquisition' | 'partner' | 'referral';
};

export type DailyPlanAction = {
  rank: number;
  title: string;
  detail: string;
  potentialCents: number;
  confidencePercent: number;
  nextAction: string;
  href: string;
  priority: TitanAction['priority'];
};

export type RevenueMissionSnapshot = {
  mission: string;
  ownerGreeting: string;
  revenueAvailableTodayCents: number;
  sources: RevenueSource[];
  planActions: DailyPlanAction[];
  partnerHighlight: {
    companyName: string;
    annualPotentialCents: number;
    contactName: string | null;
    reason: string | null;
    href: string;
  } | null;
};

const PARTNER_TYPES = new Set(['apartment_complex', 'hoa', 'property_manager', 'dealership', 'fleet_operator']);

function confidenceForAction(action: TitanAction, forecastConfidence: number): number {
  if (action.id === 'first-responder') return 90;
  if (action.priority === 'high') return Math.min(95, forecastConfidence + 15);
  if (action.priority === 'medium') return Math.min(80, forecastConfidence);
  return Math.max(35, forecastConfidence - 20);
}

function nextActionLabel(action: TitanAction): string {
  if (action.id === 'follow-ups') return 'Open follow-ups and send now';
  if (action.id === 'estimates') return 'Call or text to close estimate';
  if (action.id === 'first-responder') return 'Reply before competitors';
  if (action.id === 'leads') return 'Work the pipeline';
  if (action.id === 'revenue-gap') return 'Book jobs toward monthly goal';
  if (action.id === 'exceptions') return 'Clear blocker in inbox';
  return 'Open and execute';
}

function actionPotentialCents(action: TitanAction, avgJobCents: number): number {
  if (action.impactCents != null && action.impactCents > 0) return action.impactCents;
  if (action.id === 'estimates') return avgJobCents;
  if (action.id === 'leads') return Math.round(avgJobCents * 0.6);
  return 0;
}

/** Revenue Mission Engine — aggregates recoverable & creatable revenue from live briefing data. */
export function buildRevenueMissionFromBriefing(briefing: TitanBriefing): RevenueMissionSnapshot {
  const { insights, intelligence, opportunityScanner, growth, forecast } = briefing;
  const avg = Math.max(insights.avgJobCents, 15000);

  const followUpCents = insights.estimatedLostRevenueCents || insights.followUpsDue * avg;
  const estimateCents = insights.openEstimates * avg;

  const rebookCents = intelligence.opportunities
    .slice(0, 8)
    .reduce((sum, o) => sum + Math.round(avg * (o.rebookProbability / 100)), 0);

  const huntCents = opportunityScanner.dailyHunt.potentialCents;
  const scannerFeedCents = opportunityScanner.feed
    .slice(0, 5)
    .reduce((sum, o) => sum + (o.valueCents ?? 0), 0);
  const opportunityCents = Math.max(huntCents, scannerFeedCents);

  const referralCents = Math.round(
    (briefing.widgetStats.quoteRequests + briefing.widgetStats.leadsCreated) * avg * 0.35,
  );

  const partnerProspects = growth.radar.prospects.filter((p) => PARTNER_TYPES.has(p.prospectType));
  const partnerMonthlyCents = partnerProspects.reduce((s, p) => s + p.estimatedMonthlyCents, 0);
  const partnerTodayCents = Math.round(partnerMonthlyCents * 0.15);

  const sources: RevenueSource[] = [
    {
      id: 'follow_ups',
      label: 'Follow-ups',
      amountCents: followUpCents,
      href: '/admin/follow-ups',
      engine: 'recovery',
    },
    {
      id: 'open_estimates',
      label: 'Open estimates',
      amountCents: estimateCents,
      href: '/admin/leads',
      engine: 'pipeline',
    },
    {
      id: 'previous_customers',
      label: 'Previous customers',
      amountCents: rebookCents,
      href: '/admin/customers',
      engine: 'recovery',
    },
    {
      id: 'opportunities',
      label: 'Opportunities',
      amountCents: opportunityCents,
      href: '/admin/super',
      engine: 'acquisition',
    },
    {
      id: 'referral_pipeline',
      label: 'Referral & widget leads',
      amountCents: referralCents,
      href: '/admin/leads',
      engine: 'referral',
    },
    {
      id: 'partner_prospects',
      label: 'Partner prospects',
      amountCents: partnerTodayCents,
      href: '/admin/super',
      engine: 'partner',
    },
  ].filter((s): s is RevenueSource => s.amountCents > 0);

  const revenueAvailableTodayCents = sources.reduce((sum, s) => sum + s.amountCents, 0);

  const planActions: DailyPlanAction[] = briefing.recommendations
    .filter((a) => a.id !== 'closeout' && a.id !== 'weather')
    .slice(0, 6)
    .map((action, i) => ({
      rank: i + 1,
      title: action.title,
      detail: action.detail,
      potentialCents: actionPotentialCents(action, avg),
      confidencePercent: confidenceForAction(action, forecast.confidencePercent),
      nextAction: nextActionLabel(action),
      href: action.href,
      priority: action.priority,
    }))
    .sort((a, b) => b.potentialCents - a.potentialCents || a.rank - b.rank)
    .map((a, i) => ({ ...a, rank: i + 1 }));

  const topPartner = [...partnerProspects].sort((a, b) => b.estimatedMonthlyCents - a.estimatedMonthlyCents)[0];
  const partnerHighlight = topPartner
    ? {
        companyName: topPartner.companyName,
        annualPotentialCents: topPartner.estimatedMonthlyCents * 12,
        contactName: topPartner.contactName,
        reason: topPartner.scoreReason,
        href: '/admin/super',
      }
    : null;

  const name = briefing.ownerName?.split(' ')[0] ?? 'there';
  const ownerGreeting = `${briefing.greeting}, ${name}`;

  return {
    mission: TITAN_MISSION,
    ownerGreeting,
    revenueAvailableTodayCents,
    sources,
    planActions,
    partnerHighlight,
  };
}
