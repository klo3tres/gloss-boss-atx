import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OperationsDashboardClient } from '@/components/admin/operations-dashboard-client';
import { DEFAULT_FLEET_PRICING, parseFleetPricing } from '@/lib/fleet-pricing';
import { fetchBusinessExpenses, fetchJobMileageLogs } from '@/lib/operations-db';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function money(cents: unknown) {
  const n = typeof cents === 'number' ? cents : 0;
  return `$${(n / 100).toFixed(2)}`;
}

export default async function AdminOperationsPage() {
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return (
      <DashboardShell title='Operations' subtitle='Expenses, mileage, fleet flags.' role='admin'>
        <p className='text-amber-200'>Service role unavailable.</p>
      </DashboardShell>
    );
  }

  const [expRes, mileRes, fleetRes] = await Promise.all([
    fetchBusinessExpenses(admin, 80),
    fetchJobMileageLogs(admin, 80),
    admin
      .from('site_settings')
      .select('key, value')
      .in('key', ['fleet_services_enabled', 'fleet_services_blurb', 'fleet_pricing'])
      .limit(10),
  ]);

  const fleetEnabled = ((fleetRes.data ?? []) as Record<string, unknown>[]).some(
    (r) => r.key === 'fleet_services_enabled' && String(r.value).toLowerCase() === 'true',
  );
  const fleetBlurb =
    ((fleetRes.data ?? []) as Record<string, unknown>[]).find((r) => r.key === 'fleet_services_blurb')?.value ?? '';
  const fleetPricingRaw = ((fleetRes.data ?? []) as Record<string, unknown>[]).find((r) => r.key === 'fleet_pricing')?.value;
  let fleetPricing = { ...DEFAULT_FLEET_PRICING };
  if (fleetPricingRaw) {
    try {
      fleetPricing = parseFleetPricing(
        typeof fleetPricingRaw === 'string' ? JSON.parse(fleetPricingRaw) : fleetPricingRaw,
      );
    } catch {
      fleetPricing = { ...DEFAULT_FLEET_PRICING };
    }
  }

  const expenses = (expRes.data ?? []) as Record<string, unknown>[];
  const mileageRaw = (mileRes.data ?? []) as Record<string, unknown>[];
  const apptIds = mileageRaw.map((r) => String(r.appointment_id ?? '')).filter(Boolean);
  const apptMap = new Map<string, Record<string, unknown>>();
  if (apptIds.length > 0) {
    const { data: appts } = await admin.from('appointments').select('id, guest_name, vehicle_description, service_address, service_city, service_state, service_zip, scheduled_start').in('id', apptIds);
    for (const a of appts ?? []) apptMap.set(String((a as Record<string, unknown>).id), a as Record<string, unknown>);
  }
  const mileage = mileageRaw.map((r) => {
    const appt = apptMap.get(String(r.appointment_id ?? ''));
    const addr = appt
      ? [appt.service_address, appt.service_city, appt.service_state, appt.service_zip].filter(Boolean).join(', ')
      : '';
    const miles = typeof r.total_miles === 'number' ? r.total_miles : typeof r.estimated_miles === 'number' ? r.estimated_miles : typeof r.miles === 'number' ? r.miles : 0;
    return {
      ...r,
      customer_name: appt?.guest_name ?? '—',
      vehicle: appt?.vehicle_description ?? '—',
      address: addr || '—',
      miles_one_way: miles,
      round_trip_miles: miles * 2,
      work_order_href: r.appointment_id ? `/tech/work-orders/${String(r.appointment_id)}?shell=admin` : null,
      logged_at: r.created_at ?? r.logged_on,
    };
  });
  const expenseTotal = expenses.reduce((s, r) => s + (typeof r.amount_cents === 'number' ? r.amount_cents : 0), 0);
  const mileTotal = mileage.reduce((s, r) => s + (typeof r.miles_one_way === 'number' ? r.miles_one_way : 0), 0);
  const now = new Date();
  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startYear = new Date(now.getFullYear(), 0, 1);
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sumMilesInRange = (from: Date) =>
    mileage
      .filter((r) => {
        const t = new Date(String(r.logged_at ?? ''));
        return !Number.isNaN(t.getTime()) && t >= from;
      })
      .reduce((s, r) => s + (typeof r.round_trip_miles === 'number' ? r.round_trip_miles : 0), 0);
  const mileageSummary = {
    today: sumMilesInRange(startDay),
    month: sumMilesInRange(startMonth),
    year: sumMilesInRange(startYear),
    lifetime: mileage.reduce((s, r) => s + (typeof r.round_trip_miles === 'number' ? r.round_trip_miles : 0), 0),
  };

  return (
    <DashboardShell title='Operations' subtitle='Business expenses, job mileage, and fleet section visibility.' role='admin'>
      {expRes.error ? (
        <p className='mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>
          Expenses: {expRes.error.message}. Apply migration 000055.
        </p>
      ) : null}
      {mileRes.error ? (
        <p className='mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>
          Mileage: {mileRes.error.message}. Apply migration 000055.
        </p>
      ) : null}
      <div className='mb-6 grid gap-4 sm:grid-cols-3'>
        <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-4'>
          <p className='text-xs uppercase tracking-widest text-gold-soft'>Expenses (recent)</p>
          <p className='mt-2 text-2xl font-black text-white'>{money(expenseTotal)}</p>
        </div>
        <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-4'>
          <p className='text-xs uppercase tracking-widest text-gold-soft'>Miles logged</p>
          <p className='mt-2 text-2xl font-black text-white'>{mileTotal.toFixed(1)}</p>
        </div>
        <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-4'>
          <p className='text-xs uppercase tracking-widest text-gold-soft'>Fleet on /services</p>
          <p className='mt-2 text-2xl font-black text-white'>{fleetEnabled ? 'Visible' : 'Hidden'}</p>
        </div>
      </div>
      <OperationsDashboardClient
        expenses={expenses}
        mileage={mileage}
        mileageSummary={mileageSummary}
        mapsAutoNote={!process.env.GOOGLE_MAPS_API_KEY && !process.env.MAPS_API_KEY}
        fleetEnabled={fleetEnabled}
        fleetBlurb={String(fleetBlurb ?? '')}
        fleetPricing={fleetPricing}
        schemaReady={!expRes.error && !mileRes.error}
      />
    </DashboardShell>
  );
}
