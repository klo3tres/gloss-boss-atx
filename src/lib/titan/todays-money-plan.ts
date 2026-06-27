import type { SupabaseClient } from '@supabase/supabase-js';
import type { RevenueOpportunity } from '@/lib/titan/revenue-opportunities';
import type { LeadRadarItem } from '@/lib/titan/lead-radar-engine';
import { displayMoney } from '@/lib/display-format';

export type MoneyMission = {
  id: string;
  missionKey: string;
  title: string;
  description: string;
  script: string;
  revenueMinCents: number;
  revenueMaxCents: number;
  confidenceScore: number;
  confidenceLabel: string;
  effortLevel: 'low' | 'medium' | 'high';
  href: string;
  entityType?: string;
  entityId?: string;
  contactPhone?: string | null;
  contactEmail?: string | null;
  status: 'open' | 'in_progress' | 'done';
};

export type TodaysMoneyPlan = {
  goalLabel: string;
  goalTarget: number;
  goalProgress: number;
  missions: MoneyMission[];
  territoryHint?: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function revenueRange(cents: number, guessed = false): { min: number; max: number; label: string } {
  if (cents <= 0) return { min: 0, max: 0, label: 'Estimate unavailable' };
  const min = Math.round(cents * (guessed ? 0.5 : 0.85));
  const max = Math.round(cents * (guessed ? 1.2 : 1.05));
  return {
    min,
    max,
    label: guessed ? 'Rough range — limited data' : 'Based on service averages',
  };
}

export async function buildTodaysMoneyPlan(
  admin: SupabaseClient,
  input: {
    opportunities: RevenueOpportunity[];
    leadRadar: LeadRadarItem[];
    avgJobCents?: number;
  },
): Promise<TodaysMoneyPlan> {
  const avg = Math.max(input.avgJobCents ?? 17500, 12000);
  const missions: MoneyMission[] = [];

  const warmOpp = input.opportunities.find((o) => o.status === 'new' || o.status === 'follow_up');
  if (warmOpp) {
    const range = revenueRange(warmOpp.estimatedRevenueCents || avg);
    missions.push({
      id: `opp-${warmOpp.id}`,
      missionKey: 'warm_lead',
      title: warmOpp.title,
      description: warmOpp.whySurfaced || 'Warm opportunity ready for outreach.',
      script: warmOpp.recommendedMessage,
      revenueMinCents: range.min,
      revenueMaxCents: range.max,
      confidenceScore: warmOpp.confidenceScore,
      confidenceLabel: range.label,
      effortLevel: 'low',
      href: '/admin/titan/opportunities',
      entityType: 'opportunity',
      entityId: warmOpp.id,
      contactPhone: warmOpp.contactPhone,
      contactEmail: warmOpp.contactEmail,
      status: 'open',
    });
  }

  const recoveryOpp = input.opportunities.find((o) =>
    ['previous_customer', 'canceled_reschedule', 'warm_lead'].includes(String(o.opportunityType)),
  );
  if (recoveryOpp && recoveryOpp.id !== warmOpp?.id) {
    const range = revenueRange(recoveryOpp.estimatedRevenueCents || avg, true);
    missions.push({
      id: `rec-${recoveryOpp.id}`,
      missionKey: 'recovery',
      title: recoveryOpp.title,
      description: 'Money sitting in follow-up or open estimate.',
      script: recoveryOpp.recommendedMessage,
      revenueMinCents: range.min,
      revenueMaxCents: range.max,
      confidenceScore: recoveryOpp.confidenceScore,
      confidenceLabel: range.label,
      effortLevel: 'medium',
      href: '/admin/leads',
      entityType: 'opportunity',
      entityId: recoveryOpp.id,
      contactPhone: recoveryOpp.contactPhone,
      contactEmail: recoveryOpp.contactEmail,
      status: 'open',
    });
  }

  const socialLead = input.leadRadar.find((l) => l.status === 'new' || l.status === 'reviewed');
  if (socialLead) {
    const range = revenueRange(avg, true);
    missions.push({
      id: `radar-${socialLead.id}`,
      missionKey: 'social_hunt',
      title: socialLead.contactName || socialLead.authorName || 'Social lead',
      description: socialLead.whyTitanFlagged || 'Buyer intent detected on social.',
      script: socialLead.recommendedReply || `Hi! Gloss Boss ATX mobile detail — happy to quote. Book: https://www.glossbossatx.com/book`,
      revenueMinCents: range.min,
      revenueMaxCents: range.max,
      confidenceScore: socialLead.confidenceScore ?? 55,
      confidenceLabel: 'Estimated from avg detail price',
      effortLevel: 'low',
      href: '/admin/titan/lead-radar',
      entityType: 'lead_radar',
      entityId: socialLead.id,
      contactPhone: socialLead.phone,
      contactEmail: socialLead.email,
      status: 'open',
    });
  }

  const b2b = input.opportunities.find((o) =>
    ['apartment_complex', 'fleet_operator', 'dealership', 'property_manager'].includes(o.opportunityType),
  );
  if (b2b) {
    const range = revenueRange(b2b.estimatedRevenueCents || avg * 4, true);
    missions.push({
      id: `b2b-${b2b.id}`,
      missionKey: 'b2b_prospect',
      title: b2b.title,
      description: 'B2B / fleet opportunity — higher ticket potential.',
      script: b2b.recommendedMessage,
      revenueMinCents: range.min,
      revenueMaxCents: range.max,
      confidenceScore: b2b.confidenceScore,
      confidenceLabel: 'B2B estimate — verify on site',
      effortLevel: 'high',
      href: '/admin/titan/opportunities',
      entityType: 'opportunity',
      entityId: b2b.id,
      contactPhone: b2b.contactPhone,
      contactEmail: b2b.contactEmail,
      status: 'open',
    });
  }

  missions.push({
    id: 'book-24h',
    missionKey: 'book_one_detail',
    title: 'Book 1 detail in the next 24 hours',
    description: 'Call or text your top warm lead with available times.',
    script: missions[0]?.script ?? `Hey! Gloss Boss ATX has openings this week for mobile detailing. Want a quick quote? https://www.glossbossatx.com/book`,
    revenueMinCents: Math.round(avg * 0.9),
    revenueMaxCents: Math.round(avg * 1.1),
    confidenceScore: 70,
    confidenceLabel: 'Based on avg job',
    effortLevel: 'low',
    href: '/admin/titan/opportunities',
    status: 'open',
  });

  const { data: territories } = await admin.from('titan_territories').select('name').limit(1);
  const territoryHint = territories?.[0] ? str((territories[0] as { name?: string }).name) : null;

  if (territoryHint) {
    missions.push({
      id: 'territory-knock',
      missionKey: 'door_knock',
      title: `Door knock: ${territoryHint}`,
      description: 'Walk the territory with a quick intro and booking link ready.',
      script: `Hi! I'm with Gloss Boss ATX — we do mobile detailing at your driveway. Here's a quick link if you want pricing: https://www.glossbossatx.com/book`,
      revenueMinCents: Math.round(avg * 0.8),
      revenueMaxCents: Math.round(avg * 1.2),
      confidenceScore: 45,
      confidenceLabel: 'Territory estimate — track results',
      effortLevel: 'medium',
      href: '/admin/titan/territory',
      status: 'open',
    });
  }

  const { data: bookedToday } = await admin
    .from('appointments')
    .select('id')
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .not('status', 'eq', 'cancelled');

  return {
    goalLabel: 'Book 1 paid detail in 24 hours',
    goalTarget: 1,
    goalProgress: Math.min(1, (bookedToday ?? []).length),
    missions: missions.slice(0, 6),
    territoryHint,
  };
}

export function formatMissionRevenue(m: MoneyMission) {
  if (m.revenueMaxCents <= 0) return '—';
  if (m.revenueMinCents === m.revenueMaxCents) return displayMoney(m.revenueMinCents);
  return `${displayMoney(m.revenueMinCents)}–${displayMoney(m.revenueMaxCents)}`;
}
