import { OwnerCommandCenter } from '@/components/admin/owner-command-center';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ExecutiveBriefingClient } from '@/components/titan/executive-briefing-client';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel, canAccessAdminPortal, dashboardShellRoleForProfile } from '@/lib/auth/roles';
import { loadOwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { loadOperationsSnapshot, type OperationsSnapshot } from '@/lib/operations-snapshot';
import { loadExecutiveBriefing } from '@/lib/titan/executive-briefing';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { resolveOwnerFirstName } from '@/lib/owner-identity';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ overview?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const session = await getSessionWithProfile();
  let loadErr: string | null = null;
  let metrics: import('@/lib/owner-dashboard-metrics').OwnerDashboardSnapshot | null = null;
  let operations: OperationsSnapshot | null = null;
  let goals: any[] = [];
  let briefing: Awaited<ReturnType<typeof loadExecutiveBriefing>> | null = null;
  const showFullDashboard = params.overview === '1';

  if (session.user && canAccessAdminPortal(session.profile?.role ?? null)) {
    const admin = tryCreateAdminSupabase();
    if (!admin) {
      loadErr = 'Service role key missing — set SUPABASE_SERVICE_ROLE_KEY to load live operations data.';
    } else {
      try {
        const ws = await loadTitanWorkspace(admin);
        const ownerFirstName = resolveOwnerFirstName({
          ownerDisplayName: ws.ownerDisplayName,
          profileFullName: session.profile?.full_name,
          profileEmail: session.user.email,
        });

        if (showFullDashboard) {
          [metrics, operations] = await Promise.all([
            loadOwnerDashboardSnapshot(admin),
            loadOperationsSnapshot(admin),
          ]);
          const { data } = await admin
            .from('admin_goals')
            .select('*')
            .neq('status', 'archived')
            .order('created_at', { ascending: false })
            .limit(6);
          if (data) {
            goals = data.map((g) => {
              const row = g as Record<string, unknown>;
              return {
                id: String(row.id),
                title: String(row.title),
                goal_type: String(row.goal_type),
                target_value: Number(row.target_value ?? 0),
                current_value: Number(row.current_value ?? 0),
                unit: String(row.unit ?? 'cents'),
                status: String(row.status ?? 'active'),
                period_end: row.period_end != null ? String(row.period_end) : null,
                technician_id: row.technician_id != null ? String(row.technician_id) : null,
              };
            });
          }
        } else {
          briefing = await loadExecutiveBriefing(admin, ownerFirstName);
          operations = await loadOperationsSnapshot(admin).catch(() => null);
        }
      } catch (e) {
        loadErr = e instanceof Error ? e.message : 'Could not load Titan briefing';
      }
    }
  }

  if (
    !loadErr &&
    operations &&
    operations.summary.critical >= 5 &&
    params.overview !== '1' &&
    session.user &&
    isAdminLevel(session.profile?.role ?? null)
  ) {
    redirect('/admin/exceptions');
  }

  const shellRole = dashboardShellRoleForProfile(session.profile?.role ?? null);

  if (showFullDashboard && metrics) {
    return (
      <DashboardShell title="Command center" subtitle="Full metrics and drawers." role={shellRole}>
        {loadErr ? (
          <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100" role="alert">
            {loadErr}
          </p>
        ) : null}
        <OwnerCommandCenter
          metrics={metrics}
          operations={operations}
          isSuperAdmin={session.profile?.role === 'super_admin'}
          goals={goals}
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardShell title="Today's Business" subtitle="Executive briefing — your operating advantage." role={shellRole} titanMode>
      {loadErr ? (
        <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100" role="alert">
          {loadErr}
        </p>
      ) : briefing ? (
        <ExecutiveBriefingClient briefing={briefing} />
      ) : null}
    </DashboardShell>
  );
}
