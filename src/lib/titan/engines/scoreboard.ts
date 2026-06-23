import type { SupabaseClient } from '@supabase/supabase-js';
import type { TitanBriefing } from '@/lib/titan-briefing';
import type { TitanScoreboard } from '@/lib/titan/engines/types';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function loadTitanScoreboard(admin: SupabaseClient, briefing: TitanBriefing): Promise<TitanScoreboard> {
  const roi = briefing.roi;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let partnershipsAcquired = 0;
  let referralsGenerated = 0;
  let experimentsCompleted = 0;

  const [wonPartners, referralLeads, kpiRes, expRes] = await Promise.all([
    admin
      .from('titan_prospects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'won')
      .in('prospect_type', ['apartment_complex', 'hoa', 'property_manager', 'dealership', 'fleet_operator'])
      .gte('updated_at', monthStart.toISOString()),
    admin
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart.toISOString())
      .or('lead_source.eq.referral,lead_source.eq.titan_widget,lead_source.ilike.%referral%'),
    admin.from('titan_kpi_events').select('kind, amount_cents').gte('occurred_at', monthStart.toISOString()).limit(500),
    admin
      .from('titan_experiments')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', monthStart.toISOString()),
  ]);

  partnershipsAcquired = wonPartners.count ?? 0;
  referralsGenerated =
    (referralLeads.count ?? 0) + briefing.widgetStats.leadsCreated + briefing.widgetStats.quoteRequests;
  experimentsCompleted = expRes.error ? 0 : expRes.count ?? 0;

  let kpiGenerated = 0;
  let kpiRecovered = 0;
  for (const row of kpiRes.data ?? []) {
    const kind = str((row as { kind?: string }).kind);
    const amt = Number((row as { amount_cents?: number }).amount_cents ?? 0);
    if (kind === 'revenue_generated') kpiGenerated += amt;
    if (kind === 'revenue_recovered') kpiRecovered += amt;
  }

  return {
    periodLabel: roi.periodLabel,
    revenueGeneratedCents: Math.max(roi.generatedRevenueCents, kpiGenerated),
    revenueRecoveredCents: Math.max(roi.revenueRecoveredCents, kpiRecovered),
    customersAcquired: roi.leadsRecovered + roi.rebookingsGenerated,
    partnershipsAcquired,
    followUpsCompleted: roi.followUpsSent,
    referralsGenerated,
    experimentsCompleted,
  };
}
