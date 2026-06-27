import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanOpportunitiesClient } from '@/components/titan/titan-opportunities-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadOpportunityEvents, loadRevenueOpportunities } from '@/lib/titan/revenue-opportunities';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanOpportunitiesPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const loaded = await loadRevenueOpportunities(admin);
  const eventsByOpp: Record<string, Awaited<ReturnType<typeof loadOpportunityEvents>>> = {};
  const [servicesRes, pricesRes] = await Promise.all([
    admin.from('services').select('slug, title, duration_minutes').eq('active', true).order('sort_order'),
    admin.from('service_prices').select('price_cents, services(slug)'),
  ]);
  const priceBySlug = new Map<string, number>();
  for (const row of pricesRes.data ?? []) {
    const r = row as { price_cents?: number; services?: { slug?: string } | { slug?: string }[] | null };
    const svc = r.services;
    const slug = Array.isArray(svc) ? svc[0]?.slug : svc?.slug;
    if (slug && typeof r.price_cents === 'number') priceBySlug.set(String(slug), r.price_cents);
  }
  const serviceOptions = (servicesRes.data ?? []).map((s) => {
    const row = s as { slug: string; title: string; duration_minutes?: number };
    return {
      slug: row.slug,
      title: row.title,
      priceCents: priceBySlug.get(row.slug),
      durationMinutes: row.duration_minutes ?? 120,
    };
  });

  await Promise.all(
    loaded.opportunities.slice(0, 40).map(async (opp) => {
      eventsByOpp[opp.id] = await loadOpportunityEvents(admin, opp.id);
    }),
  );

  return (
    <DashboardShell title="Opportunity Board" subtitle="Revenue hunt — close Gloss Boss customers" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading opportunities…</p>}>
        <TitanOpportunitiesClient opportunities={loaded.opportunities} eventsByOpp={eventsByOpp} tablesReady={loaded.tablesReady} serviceOptions={serviceOptions} />
      </Suspense>
    </DashboardShell>
  );
}
