import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { Titan10HomeClient } from '@/components/titan/titan-10-home';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadTitan10Snapshot } from '@/lib/titan/engines/load';
import { loadTitanSystemHealth } from '@/lib/titan/system-health';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type TitanWorkspace = 'today' | 'growth' | 'outreach' | 'reports';

export default async function TitanHomePage({ searchParams }: { searchParams: Promise<{ workspace?: string }> }) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const ownerName = session.profile?.full_name ?? session.user.email?.split('@')[0] ?? null;
  const [snapshot, health] = await Promise.all([
    loadTitan10Snapshot(admin, ownerName),
    loadTitanSystemHealth(admin),
  ]);
  const requestedWorkspace = (await searchParams).workspace;
  const workspace: TitanWorkspace = ['today', 'growth', 'outreach', 'reports'].includes(requestedWorkspace ?? '')
    ? (requestedWorkspace as TitanWorkspace)
    : 'today';

  return (
    <DashboardShell title="Titan" subtitle="Business development — revenue first" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <Titan10HomeClient snapshot={snapshot} health={health} setupWarnings={snapshot.setupWarnings} workspace={workspace} />
    </DashboardShell>
  );
}
