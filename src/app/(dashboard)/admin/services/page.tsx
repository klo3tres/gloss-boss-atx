import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { updateServicePriceCentsAction } from '../service-pricing-actions';
import { defaultServicePackages } from '@/lib/site-config';
import { filterServicePriceRowsForAdminUi } from '@/lib/admin/filter-ui-price-rows';

export const dynamic = 'force-dynamic';

type PriceRow = {
  id: string;
  vehicle_class: string;
  price_cents: number;
  services: { title: string; slug: string } | { title: string; slug: string }[] | null;
};

export default async function AdminServicesPricingPage() {
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

  const { data: rows, error } = await supabase
    .from('service_prices')
    .select('id, vehicle_class, price_cents, services ( title, slug )')
    .order('vehicle_class', { ascending: true });

  const list = filterServicePriceRowsForAdminUi((rows ?? []) as PriceRow[]);

  return (
    <DashboardShell
      title='Services & pricing (Supabase)'
      subtitle='Updates apply immediately to the booking page and /api/services.'
      role='admin'
    >
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

      <div className='space-y-4'>
        {list.map((row) => {
          const svc = Array.isArray(row.services) ? row.services[0] : row.services;
          const title = svc?.title ?? 'Service';
          const slug = svc?.slug ?? '';
          return (
            <article key={row.id} className='rounded-2xl border border-gold/20 bg-zinc-950 p-4 sm:p-5'>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                <div>
                  <p className='text-xs uppercase tracking-widest text-gold-soft'>{slug}</p>
                  <p className='text-lg font-bold text-white'>{title}</p>
                  <p className='text-sm text-zinc-400'>{row.vehicle_class === 'suv_truck' ? 'SUV / Truck' : 'Sedan'}</p>
                </div>
                <form action={updateServicePriceCentsAction} className='flex flex-wrap items-end gap-2'>
                  <input type='hidden' name='priceId' value={row.id} />
                  <label className='text-xs text-zinc-400'>
                    Price (USD)
                    <input
                      name='priceDollars'
                      type='number'
                      step='0.01'
                      min={0}
                      defaultValue={(row.price_cents / 100).toFixed(2)}
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
