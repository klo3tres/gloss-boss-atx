import type { SupabaseClient } from '@supabase/supabase-js';
import { startOfMonthIso } from '@/lib/revenue-metrics';
import { fetchPaymentsSince, summarizePayments } from '@/lib/revenue-metrics';

export type TerritoryInsight = {
  id: string;
  label: string;
  jobs: number;
  revenueCents: number;
  avgTicketCents: number;
  membershipRatePercent: number;
  closeRatePercent: number;
  vsAvgRevenuePercent: number;
  opportunityScore: number;
};

export type TerritoryIntelligence = {
  territories: TerritoryInsight[];
  topRevenue: TerritoryInsight | null;
  bestConversion: TerritoryInsight | null;
  topMembership: TerritoryInsight | null;
  weakest: TerritoryInsight | null;
  suggestedExpansion: string | null;
  expectedRoiPercent: number | null;
  insightLines: string[];
  computedAt: string;
};

const TERRITORY_DEFS = [
  { id: 'georgetown', label: 'Georgetown', pattern: /georgetown/i },
  { id: 'round_rock', label: 'Round Rock', pattern: /round rock/i },
  { id: 'pflugerville', label: 'Pflugerville', pattern: /pflugerville/i },
  { id: 'wells_branch', label: 'Wells Branch', pattern: /wells branch/i },
  { id: 'hutto', label: 'Hutto', pattern: /hutto/i },
  { id: 'east_austin', label: 'East Austin', pattern: /east austin|manor|del valle/i },
  { id: 'austin', label: 'Austin', pattern: /austin/i },
  { id: 'cedar_park', label: 'Cedar Park', pattern: /cedar park/i },
  { id: 'leander', label: 'Leander', pattern: /leander/i },
];

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function inferTerritory(address: string): string {
  const hay = address.toLowerCase();
  for (const t of TERRITORY_DEFS) {
    if (t.pattern.test(hay)) return t.id;
  }
  return 'other';
}

