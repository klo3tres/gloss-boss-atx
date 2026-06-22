import { notFound } from 'next/navigation';
import { CmsMediaManager } from '@/components/admin/cms-media-manager';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { normalizeMediaRegistry } from '@/lib/media-registry';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminMediaPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const media = await admin.from('site_settings').select('value').eq('key', 'media_registry').maybeSingle();

  return (
    <DashboardShell
      title='Vehicle & Service Images'
      subtitle='Replace the exact images customers see in booking, service cards, fleet pages, memberships, and gift cards.'
      role='admin'
    >
      <CmsMediaManager registry={normalizeMediaRegistry(media.data?.value ?? null)} />
    </DashboardShell>
  );
}
