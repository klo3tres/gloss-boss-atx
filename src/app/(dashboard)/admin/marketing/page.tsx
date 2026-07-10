import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadMarketingCampaigns } from '@/lib/business-modules';
import { MarketingCampaignsPanel } from '@/components/admin/marketing-campaigns-panel';

export const dynamic = 'force-dynamic';

export default async function AdminMarketingPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) notFound();

  const campaigns = await loadMarketingCampaigns(admin);

  return (
    <DashboardShell title="Marketing campaigns" subtitle="Plan audiences, channels, and scheduled outreach." role="admin">
      <MarketingCampaignsPanel initialCampaigns={campaigns} />
    </DashboardShell>
  );
}
