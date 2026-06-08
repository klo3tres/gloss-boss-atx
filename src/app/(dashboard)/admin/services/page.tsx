import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { defaultServicePackages } from '@/lib/site-config';
import { filterServicePriceRowsForAdminUi } from '@/lib/admin/filter-ui-price-rows';
import { AdminServicesPricingClient } from '@/components/admin/admin-services-pricing-client';
import type { SavedPriceRow } from '../service-pricing-actions';
import { ensureCanonicalServiceCatalog } from '@/lib/admin/ensure-canonical-service-catalog';

export const dynamic = 'force-dynamic';

type PriceRow = {
  id: string;
  vehicle_class: string;
  price_cents: number;
  services: { title: string; slug: string } | { title: string; slug: string }[] | null;
};

export default async function AdminServicesPricingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const session = await getSessionWithProfile();

  if (!session.supabaseConfigured) {
    return (
      <DashboardShell title='Services & pricing (Supabase)' subtitle='Server configuration required.' role='admin'>
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100'>
          Add Supabase keys to load pricing. See <Link href='/setup' className='text-gold-soft underline'>setup</Link>.
        </p>
      </DashboardShell>
    );
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return (
      <DashboardShell title='Services & pricing (Supabase)' subtitle='Could not open server session.' role='admin'>
        <p className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100'>Supabase server client unavailable.</p>
      </DashboardShell>
    );
  }

  const admin = tryCreateAdminSupabase();
  let seedMsg: string | null = null;
  if (admin) {
    const seed = await ensureCanonicalServiceCatalog(admin);
    if (!seed.ok) {
      seedMsg = seed.error ?? 'Could not seed canonical catalog.';
    }
  }

  const priceClient = admin ?? supabase;
  const { data: rows, error } = await priceClient
    .from('service_prices')
    .select('id, vehicle_class, price_cents, services ( title, slug )')
    .order('vehicle_class', { ascending: true });

  const list = filterServicePriceRowsForAdminUi((rows ?? []) as PriceRow[]);
  const initialRows: SavedPriceRow[] = list.map((row) => {
    const svc = Array.isArray(row.services) ? row.services[0] : row.services;
    return {
      id: row.id,
      slug: typeof svc?.slug === 'string' ? svc.slug : '',
      title: typeof svc?.title === 'string' ? svc.title : '',
      vehicle_class: row.vehicle_class,
      price_cents: row.price_cents,
    };
  });

  const { data: serviceMeta } = await priceClient
    .from('services')
    .select(
      'id, slug, title, active, sort_order, estimated_min_minutes, estimated_max_minutes, coming_soon, quote_required, public_description, admin_notes, inclusions',
    )
    .order('sort_order', { ascending: true });
  const servicesMeta = (serviceMeta ?? []) as Array<{
    id: string;
    slug: string;
    title: string;
    active: boolean;
    estimated_min_minutes: number | null;
    estimated_max_minutes: number | null;
    coming_soon: boolean | null;
    quote_required: boolean | null;
    public_description: string | null;
    admin_notes: string | null;
    inclusions: string[] | null;
  }>;
  const hasServiceRole = Boolean(admin);

  return (
    <DashboardShell
      title='Services & pricing (Supabase)'
      subtitle='Updates apply immediately to the booking page and /api/services.'
      role='admin'
    >
      {seedMsg ? (
        <p className='mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Catalog seed note: {seedMsg} Check <code className='text-gold-soft'>SUPABASE_SERVICE_ROLE_KEY</code> for automatic seeding.
        </p>
      ) : null}
      {error ? (
        <p className='rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200'>
          Could not load service_prices: {error.message}. Run migrations in Supabase if tables are missing.
        </p>
      ) : null}

      {list.length === 0 ? (
        <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-amber-100'>
          <p className='font-semibold'>Database catalog is empty or unavailable.</p>
          <p className='mt-2 text-xs text-amber-100/90'>
            The public booking page still shows built-in reference packages until services exist in Supabase. After migrations,
            refresh this page to edit live prices.
          </p>
          <ul className='mt-4 space-y-2 text-xs text-zinc-200'>
            {defaultServicePackages.map((p) => (
              <li key={p.id} className='flex justify-between gap-4 border-b border-white/10 pb-2'>
                <span className='font-bold text-white'>{p.title}</span>
                <span className='text-zinc-400'>
                  {p.sedanPrice != null ? `Sedan from $${p.sedanPrice}` : 'Quote'} ·{' '}
                  {p.suvTruckPrice != null ? `SUV/Truck from $${p.suvTruckPrice}` : 'Quote'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {list.length > 0 ? (
        <AdminServicesPricingClient initialRows={initialRows} servicesMeta={servicesMeta} hasServiceRole={hasServiceRole} />
      ) : null}

      <Link href='/admin' className='inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