export async function computeTerritoryIntelligence(admin: SupabaseClient): Promise<TerritoryIntelligence> {
  const monthStart = startOfMonthIso();
  const now = new Date().toISOString();

  const [apptsRes, membershipsRes, payments] = await Promise.all([
    admin
      .from('appointments')
      .select('id, service_address, base_price_cents, status, customer_id, created_at')
      .gte('created_at', monthStart)
      .not('status', 'eq', 'cancelled')
      .limit(2000),
    admin.from('customer_memberships').select('id, customer_id, status').eq('status', 'active').limit(500),
    fetchPaymentsSince(admin, monthStart, now),
  ]);

  const paymentSummary = summarizePayments(payments, { excludeTest: true, fromIso: monthStart, toIso: now });
  const apptIds = new Set((apptsRes.data ?? []).map((a) => str((a as { id: string }).id)));
  const revenueByAppt = new Map<string, number>();
  for (const p of payments) {
    const aid = str(p.appointment_id);
    if (!aid || !apptIds.has(aid)) continue;
    revenueByAppt.set(aid, (revenueByAppt.get(aid) ?? 0) + (p.amount_cents ?? 0));
  }

  const memberCustomers = new Set(
    (membershipsRes.data ?? []).map((m) => str((m as { customer_id?: string }).customer_id)).filter(Boolean),
  );

  const buckets = new Map<string, { jobs: number; revenue: number; customers: Set<string>; completed: number }>();
  for (const t of TERRITORY_DEFS) {
    buckets.set(t.id, { jobs: 0, revenue: 0, customers: new Set(), completed: 0 });
  }
  buckets.set('other', { jobs: 0, revenue: 0, customers: new Set(), completed: 0 });

  for (const row of apptsRes.data ?? []) {
    const a = row as Record<string, unknown>;
    const territory = inferTerritory(str(a.service_address));
    const bucket = buckets.get(territory) ?? buckets.get('other')!;
    bucket.jobs += 1;
    const rev = revenueByAppt.get(str(a.id)) ?? Number(a.base_price_cents ?? 0);
    bucket.revenue += rev;
    const cid = str(a.customer_id);
    if (cid) bucket.customers.add(cid);
    if (str(a.status) === 'completed') bucket.completed += 1;
  }

  const territories: TerritoryInsight[] = TERRITORY_DEFS.map((def) => {
    const b = buckets.get(def.id) ?? { jobs: 0, revenue: 0, customers: new Set<string>(), completed: 0 };
    const jobs = b.jobs;
    const revenueCents = b.revenue;
    const avgTicketCents = jobs > 0 ? Math.round(revenueCents / jobs) : 0;
    const members = [...b.customers].filter((c) => memberCustomers.has(c)).length;
    const membershipRatePercent = b.customers.size > 0 ? Math.round((members / b.customers.size) * 100) : 0;
    const closeRatePercent = jobs > 0 ? Math.round((b.completed / jobs) * 100) : 0;
    return {
      id: def.id,
      label: def.label,
      jobs,
      revenueCents,
      avgTicketCents,
      membershipRatePercent,
      closeRatePercent,
      vsAvgRevenuePercent: 0,
      opportunityScore: 0,
    };
  }).filter((t) => t.jobs > 0);

  const avgTicket =
    territories.length > 0
      ? Math.round(territories.reduce((s, t) => s + t.avgTicketCents, 0) / territories.length)
      : paymentSummary.grossCents > 0 && (apptsRes.data ?? []).length > 0
        ? Math.round(paymentSummary.grossCents / (apptsRes.data ?? []).length)
        : 0;

  for (const t of territories) {
    t.vsAvgRevenuePercent = avgTicket > 0 ? Math.round(((t.avgTicketCents - avgTicket) / avgTicket) * 100) : 0;
    t.opportunityScore = Math.round(t.closeRatePercent * 0.4 + Math.max(0, t.vsAvgRevenuePercent) * 0.3 + t.membershipRatePercent * 0.3);
  }

  territories.sort((a, b) => b.opportunityScore - a.opportunityScore);

  const topRevenue = [...territories].sort((a, b) => b.avgTicketCents - a.avgTicketCents)[0] ?? null;
  const bestConversion = [...territories].sort((a, b) => b.closeRatePercent - a.closeRatePercent)[0] ?? null;
  const topMembership = [...territories].sort((a, b) => b.membershipRatePercent - a.membershipRatePercent)[0] ?? null;
  const weakest = [...territories].sort((a, b) => a.closeRatePercent - b.closeRatePercent)[0] ?? null;

  const insightLines: string[] = [];
  if (topRevenue && topRevenue.vsAvgRevenuePercent > 5) {
    insightLines.push(`${topRevenue.label} customers spend ${topRevenue.vsAvgRevenuePercent}% more than average.`);
  }
  if (bestConversion) {
    insightLines.push(`${bestConversion.label} converts best (${bestConversion.closeRatePercent}% completion rate MTD).`);
  }
  if (topMembership && topMembership.membershipRatePercent > 0) {
    insightLines.push(`${topMembership.label} books memberships most often (${topMembership.membershipRatePercent}% of customers).`);
  }
  if (weakest && weakest.closeRatePercent < 70 && weakest.jobs >= 2) {
    insightLines.push(`${weakest.label} has the lowest close rate (${weakest.closeRatePercent}%) — worth tighter follow-up.`);
  }

  const suggested = territories[0] ?? null;
  const expectedRoi = suggested ? Math.max(8, Math.round(suggested.vsAvgRevenuePercent * 0.8 + 12)) : null;

  const result: TerritoryIntelligence = {
    territories,
    topRevenue,
    bestConversion,
    topMembership,
    weakest,
    suggestedExpansion: suggested ? `Focus next ad spend on ${suggested.label}` : null,
    expectedRoiPercent: expectedRoi,
    insightLines,
    computedAt: now,
  };

  const probe = await admin.from('titan_territory_snapshots').select('id').limit(1);
  if (!probe.error) {
    await admin.from('titan_territory_snapshots').insert({
      computed_at: now,
      insights: insightLines,
      suggested_expansion: result.suggestedExpansion,
      expected_roi_percent: expectedRoi,
    });
  }

  return result;
}

export async function loadTerritoryIntelligence(admin: SupabaseClient): Promise<TerritoryIntelligence> {
  return computeTerritoryIntelligence(admin);
}
