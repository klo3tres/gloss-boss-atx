import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { updateServiceActiveAction, updateServicePriceCentsAction } from '../service-pricing-actions';
import { defaultServicePackages } from '@/lib/site-config';
import { filterServicePriceRowsForAdminUi } from '@/lib/admin/filter-ui-price-rows';
import { adminDisplayTitleForSlug, CERAMIC_COATING_SLUG } from '@/lib/admin/canonical-services';
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

  const { data: serviceMeta } = await priceClient.from('services').select('id, slug, title, active, sort_order').order('sort_order', { ascending: true });
  const servicesMeta = (serviceMeta ?? []) as Array<{ id: string; slug: string; title: string; active: boolean }>;

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
      {resolvedSearchParams.priceSaved === '1' ? (
        <p className='mb-4 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-4 text-sm text-emerald-100'>
          Price saved. Public booking and services pages were revalidated.
        </p>
      ) : null}
      {typeof resolvedSearchParams.priceErr === 'string' ? (
        <p className='mb-4 rounded-lg border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-100'>
          Price save failed: {resolvedSearchParams.priceErr}
        </p>
      ) : null}
      {!admin ? (
        <p className='mb-4 rounded-lg border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100'>
          <span className='font-semibold'>Service role key recommended.</span> Without{' '}
          <code className='text-gold-soft'>SUPABASE_SERVICE_ROLE_KEY</code>, catalog seeding and some price joins may stay empty even
          when public booking works. Add the key on the server, then refresh this page.
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

      {servicesMeta.length > 0 ? (
        <section className='gb-glass mb-6 rounded-2xl border border-gold/20 p-5'>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Service visibility</p>
          <ul className='mt-3 space-y-2'>
            {servicesMeta.map((s) => (
              <li key={s.id} className='flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2'>
                <span className='text-sm font-semibold text-white'>
                  {s.title} <span className='text-zinc-500'>({s.slug})</span>
                </span>
                <form action={updateServiceActiveAction} className='flex items-center gap-2'>
                  <input type='hidden' name='serviceId' value={s.id} />
                  <input type='hidden' name='active' value={s.active ? 'false' : 'true'} />
                  <button type='submit' className='text-xs font-bold uppercase text-gold-soft'>
                    {s.active ? 'Deactivate' : 'Activate'}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className='space-y-4'>
        {list.map((row) => {
          const svc = Array.isArray(row.services) ? row.services[0] : row.services;
          const slug = typeof svc?.slug === 'string' ? svc.slug : '';
          const title = adminDisplayTitleForSlug(slug);
          const isCeramic = slug === CERAMIC_COATING_SLUG;
          const showQuote = isCeramic && row.price_cents <= 0;
          return (
            <article key={row.id} className='rounded-2xl border border-gold/20 bg-zinc-950 p-4 sm:p-5'>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <p className='text-xs uppercase tracking-widest text-gold-soft'>{slug}</p>
                  <p className='text-lg font-bold text-white'>{title}</p>
                  <p className='text-sm text-zinc-400'>
                    {row.vehicle_class === 'truck' ? 'Truck' : row.vehicle_class === 'suv' || row.vehicle_class === 'suv_truck' ? 'SUV' : 'Sedan'}
                  </p>
                  {showQuote ? (
                    <p className='text-xs font-semibold text-amber-200/90'>
                      Public price: <span className='text-gold-soft'>Quote Required</span> — set a custom amount below to publish a starting price.
                    </p>
                  ) : null}
                </div>
                <form action={updateServicePriceCentsAction} className='flex flex-wrap items-end gap-2'>
                  <input type='hidden' name='priceId' value={row.id} />
                  <label className='text-xs text-zinc-400'>
                    Price (USD){showQuote ? ' (optional)' : ''}
                    <input
                      name='priceDollars'
                      type='number'
                      step='0.01'
                      min={0}
                      defaultValue={row.price_cents > 0 ? (row.price_cents / 100).toFixed(2) : ''}
                      placeholder={showQuote ? 'Quote' : ''}
                      className='mt-1 block w-32 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                    />
                  </label>
                  <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>
                    Save
                  </button>
                </form>
              </div>
            </article>
          );
        })}
      </div>

      <Link href='/admin' className='inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
