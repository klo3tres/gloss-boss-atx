import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MediaStudioClient } from '@/components/admin/media-studio-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadMediaAssets } from '@/lib/media-studio';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function MediaStudioPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const media = await loadMediaAssets(admin);

  return (
    <DashboardShell title="Media Studio" subtitle="Upload hero video, logos, and service images — not URL-only" role={session.profile!.role as 'admin' | 'super_admin'}>
      <MediaStudioClient initialItems={media.items} tablesReady={media.tablesReady} />
      <Link href="/admin/brand-settings" className="mt-8 inline-block text-xs font-black uppercase text-gold-soft underline">
        Brand settings →
      </Link>
    </DashboardShell>
  );
}
