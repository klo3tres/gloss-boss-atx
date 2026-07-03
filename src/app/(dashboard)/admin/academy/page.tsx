import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanAcademyClient } from '@/components/titan/titan-academy-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { notFound } from 'next/navigation';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadAcademyArticlesFromCms } from '@/app/(dashboard)/admin/academy/actions';

export const dynamic = 'force-dynamic';

export default async function TitanAcademyPage() {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) notFound();

  const admin = tryCreateAdminSupabase();
  const cmsArticles = await loadAcademyArticlesFromCms(admin);

  return (
    <DashboardShell
      title="Business Academy"
      subtitle="Models, videos, and playbooks — learn while you run Gloss Boss."
      role="admin"
    >
      <TitanAcademyClient cmsArticles={cmsArticles} />
    </DashboardShell>
  );
}
