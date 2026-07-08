import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { MediaStudioHub } from '@/components/admin/media-studio-hub';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadMediaAssets } from '@/lib/media-studio';
import { normalizeMediaRegistry } from '@/lib/media-registry';
import { mapAdminGalleryRows } from '@/lib/gallery-normalize';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function MediaStudioPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const media = await loadMediaAssets(admin);
  const supabase = await createSupabaseServerClient();
  const [registryRes, galleryRes] = await Promise.all([
    admin.from('site_settings').select('value').eq('key', 'media_registry').maybeSingle(),
    supabase?.from('gallery_images').select('*').order('sort_order', { ascending: true }) ?? Promise.resolve({ data: [], error: null }),
  ]);

  const galleryRows = mapAdminGalleryRows(galleryRes.data ?? []).map((r) => ({
    id: r.id,
    caption: r.caption,
    url: r.url?.trim() || r.image_url,
    sort_order: r.order_index ?? r.sort_order,
    published: r.published,
    featured: r.featured,
    watermark: r.watermark,
    vehicleLabel: r.vehicleLabel,
    serviceLabel: r.serviceLabel,
    transformationPhase: r.transformationPhase,
  }));

  return (
    <DashboardShell
      title="Media Studio"
      subtitle="Unified asset manager — uploads, vehicle images, and website gallery"
      role={session.profile!.role as 'admin' | 'super_admin'}
    >
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading media studio…</p>}>
        <MediaStudioHub
          initialItems={media.items}
          tablesReady={media.tablesReady}
          registry={normalizeMediaRegistry(registryRes.data?.value ?? null)}
          galleryRows={galleryRows}
        />
      </Suspense>
      <Link href="/admin/brand-settings" className="mt-8 inline-block text-xs font-black uppercase text-gold-soft underline">
        Brand settings →
      </Link>
    </DashboardShell>
  );
}
