import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { WebsiteIntelligenceClient } from '@/components/titan/website-intelligence-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadWebsiteIntelligenceBundle } from '@/lib/titan/website-intelligence';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function WebsiteIntelligencePage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const bundle = await loadWebsiteIntelligenceBundle(admin);

  return (
    <DashboardShell
      title="Website Intelligence"
      subtitle="Analytics, SEO, Clarity, and reviews — one trust center"
      role={session.profile!.role as 'admin' | 'super_admin'}
      titanMode
    >
      <WebsiteIntelligenceClient bundle={bundle} />
    </DashboardShell>
  );
}
