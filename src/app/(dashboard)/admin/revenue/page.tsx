import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import {
  fetchPaymentsSince,
  startOfMonthIso,
  startOfTodayIso,
  startOfWeekIso,
  startOfYearIso,
  summarizePayments,
} from '@/lib/revenue-metrics';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

function money(cents: number) {
  return displayMoney(cents);
}

function StatBlock({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <div className='gb-premium-card rounded-2xl border border-gold/20 bg-black/50 p-5 transition hover:border-gold/45'>
      <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>{label}</p>
      <p className='mt-2 font-mono text-2xl font-black text-gold-soft'>{value}</p>
      {hint ? <p className='mt-1 text-xs text-zinc-500'>{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className='block'>
      {inner}
    </Link>
  ) : (
    inner
  );
}

export default async function AdminRevenuePage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const now = new Date().toISOString();
  const [todayRows, weekRows, monthRows, yearRows] = await Promise.all([
    fetchPaymentsSince(admin, startOfTodayIso(), now),
    fetchPaymentsSince(admin, startOfWeekIso(), now),
    fetchPaymentsSince(admin, startOfMonthIso(), now),
    fetchPaymentsSince(admin, startOfYearIso(), now),
  ]);

  const today = summarizePayments(todayRows);
  const week = summarizePayments(weekRows);
  const month = summarizePayments(monthRows);
  const year = summarizePayments(yearRows);

  const { data: appts } = await admin
    .from('appointments')
    .select('balance_due_cents, payment_status')
    .in('payment_status', ['balance_due', 'deposit_paid', 'awaiting_deposit', 'pending'])
    .limit(500);
  const balanceDueCents = (appts ?? []).reduce(
    (s, r) => s + (typeof (r as { balance_due_cents?: number }).balance_due_cents === 'number' ? (r as { balance_due_cents: number }).balance_due_cents : 0),
    0,
  );

  const { count: completedMonth } = await admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('job_completed_at', startOfMonthIso());

  const avgTicketCents = month.paymentCount > 0 ? Math.round(month.grossCents / month.paymentCount) : 0;

  return (
    <DashboardShell title='Revenue' subtitle='Collected payments, balances due, and method breakdown (voided rows excluded).' role='admin'>
      <div className='mb-6 flex flex-wrap gap-2'>
        <Link href='/admin/payments' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
          Stripe ledger
        </Link>
        <Link href='/admin/receipts' className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'>
          Receipts
        </Link>
      </div>

      <section className='space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Collected (non-voided)</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatBlock label='Today' value={money(today.grossCents)} hint={`${today.paymentCount} payment(s)`} href='/admin/payments?range=today' />
          <StatBlock label='This week' value={money(week.grossCents)} hint={`${week.paymentCount} payment(s)`} href='/admin/payments?range=week' />
          <StatBlock label='This month' value={money(month.grossCents)} hint={`${month.paymentCount} payment(s)`} href='/admin/payments?range=month' />
          <StatBlock label='Year to date' value={money(year.grossCents)} hint={`${year.paymentCount} payment(s)`} />
        </div>
      </section>

      <section className='mt-8 space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Month breakdown</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          <StatBlock label='Stripe / card' value={money(month.stripeCents)} />
          <StatBlock label='Cash' value={money(month.cashCents)} />
          <StatBlock label='Zelle / Venmo' value={money(month.zelleCents)} />
          <StatBlock label='Other manual' value={money(month.otherCents)} />
          <StatBlock label='Open balances (appointments)' value={money(balanceDueCents)} href='/admin/work-orders' />
          <StatBlock label='Avg payment (month)' value={money(avgTicketCents)} hint={`${completedMonth ?? 0} jobs completed this month`} />
        </div>
      </section>

      <p className='mt-8 text-xs text-zinc-500'>
        Gross revenue sums succeeded payment rows only. Void test/duplicate payments on the work order receipt builder so totals match job pricing.
      </p>
    </DashboardShell>
  );
}
