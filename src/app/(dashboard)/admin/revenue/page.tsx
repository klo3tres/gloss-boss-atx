import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';
import {
  buildRevenueDiagnostics,
  fetchPaymentsSince,
  startOfMonthIso,
  startOfTodayIso,
  startOfWeekIso,
  startOfYearIso,
  summarizePayments,
} from '@/lib/revenue-metrics';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { notFound } from 'next/navigation';
import { RevenueChartsClient } from '@/components/admin/revenue-charts';
import { isTestLikeJob } from '@/lib/tech-job-filters';
import { fetchFinancialSummary } from '@/lib/financial-ledger';
import Stripe from 'stripe';
import { getStripeFinanceSnapshot } from '@/lib/stripe-finance-sync';
import { getStripeSecrets } from '@/lib/stripe/stripeService';

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

  const sumOpts = includeTest
    ? { fromIso: startOfMonthIso(), toIso: now }
    : { excludeTest: true as const, apptById, fromIso: startOfMonthIso(), toIso: now };
  const today = summarizePayments(todayRows, includeTest ? { fromIso: startOfTodayIso(), toIso: now } : { excludeTest: true, apptById, fromIso: startOfTodayIso(), toIso: now });
  const week = summarizePayments(weekRows, includeTest ? { fromIso: startOfWeekIso(), toIso: now } : { excludeTest: true, apptById, fromIso: startOfWeekIso(), toIso: now });
  const month = summarizePayments(monthRows, sumOpts);
  const year = summarizePayments(yearRows, includeTest ? { fromIso: startOfYearIso(), toIso: now } : { excludeTest: true, apptById, fromIso: startOfYearIso(), toIso: now });
  const monthDiagnostics = buildRevenueDiagnostics(monthRows, sumOpts);
  const financial = await fetchFinancialSummary(admin, startOfMonthIso(), now, { includeTest });
  let stripeBalances: { available: number | null; pending: number | null; treasury: number | null } = { available: null, pending: null, treasury: null };
  const stripeSecrets = await getStripeSecrets(admin);
  if (stripeSecrets.secretKey) {
    try {
      const snap = await getStripeFinanceSnapshot(new Stripe(stripeSecrets.secretKey));
      stripeBalances = {
        available: snap.paymentAvailableCents,
        pending: snap.paymentPendingCents,
        treasury: snap.treasuryAvailableCents,
      };
    } catch {
      stripeBalances = { available: null, pending: null, treasury: null };
    }
  }

  const allAppts = (allApptsRes.data ?? []).filter((a) => includeTest ? true : !isTestLikeJob(a as any));

  const balanceDueCents = allAppts
    .filter((a) => ['balance_due', 'deposit_paid', 'awaiting_deposit', 'pending'].includes(a.payment_status ?? ''))
    .reduce((s, r) => s + (r.balance_due_cents ?? 0), 0);

  const { count: completedMonth } = await admin
    .from('appointments')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('job_completed_at', startOfMonthIso());

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
      <div className='mb-8'>
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
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Stripe money ledger + profit</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatBlock label='Gross revenue' value={money(financial.grossRevenueCents || month.grossCents)} hint='Stripe ledger when synced; payments fallback shown if ledger is empty' />
          <StatBlock label='Refunds' value={money(financial.refundsCents)} />
          <StatBlock label='Stripe fees' value={money(financial.stripeFeesCents)} />
          <StatBlock label='Expenses' value={money(financial.expensesCents)} />
          <StatBlock label='Net profit' value={money((financial.grossRevenueCents || month.grossCents) - financial.refundsCents - financial.stripeFeesCents - financial.expensesCents)} hint='Gross - refunds - fees - expenses' />
          <StatBlock label='Payouts to bank' value={money(financial.payoutsCents)} />
          <StatBlock label='Available Stripe balance' value={stripeBalances.available == null ? 'Unavailable' : money(stripeBalances.available)} />
          <StatBlock label='Pending Stripe balance' value={stripeBalances.pending == null ? 'Unavailable' : money(stripeBalances.pending)} />
          <StatBlock label='Treasury balance' value={stripeBalances.treasury == null ? 'Unavailable' : money(stripeBalances.treasury)} />
          <StatBlock label='Open balances' value={money(balanceDueCents)} href='/admin/work-orders' />
          <StatBlock label='Paid invoices/deposits' value={money(month.grossCents)} href='/admin/payments' />
        </div>
        <p className='text-xs text-zinc-500'>
          Stripe balance is not company profit. Gross revenue, fees, refunds, expenses, net profit, and payouts are tracked separately for tax-time clarity.
        </p>
      </section>

      <section className='mt-8 space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Month breakdown</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          <StatBlock label='Stripe / card' value={money(month.stripeCents)} />
          <StatBlock label='Cash' value={money(month.cashCents)} />
          <StatBlock label='Zelle / Venmo' value={money(month.zelleCents)} />
          <StatBlock label='Other manual' value={money(month.otherCents)} />
          <StatBlock label='Open balances (appointments)' value={money(balanceDueCents)} href='/admin/work-orders' />
          <StatBlock label='Avg payment (month)' value={money(month.paymentCount > 0 ? Math.round(month.grossCents / month.paymentCount) : 0)} hint={`${completedMonth ?? 0} jobs completed this month`} />
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

      <section className='mt-8 rounded-2xl border border-white/10 bg-black/40 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Revenue diagnostics (admin) · this month</p>
        <dl className='mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4'>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Payment rows loaded</dt>
            <dd className='font-mono font-bold text-white'>{monthDiagnostics.rowsLoaded}</dd>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Rows counted</dt>
            <dd className='font-mono font-bold text-emerald-400'>{monthDiagnostics.rowsCounted}</dd>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Rows excluded</dt>
            <dd className='font-mono font-bold text-amber-300'>{monthDiagnostics.rowsExcluded}</dd>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Gross collected</dt>
            <dd className='font-mono font-bold text-gold-soft'>{money(monthDiagnostics.grossCents)}</dd>
          </div>
        </dl>
        {Object.keys(monthDiagnostics.byMethod).length > 0 ? (
          <div className='mt-4'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Total by method</p>
            <ul className='mt-2 flex flex-wrap gap-2 text-xs'>
              {Object.entries(monthDiagnostics.byMethod).map(([ch, cents]) => (
                <li key={ch} className='rounded-full border border-white/10 px-3 py-1 font-mono text-zinc-200'>
                  {ch}: {money(cents)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {monthDiagnostics.exclusions.length > 0 ? (
          <div className='mt-4 max-h-48 overflow-y-auto'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Exclusion reasons (sample)</p>
            <ul className='mt-2 space-y-1 text-xs text-zinc-400'>
              {monthDiagnostics.exclusions.map((ex) => (
                <li key={`${ex.id}-${ex.reason}`}>
                  {ex.id.slice(0, 8)}… · {money(ex.amountCents)} · {ex.method} — {ex.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className='mt-3 text-xs text-zinc-500'>No excluded rows in this period (or all rows counted).</p>
        )}
        {month.grossCents === 0 && monthDiagnostics.rowsCounted > 0 ? (
          <p className='mt-3 text-xs text-amber-200'>
            Warning: summarize mismatch — diagnostics counted {monthDiagnostics.rowsCounted} rows but summary shows $0. Report this.
          </p>
        ) : null}
        {month.grossCents === 0 && monthDiagnostics.rowsLoaded === 0 ? (
          <p className='mt-3 text-xs text-zinc-500'>
            No payment rows in range. Receipts with payments should appear here unless voided, test-hidden, or missing paid_at/created_at.
          </p>
        ) : null}
      </section>

      <p className='mt-8 text-xs text-zinc-500'>
        Gross revenue sums succeeded, non-voided payments{includeTest ? ' (including test bookings)' : ' — test bookings excluded by default'}.
        Work order totals use the canonical order ledger; revenue here matches payment rows.
      </p>
    </DashboardShell>
  );
}
