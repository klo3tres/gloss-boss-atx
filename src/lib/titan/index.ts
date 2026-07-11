import type { SupabaseClient } from '@supabase/supabase-js';
import { loadMoneyPulse } from '@/lib/financial-closeout';
import { fetchWeatherForAddress } from '@/lib/weather-forecast';
import { loadAdminGoalsMetrics } from '@/lib/admin-goals-metrics';
import { loadTechnicianScorecards, type TechnicianScorecard } from '@/lib/titan/technician-score';
import { scanRevenueLeaks, type RevenueLeak } from '@/lib/titan/revenue-engine';
import { detectRebookOpportunities, type RebookOpportunity } from '@/lib/titan/opportunity-engine';
import { loadCustomerReputationScores, type CustomerReputation } from '@/lib/titan/reputation-engine';
import { buildTitanForecast, type TitanForecast } from '@/lib/titan/forecast-engine';

export type TitanIntelligence = {
  technicians: TechnicianScorecard[];
  revenueLeaks: RevenueLeak[];
  totalLeakCents: number;
  opportunities: RebookOpportunity[];
  reputation: { vip: CustomerReputation[]; risk: CustomerReputation[] };
  forecast: TitanForecast;
};

export async function loadTitanIntelligence(admin: SupabaseClient): Promise<TitanIntelligence> {
  const baseAddress = process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || 'Austin, TX';
  const [pulse, goalsMetrics, weather] = await Promise.all([
    loadMoneyPulse(admin),
    loadAdminGoalsMetrics(admin),
    fetchWeatherForAddress(baseAddress),
  ]);

  const avgJobCents =
    goalsMetrics.avgTicketCents ||
    (goalsMetrics.monthJobs > 0 ? Math.round(pulse.monthGrossCents / goalsMetrics.monthJobs) : 20000);

  const [technicians, revenueScan, opportunities, reputation, forecast] = await Promise.all([
    loadTechnicianScorecards(admin),
    scanRevenueLeaks(admin, avgJobCents),
    detectRebookOpportunities(admin),
    loadCustomerReputationScores(admin),
    buildTitanForecast(admin, pulse.monthGrossCents, weather),
  ]);

  return {
    technicians,
    revenueLeaks: revenueScan.leaks,
    totalLeakCents: revenueScan.totalPotentialCents,
    opportunities: opportunities.slice(0, 15),
    reputation,
    forecast,
  };
}

export async function runTitanNightlyEngine(admin: SupabaseClient, options?: { skipPlacesDiscovery?: boolean }) {
  const startedAt = new Date().toISOString();
  const { runOpportunityEngine } = await import('@/lib/titan/opportunity-engine');
  const { loadAdminGoalsMetrics } = await import('@/lib/admin-goals-metrics');
  const { scanRevenueLeaks } = await import('@/lib/titan/revenue-engine');
  const { logTitanActivity } = await import('@/lib/titan/activity-feed');

  const probe = await admin.from('titan_nightly_runs').select('id').limit(1);
  if (probe.error) return { skipped: true as const };

  const { data: runRow } = await admin.from('titan_nightly_runs').insert({ started_at: startedAt }).select('id').maybeSingle();

  try {
    const metrics = await loadAdminGoalsMetrics(admin);
    const avgJob = metrics.avgTicketCents || 20000;
    const leaks = await scanRevenueLeaks(admin, avgJob);
    const opp = await runOpportunityEngine(admin);
    const { syncFleetInquiriesToProspects } = await import('@/lib/titan/lead-radar');
    const { discoverPlacesProspects } = await import('@/lib/titan/places-discovery');
    const { computeTerritoryIntelligence } = await import('@/lib/titan/territory-intelligence');
    const prospectsSynced = await syncFleetInquiriesToProspects(admin);
    const placesDiscovery = options?.skipPlacesDiscovery
      ? { discovered: 0, newCount: 0, error: undefined }
      : await discoverPlacesProspects(admin);
    await computeTerritoryIntelligence(admin);
    const { loadOpportunityScanner } = await import('@/lib/titan/opportunity-scanner');
    const hunt = await loadOpportunityScanner(admin);

    await logTitanActivity(admin, {
      kind: 'forecast_updated',
      title: 'Revenue forecast updated',
      detail: `Leak scan: $${(leaks.totalPotentialCents / 100).toFixed(0)} at risk · ${opp.queued} rebooks queued · hunt ${hunt.dailyHunt.count} opps`,
      impactCents: leaks.totalPotentialCents,
      href: '/admin/super',
    });

    if (runRow?.id) {
      await admin
        .from('titan_nightly_runs')
        .update({
          finished_at: new Date().toISOString(),
          revenue_leak_cents: leaks.totalPotentialCents,
          opportunities_found: opp.opportunities.length,
          opportunities_queued: opp.queued,
        })
        .eq('id', runRow.id);
    }

    return {
      skipped: false as const,
      revenueLeakCents: leaks.totalPotentialCents,
      opportunitiesFound: opp.opportunities.length,
      opportunitiesQueued: opp.queued,
      prospectsSynced,
      placesDiscovered: placesDiscovery.discovered,
      placesNew: placesDiscovery.newCount,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Nightly engine failed';
    if (runRow?.id) {
      await admin.from('titan_nightly_runs').update({ finished_at: new Date().toISOString(), error_message: message }).eq('id', runRow.id);
    }
    throw e;
  }
}
