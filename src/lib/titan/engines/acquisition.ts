import type { TitanBriefing } from '@/lib/titan-briefing';
import type { TitanProspect } from '@/lib/titan/lead-radar';
import { prospectTypeLabel } from '@/lib/titan/lead-radar';
import { generateOutreach } from '@/lib/titan/outreach-os';
import type { AcquisitionEngine, TitanRevenueCard } from '@/lib/titan/engines/types';

const CUSTOMER_TYPES = new Set(['dealership', 'fleet_operator', 'construction', 'landscaping', 'realtor', 'other']);

function timeToCloseFromScore(score: number): number {
  if (score >= 85) return 3;
  if (score >= 70) return 7;
  if (score >= 50) return 14;
  return 21;
}

function cardFromScanner(opp: TitanBriefing['opportunityScanner']['feed'][0]): TitanRevenueCard {
  return {
    id: `scanner:${opp.id}`,
    title: opp.title.slice(0, 120),
    expectedRevenueCents: opp.valueCents,
    confidencePercent: opp.closeLikelihoodPercent,
    nextAction: opp.suggestedDm ? 'Send suggested DM' : 'Reply in thread',
    reason: opp.keywordMatched
      ? `Matched "${opp.keywordMatched}" · score ${opp.score} · ${opp.sourceLabel ?? opp.sourcePlatform}`
      : `Score ${opp.score} · ${opp.tier.replace('_', ' ')} opportunity`,
    timeToCloseDays: timeToCloseFromScore(opp.score),
    href: '/admin/super',
    outreachRecommendation: opp.suggestedReply ?? opp.suggestedDm ?? undefined,
  };
}

function cardFromProspect(p: TitanProspect): TitanRevenueCard {
  const pkg = generateOutreach(p);
  return {
    id: `prospect:${p.id}`,
    title: p.companyName,
    expectedRevenueCents: Math.round(p.estimatedMonthlyCents * 0.25),
    confidencePercent: Math.min(95, p.score),
    nextAction: p.phone ? 'Call with script' : p.email ? 'Send partnership email' : 'Research contact',
    reason: p.scoreReason ?? `${prospectTypeLabel(p.prospectType)} within service radius`,
    timeToCloseDays: timeToCloseFromScore(p.score),
    href: '/admin/super',
    outreachRecommendation: pkg.callScript.slice(0, 200),
  };
}

function cardFromRebook(
  o: TitanBriefing['intelligence']['opportunities'][0],
  avgJobCents: number,
): TitanRevenueCard {
  return {
    id: `rebook:${o.customerKey}`,
    title: `Rebook ${o.customerName}`,
    expectedRevenueCents: avgJobCents,
    confidencePercent: o.rebookProbability,
    nextAction: 'Send win-back follow-up',
    reason: `${o.daysSinceLastService} days since last service · usual interval ~${o.avgIntervalDays} days`,
    timeToCloseDays: 7,
    href: o.customerId ? `/admin/customers/${o.customerId}` : '/admin/follow-ups',
  };
}

export function buildAcquisitionEngine(briefing: TitanBriefing): AcquisitionEngine {
  const tablesReady = briefing.opportunityScanner.tablesReady && briefing.growth.tablesReady;
  const avg = Math.max(briefing.insights.avgJobCents, 15000);
  const cards: TitanRevenueCard[] = [];

  if (briefing.opportunityScanner.firstResponder) {
    cards.push(cardFromScanner(briefing.opportunityScanner.firstResponder.opportunity));
  }

  for (const opp of briefing.opportunityScanner.feed.slice(0, 12)) {
    if (cards.some((c) => c.id === `scanner:${opp.id}`)) continue;
    cards.push(cardFromScanner(opp));
  }

  for (const p of briefing.growth.radar.prospects) {
    if (!CUSTOMER_TYPES.has(p.prospectType)) continue;
    cards.push(cardFromProspect(p));
  }

  for (const o of briefing.intelligence.opportunities.slice(0, 8)) {
    cards.push(cardFromRebook(o, avg));
  }

  const sorted = cards
    .sort((a, b) => b.expectedRevenueCents * (b.confidencePercent / 100) - a.expectedRevenueCents * (a.confidencePercent / 100))
    .slice(0, 20);

  return {
    tablesReady,
    opportunities: sorted,
    totalPotentialCents: sorted.reduce((s, c) => s + c.expectedRevenueCents, 0),
  };
}
