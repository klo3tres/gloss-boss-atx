import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OperationsDashboardClient } from '@/components/admin/operations-dashboard-client';
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
    admin.from('site_settings').select('key, value').in('key', ['fleet_services_enabled', 'fleet_services_blurb']).limit(5),
  ]);

  const fleetEnabled = ((fleetRes.data ?? []) as Record<string, unknown>[]).some(
    (r) => r.key === 'fleet_services_enabled' && String(r.value).toLowerCase() === 'true',
  );
  const fleetBlurb =
    ((fleetRes.data ?? []) as Record<string, unknown>[]).find((r) => r.key === 'fleet_services_blurb')?.value ?? '';

  const expenses = (expRes.data ?? []) as Record<string, unknown>[];
  const mileage = (mileRes.data ?? []) as Record<string, unknown>[];
  const expenseTotal = expenses.reduce((s, r) => s + (typeof r.amount_cents === 'number' ? r.amount_cents : 0), 0);
  const mileTotal = mileage.reduce((s, r) => s + (typeof r.miles === 'number' ? r.miles : 0), 0);

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
        fleetEnabled={fleetEnabled}
        fleetBlurb={String(fleetBlurb ?? '')}
        schemaReady={!expRes.error && !mileRes.error}
      />
    </DashboardShell>
  );
}
