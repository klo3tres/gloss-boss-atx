import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ReviewsManagerClient } from '@/components/admin/reviews-manager-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function storedPlaceId(raw: unknown): string {
  if (!raw) return '';
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return String((parsed as { placeId?: unknown } | null)?.placeId ?? raw).replace(/^"|"$/g, '').trim();
  } catch {
    return String(raw).replace(/^"|"$/g, '').trim();
  }
}

export default async function AdminReviewsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const [reviews, googleCount, publishedCount, homepageCount, placeSetting, lastSyncSetting] = await Promise.all([
    admin.from('customer_reviews').select('id, customer_name, rating, testimonial, published, source, created_at').order('created_at', { ascending: false }).limit(50),
    admin.from('customer_reviews').select('id', { count: 'exact', head: true }).eq('source', 'google'),
    admin.from('customer_reviews').select('id', { count: 'exact', head: true }).eq('published', true),
    admin.from('customer_reviews').select('id', { count: 'exact', head: true }).eq('published', true).eq('show_on_homepage', true),
    admin.from('site_settings').select('value').eq('key', 'google_place_id').maybeSingle(),
    admin.from('site_settings').select('value').eq('key', 'google_reviews_last_sync_at').maybeSingle(),
  ]);
  const placeId = process.env.GOOGLE_PLACE_ID?.trim() || storedPlaceId(placeSetting.data?.value);
  const lastSync = String(lastSyncSetting.data?.value ?? 'Never').replace(/^"|"$/g, '');
  const diagnostics = [
    ['Place ID found', placeId ? 'Yes' : 'No'],
    ['API key configured', process.env.GOOGLE_PLACES_API_KEY?.trim() ? 'Yes' : 'No'],
    ['Google reviews stored', String(googleCount.count ?? 0)],
    ['Reviews published', String(publishedCount.count ?? 0)],
    ['Homepage-visible', String(homepageCount.count ?? 0)],
    ['Last sync', lastSync],
    ['Last error', reviews.error?.message ?? googleCount.error?.message ?? 'None recorded'],
  ];

  return (
    <DashboardShell title="Reviews" subtitle="Google reliability and homepage testimonials" role={session.profile!.role as 'admin' | 'super_admin'}>
      <section className="mb-6 rounded-2xl border border-gold/20 bg-black/40 p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Google reviews diagnostic</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {diagnostics.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/10 bg-black/30 p-3">
              <dt className="text-[9px] font-black uppercase text-zinc-500">{label}</dt>
              <dd className="mt-1 break-words text-sm font-bold text-white">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <ReviewsManagerClient reviews={(reviews.data ?? []) as Parameters<typeof ReviewsManagerClient>[0]['reviews']} />
    </DashboardShell>
  );
}
