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

export default async function AdminRevenuePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const sp = searchParams ? await searchParams : {};
  const includeTest = sp.includeTest === '1';

  const { data: apptMeta } = await admin.from('appointments').select('id, guest_email, guest_name, guest_phone').limit(800);
  const apptById = new Map(
    (apptMeta ?? []).map((a) => {
      const row = a as { id: string; guest_email: string | null; guest_name: string | null; guest_phone: string | null };
      return [row.id, row] as const;
    }),
  );

  const now = new Date().toISOString();
  const [todayRows, weekRows, monthRows, yearRows] = await Promise.all([
    fetchPaymentsSince(admin, startOfTodayIso(), now),
    fetchPaymentsSince(admin, startOfWeekIso(), now),
    fetchPaymentsSince(admin, startOfMonthIso(), now),
    fetchPaymentsSince(admin, startOfYearIso(), now),
  ]);

  const sumOpts = includeTest ? undefined : { excludeTest: true as const, apptById };
  const today = summarizePayments(todayRows, sumOpts);
  const week = summarizePayments(weekRows, sumOpts);
  const month = summarizePayments(monthRows, sumOpts);
  const year = summarizePayments(yearRows, sumOpts);

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

  const { data: debugEvents } = await admin
    .from('payment_debug_events')
    .select('id, event_type, error_message, created_at, appointment_id')
    .order('created_at', { ascending: false })
    .limit(8);

  const { data: upcoming } = await admin
    .from('appointments')
    .select('id, guest_name, scheduled_start, payment_status, balance_due_cents')
    .gte('scheduled_start', now)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .order('scheduled_start', { ascending: true })
    .limit(6);

  return (
    <DashboardShell title='Revenue' subtitle='Cash collected — voided payments excluded.' role='admin'>
      <section className='gb-premium-hero mb-8 rounded-3xl px-6 py-8'>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Owner revenue</p>
        <p className='mt-2 font-mono text-4xl font-black text-gold-soft sm:text-5xl'>{money(month.grossCents)}</p>
        <p className='mt-1 text-sm text-zinc-400'>Collected this month · {month.paymentCount} payments</p>
        <div className='mt-6 flex flex-wrap gap-2'>
          <Link href='/admin' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
            ← Command center
          </Link>
          <Link href='/admin/receipts' className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black'>
            Receipts
          </Link>
          {includeTest ? (
            <Link href='/admin/revenue' className='rounded-xl border border-amber-500/40 px-4 py-2 text-xs font-black uppercase text-amber-200'>
              Hide test payments
            </Link>
          ) : (
            <Link href='/admin/revenue?includeTest=1' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-400'>
              Include test payments
            </Link>
          )}
        </div>
      </section>

      <section className='space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Collected</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatBlock label='Stripe (month)' value={money(month.stripeCents)} hint='Succeeded Stripe rows' />
          <StatBlock label='Cash (month)' value={money(month.cashCents)} />
          <StatBlock label='Zelle/Venmo (month)' value={money(month.zelleCents)} />
          <StatBlock label='Other (month)' value={money(month.otherCents)} />
        </div>
        <div className='mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
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

      {(debugEvents ?? []).length > 0 ? (
        <section className='mt-8 space-y-3'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-red-300'>Payment alerts</p>
          <ul className='space-y-2 text-sm'>
            {(debugEvents ?? []).map((e) => {
              const row = e as { id: string; event_type: string; error_message: string | null; created_at: string; appointment_id: string | null };
              return (
                <li key={row.id} className='rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-100'>
                  <span className='font-mono text-[10px] uppercase'>{row.event_type}</span>
                  <p className='mt-1'>{row.error_message ?? 'Webhook/processing issue'}</p>
                  {row.appointment_id ? (
                    <Link href={`/admin/work-orders/${row.appointment_id}?shell=admin`} className='mt-2 inline-block text-xs text-gold-soft underline'>
                      Open work order
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {(upcoming ?? []).length > 0 ? (
        <section className='mt-8 space-y-3'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Upcoming jobs</p>
          <ul className='space-y-2 text-sm'>
            {(upcoming ?? []).map((a) => {
              const row = a as { id: string; guest_name: string | null; scheduled_start: string; payment_status: string | null; balance_due_cents: number | null };
              return (
                <li key={row.id} className='flex flex-wrap justify-between gap-2 rounded-xl border border-white/10 px-4 py-3'>
                  <Link href={`/tech/work-orders/${row.id}?shell=admin`} className='font-semibold text-white hover:text-gold-soft'>
                    {row.guest_name ?? 'Customer'}
                  </Link>
                  <span className='text-zinc-400'>
                    {new Date(row.scheduled_start).toLocaleString()} · {row.payment_status ?? 'pending'} · balance{' '}
                    {money(row.balance_due_cents ?? 0)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className='mt-8 text-xs text-zinc-500'>
        Gross revenue sums succeeded, non-voided payments{includeTest ? ' (including test bookings)' : ' — test bookings excluded by default'}.
        Work order totals use the canonical order ledger; revenue here matches payment rows.
      </p>
    </DashboardShell>
  );
}
