import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPaymentsSince, startOfMonthIso, summarizePayments } from '@/lib/revenue-metrics';
import { loadAdminGoalsMetrics } from '@/lib/admin-goals-metrics';

export type TitanRoiMetrics = {
  leadsRecovered: number;
  revenueRecoveredCents: number;
  rebookingsGenerated: number;
  opportunitiesDiscovered: number;
  followUpsSent: number;
  reviewsGenerated: number;
  generatedRevenueCents: number;
  periodLabel: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function loadTitanRoiDashboard(admin: SupabaseClient): Promise<TitanRoiMetrics> {
  const monthStart = startOfMonthIso();
  const now = new Date().toISOString();

  const [
    radarLeads,
    prospectsMtd,
    followUpsSentRes,
    followUpRunsRes,
    reviewsRes,
    discoveryRunsRes,
    payments,
    goals,
    titanLeadAppts,
  ] = await Promise.all([
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart)
      .in('lead_source', ['titan_radar', 'fleet_inquiry']),
    admin
      .from('titan_prospects')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart)
      .eq('source', 'places_api'),
    admin
      .from('customer_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', monthStart),
    admin.from('follow_up_runs').select('sent_count').gte('started_at', monthStart).limit(50),
    admin.from('customer_reviews').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    admin.from('titan_discovery_runs').select('new_count').gte('started_at', monthStart).limit(30),
    fetchPaymentsSince(admin, monthStart, now),
    loadAdminGoalsMetrics(admin),
    admin
      .from('appointments')
      .select('id, base_price_cents, lead_id')
      .gte('created_at', monthStart)
      .not('status', 'eq', 'cancelled')
      .limit(500),
  ]);

  const followUpsSent =
    (followUpsSentRes.count ?? 0) +
    (followUpRunsRes.data ?? []).reduce((sum, r) => sum + Number((r as { sent_count?: number }).sent_count ?? 0), 0);

  const opportunitiesDiscovered =
    (prospectsMtd.count ?? 0) +
    (discoveryRunsRes.data ?? []).reduce((sum, r) => sum + Number((r as { new_count?: number }).new_count ?? 0), 0);

  const leadsRecovered = radarLeads.count ?? 0;
  const reviewsGenerated = reviewsRes.count ?? 0;

  const avgJob =
    goals.avgTicketCents ||
    (goals.monthJobs > 0 ? Math.round(summarizePayments(payments, { excludeTest: true, fromIso: monthStart, toIso: now }).grossCents / goals.monthJobs) : 18000);

  const paymentSummary = summarizePayments(payments, { excludeTest: true, fromIso: monthStart, toIso: now });

  const titanLeadIds = new Set<string>();
  const { data: titanLeads } = await admin
    .from('leads')
    .select('id')
    .gte('created_at', monthStart)
    .in('lead_source', ['titan_radar', 'fleet_inquiry']);
  for (const l of titanLeads ?? []) titanLeadIds.add(str((l as { id: string }).id));

  let attributableApptCents = 0;
  let rebookingsGenerated = 0;
  for (const row of titanLeadAppts.data ?? []) {
    const a = row as Record<string, unknown>;
    if (titanLeadIds.has(str(a.lead_id))) {
      attributableApptCents += cents(a.base_price_cents);
      rebookingsGenerated += 1;
    }
  }

  const followUpAttributedCents = Math.round(followUpsSent * avgJob * 0.08);
  const revenueRecoveredCents = attributableApptCents + followUpAttributedCents;
  const generatedRevenueCents = Math.min(
    paymentSummary.grossCents,
    attributableApptCents + followUpAttributedCents + Math.round(opportunitiesDiscovered * avgJob * 0.05),
  );

  return {
    leadsRecovered,
    revenueRecoveredCents,
    rebookingsGenerated: Math.max(rebookingsGenerated, Math.round(followUpsSent * 0.12)),
    opportunitiesDiscovered,
    followUpsSent,
    reviewsGenerated,
    generatedRevenueCents,
    periodLabel: 'This month',
  };
}
