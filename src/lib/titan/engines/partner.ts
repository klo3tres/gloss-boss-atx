import type { TitanBriefing } from '@/lib/titan-briefing';
import type { ProspectType, TitanProspect } from '@/lib/titan/lead-radar';
import { prospectTypeLabel } from '@/lib/titan/lead-radar';
import { generateOutreach } from '@/lib/titan/outreach-os';
import type { PartnerCard, PartnerEngine } from '@/lib/titan/engines/types';

const PARTNER_TYPES: ProspectType[] = [
  'apartment_complex',
  'realtor',
  'hoa',
  'dealership',
  'fleet_operator',
  'property_manager',
  'construction',
];

function toPartnerCard(p: TitanProspect): PartnerCard {
  const pkg = generateOutreach(p);
  const annual = p.estimatedMonthlyCents * 12;
  return {
    id: p.id,
    companyName: p.companyName,
    partnerType: prospectTypeLabel(p.prospectType),
    estimatedAnnualRevenueCents: annual,
    contactName: p.contactName,
    contactEmail: p.email,
    contactPhone: p.phone,
    website: p.website,
    decisionMakerTitle: p.decisionMakerTitle ?? p.contactRole,
    notes: p.notes,
    acquisitionSource: p.acquisitionSource ?? p.source,
    outreachScript: pkg.callScript,
    partnershipReason: p.scoreReason,
    nextAction: p.status === 'new' ? 'Run outreach play' : 'Follow up on partnership thread',
    confidencePercent: Math.min(95, p.score),
    href: `/admin/titan/opportunities?id=${encodeURIComponent(p.id)}`,
  };
}

export function buildPartnerEngine(briefing: TitanBriefing): PartnerEngine {
  const tablesReady = briefing.growth.radar.tablesReady;
  const partners = briefing.growth.radar.prospects
    .filter((p) => PARTNER_TYPES.includes(p.prospectType))
    .sort((a, b) => b.estimatedMonthlyCents - a.estimatedMonthlyCents)
    .slice(0, 15)
    .map(toPartnerCard);

  return {
    tablesReady,
    partners,
    totalAnnualPotentialCents: partners.reduce((s, p) => s + p.estimatedAnnualRevenueCents, 0),
  };
}
