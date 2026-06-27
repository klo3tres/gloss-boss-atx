import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { Titan10HomeClient } from '@/components/titan/titan-10-home';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadTitan10Snapshot } from '@/lib/titan/engines/load';
import { loadTitanSystemHealth } from '@/lib/titan/system-health';
import { loadRevenueHuntBundle } from '@/lib/titan/revenue-opportunities';
import { loadLeadRadarItems, topLeadRadarForToday } from '@/lib/titan/lead-radar-engine';
import { loadConversionGoalStats, loadDailyHuntTasks } from '@/lib/titan/lead-radar-hunt';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { resolveOwnerFirstName } from '@/lib/owner-identity';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type TitanWorkspace = 'today' | 'growth' | 'outreach' | 'reports';

export default async function TitanHomePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const wsSettings = await loadTitanWorkspace(admin);
  const ownerName = resolveOwnerFirstName({
    ownerDisplayName: wsSettings.ownerDisplayName,
    profileFullName: session.profile?.full_name,
    profileEmail: session.user.email,
  });
  const [snapshot, health, revenueHunt, leadRadar, dailyHunt, conversionGoal] = await Promise.all([
    loadTitan10Snapshot(admin, ownerName),
    loadTitanSystemHealth(admin),
    loadRevenueHuntBundle(admin),
    loadLeadRadarItems(admin),
    loadDailyHuntTasks(admin),
    loadConversionGoalStats(admin),
  ]);
  const requestedWorkspace = (await searchParams).workspace;
  const workspace: TitanWorkspace = ['today', 'growth', 'outreach', 'reports'].includes(requestedWorkspace ?? '')
    ? (requestedWorkspace as TitanWorkspace)
    : 'today';

  return (
    <DashboardShell title="Titan" subtitle="AI Business Operator — revenue first" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <Titan10HomeClient
        snapshot={snapshot}
        health={health}
        setupWarnings={snapshot.setupWarnings}
        workspace={workspace}
        revenueHunt={revenueHunt}
        leadRadarTop={topLeadRadarForToday(leadRadar.items)}
        leadRadarTablesReady={leadRadar.tablesReady}
        dailyHuntTasks={dailyHunt.tasks}
        dailyHuntReady={dailyHunt.tablesReady}
        dailyHuntDate={dailyHunt.taskDate ?? new Date().toISOString().slice(0, 10)}
        conversionGoal={conversionGoal}
      />
    </DashboardShell>
  );
}
