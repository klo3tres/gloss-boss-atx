import { FullCalendarView } from '@/components/admin/full-calendar-view';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadOwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const session = await getSessionWithProfile();
  let loadErr: string | null = null;
  let scheduleMonth: any[] = [];
  let calendarEvents: any[] = [];

  if (session.user && isAdminLevel(session.profile?.role ?? null)) {
    const admin = tryCreateAdminSupabase();
    if (!admin) {
      loadErr = 'Service role key missing — set SUPABASE_SERVICE_ROLE_KEY to load live operations data.';
    } else {
      try {
        const metrics = await loadOwnerDashboardSnapshot(admin);
        scheduleMonth = metrics.scheduleMonth ?? [];
        calendarEvents = metrics.calendarEvents ?? [];
      } catch (e) {
        loadErr = e instanceof Error ? e.message : 'Could not load calendar data';
      }
    }
  }

  return (
    <DashboardShell title="Full Calendar" subtitle="Interactive dispatch and events calendar." role="admin">
      {loadErr ? (
        <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100" role="alert">
          {loadErr}
        </p>
      ) : null}
      <FullCalendarView initialJobs={scheduleMonth} initialEvents={calendarEvents} />
    </DashboardShell>
  );
}
