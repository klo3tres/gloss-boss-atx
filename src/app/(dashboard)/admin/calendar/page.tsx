import { UnifiedCalendarView } from '@/components/calendar/unified-calendar-view';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminTitanHero } from '@/components/titan/admin-titan-hero';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { startOfTodayIso } from '@/lib/revenue-metrics';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const session = await getSessionWithProfile();
  const allowed = Boolean(session.user && isAdminLevel(session.profile?.role ?? null));

  let todayCount = 0;
  let conflictHint = 'One calendar for Titan, Google, blocks, and weather.';
  if (allowed) {
    const admin = tryCreateAdminSupabase();
    if (admin) {
      const start = startOfTodayIso();
      const end = new Date();
      end.setHours(23, 59, 59, 999);
      const { count } = await admin
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_start', start)
        .lte('scheduled_start', end.toISOString())
        .neq('status', 'cancelled')
        .eq('archived', false)
        .is('deleted_at', null);
      todayCount = count ?? 0;
      if (todayCount > 0) conflictHint = `${todayCount} jobs scheduled today · sync and weather on every slot`;
    }
  }

  return (
    <DashboardShell title="Calendar" subtitle="One source of truth — Titan, Google, blocks, and weather." role="admin">
      <AdminTitanHero
        title="Calendar"
        sentence="One source of truth for bookings, Google sync, manual blocks, and weather risk."
        kpi={todayCount}
        kpiHint={conflictHint}
        primaryHref="/admin/dispatch"
        primaryLabel="Open dispatch"
        secondaryLinks={[{ href: '/admin', label: '← Briefing' }]}
      />
      {!allowed ? (
        <p className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100" role="alert">
          Admin access required.
        </p>
      ) : (
        <UnifiedCalendarView variant="full" role="admin" />
      )}
    </DashboardShell>
  );
}
