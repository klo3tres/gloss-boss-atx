import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanAcademyClient } from '@/components/titan/titan-academy-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { notFound } from 'next/navigation';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadAcademyArticlesFromCms } from '@/app/(dashboard)/admin/academy/actions';
import { buildAcademyRecommendations } from '@/lib/titan/academy-recommendations';
import { loadAdminGoalsMetrics } from '@/lib/admin-goals-metrics';

export const dynamic = 'force-dynamic';

export default async function TitanAcademyPage() {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) notFound();

  const admin = tryCreateAdminSupabase();
  const cmsArticles = await loadAcademyArticlesFromCms(admin);
  let recommendations: ReturnType<typeof buildAcademyRecommendations> = [];
  if (admin) {
    const metrics = await loadAdminGoalsMetrics(admin);
    const { count: referralCount } = await admin
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());
    const { data: revenueGoal } = await admin
      .from('admin_goals')
      .select('target_value')
      .eq('goal_type', 'revenue_monthly')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    recommendations = buildAcademyRecommendations({
      referralCount: referralCount ?? 0,
      reviewCount: metrics.monthReviews,
      monthRevenueCents: metrics.monthRevenueCents,
      revenueGoalCents: Number(revenueGoal?.target_value ?? 0),
      bookingCount: metrics.monthJobs,
    });
  }

  return (
    <DashboardShell
      title="Business Academy"
      subtitle="Models, videos, and playbooks — learn while you run Gloss Boss."
      role="admin"
    >
      <TitanAcademyClient cmsArticles={cmsArticles} recommendations={recommendations} />
    </DashboardShell>
  );
}
