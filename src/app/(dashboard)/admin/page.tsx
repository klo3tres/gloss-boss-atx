import { OwnerCommandCenter } from '@/components/admin/owner-command-center';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadOwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  const session = await getSessionWithProfile();
  let loadErr: string | null = null;
  let metrics = {
    revenueToday: '$0.00',
    revenueWeek: '$0.00',
    revenueMonth: '$0.00',
    balanceDue: '$0.00',
    jobsToday: 0,
    pipelineCount: 0,
    activeTechCount: 0,
    alerts: [] as string[],
    todayJobs: [] as import('@/lib/owner-dashboard-metrics').TodayJobRow[],
  };

  if (session.user && isAdminLevel(session.profile?.role ?? null)) {
    const admin = tryCreateAdminSupabase();
    if (!admin) {
      loadErr = 'Service role key missing — set SUPABASE_SERVICE_ROLE_KEY to load live operations data.';
    } else {
      try {
        metrics = await loadOwnerDashboardSnapshot(admin);
      } catch (e) {
        loadErr = e instanceof Error ? e.message : 'Could not load owner dashboard';
      }
    }
  }

  return (
    <DashboardShell title='Command center' subtitle='Revenue, pipeline, and today’s jobs.' role='admin'>
      {loadErr ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100' role='alert'>
          {loadErr}
        </p>
      ) : null}
      <OwnerCommandCenter metrics={metrics} />
    </DashboardShell>
  );
}
