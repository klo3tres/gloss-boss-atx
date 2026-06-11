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
  let metrics: import('@/lib/owner-dashboard-metrics').OwnerDashboardSnapshot = {
    revenueToday: '$0.00',
    revenueWeek: '$0.00',
    revenueMonth: '$0.00',
    balanceDue: '$0.00',
    jobsToday: 0,
    pipelineCount: 0,
    activeTechCount: 0,
    alerts: [] as string[],
    todayJobs: [] as import('@/lib/owner-dashboard-metrics').TodayJobRow[],
    paymentMixMonth: {
      stripeCents: 0,
      cashCents: 0,
      zelleCents: 0,
      otherCents: 0,
      grossCents: 0,
      paymentCount: 0,
    },
    pendingDeposits: '$0.00',
    activeJobsCount: 0,
    bookingHealth: 0,
    unreadMessageCount: 0,
    bookingsThisWeek: 0,
    dispatchUnassignedToday: 0,
    dispatchCompletedToday: 0,
    conversionRate: 0,
    customerRetentionRate: 0,
    averageTicketSize: '$0.00',
    membershipRevenueMonth: '$0.00',
    loyaltyParticipation: 0,
    jobsTodayCount: 0,
    recentPayments: [],
    upcomingAppts: [],
    liveFeed: [],
    techActivity: [],
    leadPipeline: {
      newCount: 0,
      contactedCount: 0,
      convertedCount: 0,
      totalActive: 0,
    },
    techPerformance: [],
    creditMetrics: {
      outstandingLiabilityCents: 0,
      mtdIssuedCents: 0,
      mtdRedeemedCents: 0,
      expiringSoon: [],
    },
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
      <OwnerCommandCenter metrics={metrics} isSuperAdmin={session.profile?.role === 'super_admin'} />
    </DashboardShell>
  );
}
