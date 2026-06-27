import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { BrandSettingsClient } from '@/components/admin/brand-settings-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadWorkspaceBrand } from '@/lib/brand/workspace-brand';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function BrandSettingsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const brand = await loadWorkspaceBrand(admin);

  return (
    <DashboardShell
      title="Brand Settings"
      subtitle="Rebrand-ready identity — name, logo, colors, and public URLs"
      role={session.profile!.role as 'admin' | 'super_admin'}
    >
      <BrandSettingsClient brand={brand} tablesReady={brand.tablesReady} />
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/media-studio" className="text-xs font-black uppercase text-gold-soft underline">
          Open Media Studio →
        </Link>
        <Link href="/admin/setup-center" className="text-xs font-black uppercase text-zinc-500 underline">
          Setup Center
        </Link>
      </div>
    </DashboardShell>
  );
}
