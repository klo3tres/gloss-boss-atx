import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanOnboardingClient } from '@/components/titan/titan-onboarding-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanOnboardingPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const workspace = await loadTitanWorkspace(admin);
  if (workspace.onboardingCompletedAt) {
    redirect('/admin/titan');
  }

  return (
    <DashboardShell title="Titan Setup" subtitle="Onboarding wizard" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <TitanOnboardingClient
        initialStep={workspace.onboardingStep}
        initial={{
          businessName: workspace.businessName,
          industry: workspace.industry,
          serviceRadiusMiles: workspace.serviceRadiusMiles,
          monthlyRevenueGoalCents: workspace.monthlyRevenueGoalCents,
          employeeCount: workspace.employeeCount,
        }}
      />
    </DashboardShell>
  );
}
