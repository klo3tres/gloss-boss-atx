import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanHomeClient } from '@/components/titan/titan-home';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadTitanBriefing } from '@/lib/titan-briefing';
import { loadTitanSystemHealth } from '@/lib/titan/system-health';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanHomePage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const ownerName = session.profile?.full_name ?? session.user.email?.split('@')[0] ?? null;
  const [briefing, health] = await Promise.all([
    loadTitanBriefing(admin, ownerName),
    loadTitanSystemHealth(admin),
  ]);

  return (
    <DashboardShell title="Titan" subtitle="Your business operating system" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <TitanHomeClient briefing={briefing} health={health} />
    </DashboardShell>
  );
}
