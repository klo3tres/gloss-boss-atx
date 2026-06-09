import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OperationsDashboardClient } from '@/components/admin/operations-dashboard-client';
import { formatAppointmentLabel } from '@/lib/appointment-label';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

function money(cents: unknown) {
  const n = typeof cents === 'number' ? cents : 0;
  return `$${(n / 100).toFixed(2)}`;
}

export default async function AdminOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const sp = searchParams ? await searchParams : {};
  const range = String(sp.range ?? 'month').trim();

  // Determine date boundaries
  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  let endDate = now.toISOString();

  if (range === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1).toISOString();
  } else if (range === 'lifetime') {
    startDate = new Date(2020, 0, 1).toISOString();
  } else if (range === 'custom') {
    const startParam = String(sp.startDate ?? '').trim();
    const endParam = String(sp.endDate ?? '').trim();
    if (startParam) startDate = new Date(`${startParam}T00:00:00`).toISOString();
    if (endParam) endDate = new Date(`${endParam}T23:59:59`).toISOString();
  }

  // Fetch Business Expenses in date range
  let expRes = await admin.from('business_expenses').select('*').gte('incurred_at', startDate).lte('incurred_at', endDate).order('incurred_at', { ascending: false }).limit(5000);
  if (expRes.error) {
    expRes = await admin.from('business_expenses').select('*').gte('incurred_on', startDate).lte('incurred_on', endDate).order('incurred_on', { ascending: false }).limit(5000);
  }
  if (expRes.error) {
    expRes = await admin.from('business_expenses').select('*').gte('created_at', startDate).lte('created_at', endDate).order('created_at', { ascending: false }).limit(5000);
  }

  // Fetch Mileage logs in date range
  let mileRes = await admin.from('job_mileage_logs').select('*').gte('created_at', startDate).lte('created_at', endDate).order('created_at', { ascending: false }).limit(5000);
  if (mileRes.error) {
    mileRes = await admin.from('job_mileage_logs').select('*').gte('logged_on', startDate).lte('logged_on', endDate).order('logged_on', { ascending: false }).limit(5000);
  }

  const expenses = (expRes?.data ?? []) as Record<string, unknown>[];
  const mileageRaw = (mileRes?.data ?? []) as Record<string, unknown>[];
  
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
    const loggedAt = r.created_at ?? r.logged_on;
    return {
      ...r,
      customer_name: appt?.guest_name ?? '—',
      vehicle: appt?.vehicle_description ?? '—',
      appointment_label: formatAppointmentLabel(appt),
      address: addr || '—',
      miles_one_way: miles,
      round_trip_miles: miles * 2,
      work_order_href: r.appointment_id ? `/tech/work-orders/${String(r.appointment_id)}?shell=admin` : null,
      logged_at: loggedAt,
      logged_date: loggedAt ? String(loggedAt).slice(0, 10) : '—',
    };
  });

  const expenseTotal = expenses.reduce((s, r) => s + (typeof r.amount_cents === 'number' ? r.amount_cents : 0), 0);
  const mileTotal = mileage.reduce((s, r) => s + (typeof r.miles_one_way === 'number' ? r.miles_one_way : 0), 0);
  
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
    <DashboardShell title='Operations' subtitle='Business expenses and job mileage logs.' role='admin'>
      {expRes?.error ? (
        <p className='mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>
          Expenses error: {expRes.error.message}.
        </p>
      ) : null}
      {mileRes?.error ? (
        <p className='mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100'>
          Mileage error: {mileRes.error.message}.
        </p>
      ) : null}

      {/* Date range selection pills */}
      <div className='flex flex-wrap gap-2 mb-6'>
        {[
          ['month', 'This Month'],
          ['year', 'This Year'],
          ['lifetime', 'Lifetime'],
          ['custom', 'Custom Range'],
        ].map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/operations?range=${key}`}
            className={`rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
              range === key
                ? 'bg-gold text-black shadow-md'
                : 'border border-white/10 bg-zinc-950 text-zinc-400 hover:text-white'
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Custom range datepicker drawer/form */}
      {range === 'custom' && (
        <form method='GET' action='/admin/operations' className='flex flex-wrap items-end gap-3 mb-6 p-5 rounded-3xl border border-gold/20 bg-zinc-950'>
          <input type='hidden' name='range' value='custom' />
          <label className='block text-xs text-zinc-400'>
            Start Date
            <input
              type='date'
              name='startDate'
              defaultValue={sp.startDate ? String(sp.startDate) : ''}
              className='mt-1 block rounded-lg border border-white/15 bg-black px-3 py-2 text-xs text-white'
            />
          </label>
          <label className='block text-xs text-zinc-400'>
            End Date
            <input
              type='date'
              name='endDate'
              defaultValue={sp.endDate ? String(sp.endDate) : ''}
              className='mt-1 block rounded-lg border border-white/15 bg-black px-3 py-2 text-xs text-white'
            />
          </label>
          <button type='submit' className='rounded-lg bg-gold px-4 py-2.5 text-xs font-black uppercase text-black hover:bg-gold-light transition'>
            Apply Filter
          </button>
        </form>
      )}

      <div className='mb-6 grid gap-4 sm:grid-cols-2'>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-6'>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Expenses in selected range</p>
          <p className='mt-2 text-3xl font-black text-white'>{money(expenseTotal)}</p>
        </div>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-6'>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Miles logged in selected range</p>
          <p className='mt-2 text-3xl font-black text-white'>{mileTotal.toFixed(1)} mi</p>
        </div>
      </div>

      <OperationsDashboardClient
        expenses={expenses}
        mileage={mileage}
        mileageSummary={mileageSummary}
        mapsAutoNote={!process.env.GOOGLE_MAPS_API_KEY && !process.env.MAPS_API_KEY}
        schemaReady={!expRes?.error && !mileRes?.error}
      />
    </DashboardShell>
  );
}
