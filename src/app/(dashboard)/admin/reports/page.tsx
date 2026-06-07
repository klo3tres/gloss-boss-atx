import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import { fetchFinancialSummary } from '@/lib/financial-ledger';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const sp = searchParams ? await searchParams : {};
  const from = String(sp.from ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const to = String(sp.to ?? new Date().toISOString().slice(0, 10));
  const includeTest = sp.includeTest === '1';
  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59`).toISOString();
  const summary = await fetchFinancialSummary(admin, fromIso, toIso, { includeTest });
  const qs = `from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${includeTest ? '&includeTest=1' : ''}`;

  const reports = [
    ['Revenue report', 'revenue'],
    ['Expense report', 'expenses'],
    ['Profit/loss report', 'revenue'],
    ['Stripe reconciliation report', 'revenue'],
    ['Work order revenue report', 'payments'],
    ['Payment report', 'payments'],
    ['Membership report', 'memberships'],
  ];

  return (
    <DashboardShell title='Reports' subtitle='Tax-time reports with date filters, CSV export, and test data excluded by default.' role='admin'>
      <form className='rounded-2xl border border-gold/20 bg-zinc-950 p-5 print:hidden'>
        <div className='grid gap-3 sm:grid-cols-4'>
          <label className='text-xs text-zinc-400'>From<input name='from' type='date' defaultValue={from} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='text-xs text-zinc-400'>To<input name='to' type='date' defaultValue={to} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-white' /></label>
          <label className='flex items-end gap-2 pb-2 text-xs text-zinc-300'><input type='checkbox' name='includeTest' value='1' defaultChecked={includeTest} className='accent-[var(--gold)]' />Include test data</label>
          <button className='self-end rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Apply</button>
        </div>
      </form>

      <section className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Gross</p><p className='mt-2 text-2xl font-black text-white'>{displayMoney(summary.grossRevenueCents)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Refunds + fees</p><p className='mt-2 text-2xl font-black text-white'>{displayMoney(summary.refundsCents + summary.stripeFeesCents)}</p></div>
        <div className='rounded-2xl border border-white/10 bg-black/40 p-5'><p className='text-xs uppercase text-zinc-500'>Expenses</p><p className='mt-2 text-2xl font-black text-white'>{displayMoney(summary.expensesCents)}</p></div>
        <div className='rounded-2xl border border-gold/20 bg-black/40 p-5'><p className='text-xs uppercase text-gold-soft'>Net profit</p><p className='mt-2 text-2xl font-black text-gold-soft'>{displayMoney(summary.netProfitCents)}</p></div>
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {reports.map(([label, report]) => (
            <Link key={label} href={`/api/admin/reports/export?report=${report}&${qs}`} className='rounded-xl border border-white/10 bg-black/35 px-4 py-4 text-sm font-bold text-white transition hover:border-gold/40'>
              {label}
              <span className='mt-1 block text-xs font-normal text-zinc-500'>Export CSV</span>
            </Link>
          ))}
        </div>
      </section>

      <section className='rounded-2xl border border-white/10 bg-black/35 p-5 print:border-black print:bg-white print:text-black'>
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft print:text-black'>Print/PDF summary</p>
        <p className='mt-3 text-sm text-zinc-300 print:text-black'>Gross Revenue - Refunds - Stripe Fees - Expenses = Net Profit</p>
        <p className='mt-2 text-sm text-zinc-400 print:text-black'>
          {displayMoney(summary.grossRevenueCents)} - {displayMoney(summary.refundsCents)} - {displayMoney(summary.stripeFeesCents)} - {displayMoney(summary.expensesCents)} = {displayMoney(summary.netProfitCents)}
        </p>
      </section>
    </DashboardShell>
  );
}
