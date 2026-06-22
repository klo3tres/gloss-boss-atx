import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanSettingsClient } from '@/components/titan/titan-settings-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { loadTitanSystemHealth } from '@/lib/titan/system-health';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanSettingsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const [workspace, health] = await Promise.all([loadTitanWorkspace(admin), loadTitanSystemHealth(admin)]);

  return (
    <DashboardShell title="Titan Settings" subtitle="Workspace DNA, toggles, and system health" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <TitanSettingsClient workspace={workspace} health={health} />
    </DashboardShell>
  );
}
