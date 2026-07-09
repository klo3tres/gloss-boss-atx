import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resolveBusinessContext } from '@/lib/titan/business-context';
import { loadOpportunityEvents, loadRevenueOpportunities } from '@/lib/titan/revenue-opportunities';
import { TitanOpportunitiesClient } from '@/components/titan/titan-opportunities-client';

export const dynamic = 'force-dynamic';

export default async function TitanOpportunitiesPage() {
  const admin = tryCreateAdminSupabase();
  const ctx = admin ? await resolveBusinessContext(admin) : null;
  if (!ctx || !admin) return null;

  const loaded = await loadRevenueOpportunities(admin, ctx.workspaceKey, ctx.businessId);
  const eventsByOpp: Record<string, Awaited<ReturnType<typeof loadOpportunityEvents>>> = {};
  await Promise.all(
    loaded.opportunities.slice(0, 40).map(async (o) => {
      eventsByOpp[o.id] = await loadOpportunityEvents(admin, o.id);
    }),
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-black text-white">Opportunities</h2>
        <p className="mt-1 text-sm text-zinc-400">Industry-flexible pipeline with Day 0 / 2 / 7 / 14 follow-up cadence.</p>
      </div>
      <TitanOpportunitiesClient
        opportunities={loaded.opportunities}
        eventsByOpp={eventsByOpp}
        tablesReady={loaded.tablesReady}
      />
    </div>
  );
}
