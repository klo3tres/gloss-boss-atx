import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import {
  buildRevenuePaymentDetails,
  fetchPaymentsSince,
  startOfMonthIso,
  startOfTodayIso,
  startOfWeekIso,
  startOfYearIso,
  summarizePayments,
} from '@/lib/revenue-metrics';
import { RevenueDashboardClient } from '@/components/admin/revenue-dashboard-client';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { notFound } from 'next/navigation';
import { RevenueChartsClient } from '@/components/admin/revenue-charts';
import { isTestLikeJob } from '@/lib/tech-job-filters';

export const dynamic = 'force-dynamic';

function money(cents: number) {
  return displayMoney(cents);
}

function startOfSixMonthsAgoIso(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 5, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function StatBlock({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <div className='gb-premium-card rounded-2xl border border-gold/15 bg-black/50 p-5 shadow-md backdrop-blur-sm hover:border-gold/45 hover:shadow-[0_0_20px_rgba(212,175,55,0.12)] transition duration-300'>
      <p className='text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400'>{label}</p>
      <p className='mt-3 font-mono text-2.5xl font-black text-gold-soft tracking-tight'>{value}</p>
      {hint ? <p className='mt-1 text-[10px] text-zinc-500 italic leading-tight'>{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className='block transition duration-200 hover:opacity-95'>
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
  const [todayRows, weekRows, monthRows, yearRows, sixMonthRows, allApptsRes] = await Promise.all([
    fetchPaymentsSince(admin, startOfTodayIso(), now),
    fetchPaymentsSince(admin, startOfWeekIso(), now),
    fetchPaymentsSince(admin, startOfMonthIso(), now),
    fetchPaymentsSince(admin, startOfYearIso(), now),
    fetchPaymentsSince(admin, startOfSixMonthsAgoIso(), now),
    admin.from('appointments').select('id, guest_name, guest_email, status, payment_status, deposit_amount_cents, base_price_cents, balance_due_cents, scheduled_start').order('scheduled_start', { ascending: false }).limit(800),
  ]);

  const sumOpts = includeTest ? undefined : { excludeTest: true as const, apptById };
  const today = summarizePayments(todayRows, { ...sumOpts, fromIso: startOfTodayIso(), toIso: now });
  const week = summarizePayments(weekRows, { ...sumOpts, fromIso: startOfWeekIso(), toIso: now });
  const month = summarizePayments(monthRows, { ...sumOpts, fromIso: startOfMonthIso(), toIso: now });
  const year = summarizePayments(yearRows, { ...sumOpts, fromIso: startOfYearIso(), toIso: now });

  const paymentDetails = buildRevenuePaymentDetails(yearRows, apptById, {
    excludeTest: !includeTest,
    fromIso: startOfYearIso(),
    toIso: now,
  });

  const { data: activeGoals } = await admin
    .from('admin_goals')
    .select('id, title, goal_type, target_value, current_value, status')
    .eq('status', 'active')
    .limit(6);

  const { count: completedMonth } = await admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('job_completed_at', startOfMonthIso());

  const goalsForUi = (activeGoals ?? []).map((g) => {
    const row = g as { id: string; title: string; goal_type: string; target_value: number; current_value: number; status: string };
    const goalType = String(row.goal_type ?? '');
    let currentCents = Number(row.current_value ?? 0);
    if (goalType.includes('revenue')) currentCents = month.grossCents;
    else if (goalType.includes('jobs')) currentCents = completedMonth ?? 0;
    return {
      id: row.id,
      title: row.title || goalType.replace(/_/g, ' '),
      goalType,
      targetCents: Number(row.target_value ?? 0),
      currentCents,
      status: row.status,
    };
  });

  const allAppts = (allApptsRes.data ?? []).filter((a) => (includeTest ? true : !isTestLikeJob(a as any)));

  const balanceDueCents = allAppts
    .filter((a) => ['balance_due', 'deposit_paid', 'awaiting_deposit', 'pending'].includes(a.payment_status ?? ''))
    .reduce((s, r) => s + (r.balance_due_cents ?? 0), 0);

  // Deposit collection rate
  const apptsWithDeposits = allAppts.filter((a) => (a.deposit_amount_cents ?? 0) > 0);
  const paidDeposits = apptsWithDeposits.filter((a) => a.payment_status !== 'awaiting_deposit' && a.status !== 'pending');
  const depositCollectionRate = apptsWithDeposits.length > 0
    ? Math.round((paidDeposits.length / apptsWithDeposits.length) * 100)
    : 100;

  // Average completed ticket
  const completedAppts = allAppts.filter((a) => a.status === 'completed');
  const totalCompletedRevenue = completedAppts.reduce((sum, a) => sum + (a.base_price_cents ?? 0), 0);
  const avgCompletedTicketCents = completedAppts.length > 0 ? Math.round(totalCompletedRevenue / completedAppts.length) : 0;
  const avgTicketSize = displayMoney(avgCompletedTicketCents);

  // Group top customers
  const customerSpent: Record<string, { name: string; email: string; totalCents: number; jobCount: number }> = {};
  for (const a of allAppts) {
    if (a.status === 'completed') {
      const email = a.guest_email || 'unknown';
      const name = a.guest_name || 'Guest';
      const cents = a.base_price_cents ?? 0;
      if (!customerSpent[email]) {
        customerSpent[email] = { name, email, totalCents: 0, jobCount: 0 };
      }
      customerSpent[email].totalCents += cents;
      customerSpent[email].jobCount += 1;
    }
  }
  const topCustomers = Object.values(customerSpent)
    .sort((a, b) => b.totalCents - a.totalCents)
    .slice(0, 4);

  // Group monthly revenue last 6 months
  const monthsData: Array<{ label: string; year: number; month: number; value: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    monthsData.push({ label, year: d.getFullYear(), month: d.getMonth(), value: 0 });
  }

  for (const p of sixMonthRows) {
    const pRow = p as any;
    const st = String(pRow.status ?? '').toLowerCase();
    const isSucceeded = st === 'succeeded' || st === 'paid' || st === 'comped' || st === 'manual_comped';
    const isVoided = Boolean(pRow.voided_at || pRow.voided === true) || st === 'voided';
    if (!isSucceeded || isVoided) continue;
    
    // Check if test payment
    const meta = pRow.metadata;
    const isTest = (meta && (meta.is_test === true || meta.test === true)) || 
      (pRow.appointment_id && apptById.get(String(pRow.appointment_id)) && isTestLikeJob(apptById.get(String(pRow.appointment_id)) as any));
    if (!includeTest && isTest) continue;

    const amt = typeof pRow.amount_cents === 'number' ? pRow.amount_cents : 0;
    const pDate = new Date(pRow.created_at || '');
    if (!Number.isNaN(pDate.getTime())) {
      const mIdx = monthsData.findIndex(
        (m) => m.year === pDate.getFullYear() && m.month === pDate.getMonth()
      );
      if (mIdx !== -1) {
        monthsData[mIdx].value += amt;
      }
    }
  }

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

      {/* Insert Interactive Charts Section */}
      <RevenueDashboardClient
        today={today}
        week={week}
        month={month}
        year={year}
        balanceDueCents={balanceDueCents}
        paymentDetails={paymentDetails}
        goals={goalsForUi}
        includeTest={includeTest}
        avgTicketCents={avgCompletedTicketCents}
        completedJobsCount={completedMonth ?? 0}
      />

      <div className='mb-8 mt-8'>
        <RevenueChartsClient
          monthsData={monthsData}
          paymentMixMonth={{
            stripeCents: month.stripeCents,
            cashCents: month.cashCents,
            zelleCents: month.zelleCents,
            otherCents: month.otherCents,
            grossCents: month.grossCents,
            paymentCount: month.paymentCount,
          }}
          depositCollectionRate={depositCollectionRate}
          avgTicketSize={avgTicketSize}
          topCustomers={topCustomers}
        />
      </div>

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
