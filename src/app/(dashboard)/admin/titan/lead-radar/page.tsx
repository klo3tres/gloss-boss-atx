import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanLeadRadarClient } from '@/components/titan/titan-lead-radar-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { leadRadarPlacesConfigured, loadLeadRadarItems } from '@/lib/titan/lead-radar-engine';
import { HUNT_CATEGORIES, loadLeadPlaybooks, WHERE_TO_HUNT_SOURCES } from '@/lib/titan/lead-radar-hunt';
import { getOrCreateScanBudget } from '@/lib/titan/scan-budget';
import { loadOwnerNotificationPreferences } from '@/lib/titan/notification-preferences';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanLeadRadarPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const loaded = await loadLeadRadarItems(admin);
  const playbooks = await loadLeadPlaybooks(admin);
  const prefs = await loadOwnerNotificationPreferences(admin);
  const budget = await getOrCreateScanBudget(admin, {
    provider: 'google_places',
    scanType: 'lead_radar',
    dailyLimit: prefs.maxPlacesRequestsPerDay,
  });

  return (
    <DashboardShell title="Lead Radar" subtitle="Find revenue opportunities — manual-assisted, compliant" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading Lead Radar…</p>}>
        <TitanLeadRadarClient
          items={loaded.items}
          summary={loaded.summary}
          tablesReady={loaded.tablesReady}
          placesConfigured={leadRadarPlacesConfigured()}
          huntCategories={HUNT_CATEGORIES}
          playbooks={playbooks.playbooks}
          playbooksReady={playbooks.tablesReady}
          huntSources={WHERE_TO_HUNT_SOURCES}
          scanBudget={budget.row}
          scanBudgetReady={budget.tablesReady}
          dailyLimit={prefs.maxPlacesRequestsPerDay}
        />
      </Suspense>
    </DashboardShell>
  );
}
