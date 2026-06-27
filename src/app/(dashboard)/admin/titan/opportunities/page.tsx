import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanOpportunitiesClient } from '@/components/titan/titan-opportunities-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadOpportunityEvents, loadRevenueOpportunities } from '@/lib/titan/revenue-opportunities';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanOpportunitiesPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const loaded = await loadRevenueOpportunities(admin);
  const eventsByOpp: Record<string, Awaited<ReturnType<typeof loadOpportunityEvents>>> = {};
  await Promise.all(
    loaded.opportunities.slice(0, 40).map(async (opp) => {
      eventsByOpp[opp.id] = await loadOpportunityEvents(admin, opp.id);
    }),
  );

  return (
    <DashboardShell title="Opportunity Board" subtitle="Revenue hunt — close Gloss Boss customers" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading opportunities…</p>}>
        <TitanOpportunitiesClient opportunities={loaded.opportunities} eventsByOpp={eventsByOpp} tablesReady={loaded.tablesReady} />
      </Suspense>
    </DashboardShell>
  );
}
