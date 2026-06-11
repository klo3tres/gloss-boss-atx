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
import { getFinancialSnapshot } from '@/lib/financial-ledger';
import Stripe from 'stripe';
import { getStripeFinanceSnapshot } from '@/lib/stripe-finance-sync';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { AlertTriangle } from 'lucide-react';
import { DuplicatePaymentsPanel } from '@/components/admin/duplicate-payments-panel';

export const dynamic = 'force-dynamic';

type AnyRow = any;

function paymentDuplicateKey(row: any): string {
  const stripeId = String(row.stripe_payment_intent_id || row.stripe_checkout_session_id || '').trim();
  if (stripeId) return `stripe:${stripeId}`;
  return [
    String(row.appointment_id || ''),
    String(row.customer_id || ''),
    String(row.amount_cents || ''),
    String(row.payment_method || row.payment_kind || ''),
  ].join('::');
}

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
  const [todayRows, weekRows, monthRows, yearRows, sixMonthRows, allApptsRes, techsRes] = await Promise.all([
    fetchPaymentsSince(admin, startOfTodayIso(), now),
    fetchPaymentsSince(admin, startOfWeekIso(), now),
    fetchPaymentsSince(admin, startOfMonthIso(), now),
    fetchPaymentsSince(admin, startOfYearIso(), now),
    fetchPaymentsSince(admin, startOfSixMonthsAgoIso(), now),
    admin.from('appointments').select('id, guest_name, guest_email, status, payment_status, deposit_amount_cents, base_price_cents, balance_due_cents, scheduled_start, service_slug, assigned_technician_id, vehicle_class').order('scheduled_start', { ascending: false }).limit(800),
    admin.from('profiles').select('id, full_name, email').in('role', ['technician', 'admin', 'super_admin']),
  ]);

  const techNames: Record<string, string> = {};
  for (const t of techsRes.data ?? []) {
    const row = t as { id: string; full_name: string | null; email: string | null };
    techNames[row.id] = row.full_name?.trim() || row.email?.trim() || 'Tech';
  }

  const sumOpts = includeTest
    ? { fromIso: startOfMonthIso(), toIso: now }
    : { excludeTest: true as const, apptById, fromIso: startOfMonthIso(), toIso: now };
  const today = summarizePayments(todayRows, includeTest ? { fromIso: startOfTodayIso(), toIso: now } : { excludeTest: true, apptById, fromIso: startOfTodayIso(), toIso: now });
  const week = summarizePayments(weekRows, includeTest ? { fromIso: startOfWeekIso(), toIso: now } : { excludeTest: true, apptById, fromIso: startOfWeekIso(), toIso: now });
  const month = summarizePayments(monthRows, sumOpts);
  const year = summarizePayments(yearRows, includeTest ? { fromIso: startOfYearIso(), toIso: now } : { excludeTest: true, apptById, fromIso: startOfYearIso(), toIso: now });
  const monthDiagnostics = buildRevenueDiagnostics(monthRows, sumOpts);
  const financial = await getFinancialSnapshot(admin, { startDate: startOfMonthIso(), endDate: now, includeTest });
  const sourceBreakdown = [
    { label: 'Stripe/card', cents: financial.stripeRevenueCents, hint: 'Succeeded card payments saved locally' },
    { label: 'Cash', cents: financial.cashRevenueCents, hint: 'Manual cash payments' },
    { label: 'Zelle/Venmo/Cash App', cents: financial.zelleRevenueCents, hint: 'Direct electronic payments' },
    { label: 'Memberships', cents: financial.membershipRevenueCents, hint: 'Membership payment rows' },
    { label: 'Other/manual', cents: financial.otherRevenueCents, hint: 'Other non-voided payment rows' },
  ].filter((row) => row.cents !== 0 || financial.grossRevenueCents === 0);
  
  let stripeBalances: { available: number | null; pending: number | null; treasury: number | null } = { available: null, pending: null, treasury: null };
  const stripeSecrets = await getStripeSecrets(admin);
  const isStripeConnected = Boolean(stripeSecrets.secretKey);
  
  if (isStripeConnected && stripeSecrets.secretKey) {
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

  const balanceDueCents = financial.openBalancesCents || allAppts
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

  // Advanced Breakdowns (Phase 2 additions)
  // Popular Services and Service Revenue
  const serviceBreakdown: Record<string, { label: string; count: number; revenueCents: number }> = {};
  for (const a of allAppts) {
    if (a.status === 'completed') {
      const slug = a.service_slug || 'other';
      const label = slug.replace(/-/g, ' ');
      const price = a.base_price_cents ?? 0;
      if (!serviceBreakdown[slug]) {
        serviceBreakdown[slug] = { label, count: 0, revenueCents: 0 };
      }
      serviceBreakdown[slug].count += 1;
      serviceBreakdown[slug].revenueCents += price;
    }
  }
  const popularServices = Object.values(serviceBreakdown)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Tech Revenue
  const techBreakdown: Record<string, { name: string; count: number; revenueCents: number }> = {};
  for (const a of allAppts) {
    if (a.status === 'completed' && a.assigned_technician_id) {
      const tid = a.assigned_technician_id;
      const name = techNames[tid] || 'Tech';
      const price = a.base_price_cents ?? 0;
      if (!techBreakdown[tid]) {
        techBreakdown[tid] = { name, count: 0, revenueCents: 0 };
      }
      techBreakdown[tid].count += 1;
      techBreakdown[tid].revenueCents += price;
    }
  }
  const techRevenueList = Object.values(techBreakdown)
    .sort((a, b) => b.revenueCents - a.revenueCents)
    .slice(0, 5);

  // Vehicle Type Revenue
  const vehicleBreakdown: Record<string, { label: string; count: number; revenueCents: number }> = {};
  for (const a of allAppts) {
    if (a.status === 'completed') {
      const rawClass = a.vehicle_class || 'Sedan/Coupe';
      let label = 'Sedan';
      if (rawClass.toLowerCase().includes('suv')) label = 'SUV';
      else if (rawClass.toLowerCase().includes('truck')) label = 'Truck';
      else if (rawClass.toLowerCase().includes('exotic')) label = 'Exotic';
      else if (rawClass.toLowerCase().includes('van')) label = 'Van';
      
      const price = a.base_price_cents ?? 0;
      if (!vehicleBreakdown[label]) {
        vehicleBreakdown[label] = { label, count: 0, revenueCents: 0 };
      }
      vehicleBreakdown[label].count += 1;
      vehicleBreakdown[label].revenueCents += price;
    }
  }
  const vehicleRevenueList = Object.values(vehicleBreakdown)
    .sort((a, b) => b.revenueCents - a.revenueCents);

  // Group monthly revenue last 6 months
  const monthsData: Array<{ label: string; year: number; month: number; value: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const label = d.toLocaleDateString('en-US', { month: 'short' });
    monthsData.push({ label, year: d.getFullYear(), month: d.getMonth(), value: 0 });
  }

  for (const monthBucket of monthsData) {
    const from = new Date(monthBucket.year, monthBucket.month, 1, 0, 0, 0, 0);
    const to = new Date(monthBucket.year, monthBucket.month + 1, 0, 23, 59, 59, 999);
    const summary = summarizePayments(
      sixMonthRows,
      includeTest
        ? { fromIso: from.toISOString(), toIso: to.toISOString() }
        : { excludeTest: true, apptById, fromIso: from.toISOString(), toIso: to.toISOString() },
    );
    monthBucket.value = summary.grossCents;
  }

  const { data: debugEvents } = await admin
    .from('payment_debug_events')
    .select('id, event_type, error_message, created_at, appointment_id')
    .order('created_at', { ascending: false })
    .limit(40);

  const paymentAlerts = (debugEvents ?? []).filter((e) => {
    const row = e as { event_type?: string | null; error_message?: string | null };
    const eventType = String(row.event_type ?? '').toLowerCase();
    const errorMessage = String(row.error_message ?? '').trim();
    if (errorMessage.length > 0) return true;
    return eventType.includes('error') || eventType.includes('failed') || eventType.includes('failure');
  }).slice(0, 8);

  const { data: upcoming } = await admin
    .from('appointments')
    .select('id, guest_name, scheduled_start, payment_status, balance_due_cents')
    .gte('scheduled_start', now)
    .neq('status', 'cancelled')
    .neq('status', 'completed')
    .order('scheduled_start', { ascending: true })
    .limit(6);

  const duplicateMap = new Map<string, AnyRow[]>();
  for (const p of sixMonthRows) {
    const key = paymentDuplicateKey(p);
    if (!key || key.includes('||')) continue;
    const list = duplicateMap.get(key) ?? [];
    list.push(p);
    duplicateMap.set(key, list);
  }
  const duplicateGroups = Array.from(duplicateMap.entries())
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({ key, rows }));

  return (
    <DashboardShell title='Revenue Command Center' subtitle='SaaS-quality transaction analytics and business profit ledger.' role='admin'>
      <section className='gb-premium-hero mb-8 rounded-3xl px-6 py-8'>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Owner MTD Revenue</p>
        <p className='mt-2 font-mono text-4xl font-black text-gold-soft sm:text-5xl'>{money(month.grossCents)}</p>
        <p className='mt-1 text-sm text-zinc-400'>Collected this month · {month.paymentCount} payments</p>
        <div className='mt-6 flex flex-wrap gap-2'>
          <Link href='/admin' className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-300'>
            ← Command center
          </Link>
          <Link href='/admin/receipts' className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black hover:bg-gold-soft transition'>
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

      {/* Interactive Charts Section */}
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

      {/* Advanced Breakdowns Section (Phase 2 Additions) */}
      <section className='mb-8 grid grid-cols-1 gap-6 md:grid-cols-3'>
        {/* Service Popularity & Revenue */}
        <div className='gb-premium-card rounded-3xl border border-white/10 bg-black/40 p-5 sm:p-6'>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft border-b border-white/10 pb-3 mb-4'>Revenue by Service</p>
          {popularServices.length === 0 ? (
            <p className='text-xs text-zinc-500 text-center py-12'>No services logged yet.</p>
          ) : (
            <div className='space-y-3.5'>
              {popularServices.map((svc) => (
                <div key={svc.label} className='flex items-center justify-between rounded-xl bg-zinc-950/20 px-3 py-2.5 border border-white/5'>
                  <div className='min-w-0 flex-1 pr-2'>
                    <p className='text-xs font-bold text-white truncate capitalize'>{svc.label}</p>
                    <p className='text-[9px] text-zinc-500 mt-0.5'>{svc.count} completed bookings</p>
                  </div>
                  <div className='text-right shrink-0'>
                    <p className='font-mono text-xs font-bold text-gold-soft'>{money(svc.revenueCents)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Technician Revenue */}
        <div className='gb-premium-card rounded-3xl border border-white/10 bg-black/40 p-5 sm:p-6'>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft border-b border-white/10 pb-3 mb-4'>Revenue by Technician</p>
          {techRevenueList.length === 0 ? (
            <p className='text-xs text-zinc-500 text-center py-12'>No technician assignments logged.</p>
          ) : (
            <div className='space-y-3.5'>
              {techRevenueList.map((t) => (
                <div key={t.name} className='flex items-center justify-between rounded-xl bg-zinc-950/20 px-3 py-2.5 border border-white/5'>
                  <div className='min-w-0 flex-1 pr-2'>
                    <p className='text-xs font-bold text-white truncate'>{t.name}</p>
                    <p className='text-[9px] text-zinc-500 mt-0.5'>{t.count} completed details</p>
                  </div>
                  <div className='text-right shrink-0'>
                    <p className='font-mono text-xs font-bold text-gold-soft'>{money(t.revenueCents)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Vehicle Type Revenue */}
        <div className='gb-premium-card rounded-3xl border border-white/10 bg-black/40 p-5 sm:p-6'>
          <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft border-b border-white/10 pb-3 mb-4'>Revenue by Vehicle Type</p>
          {vehicleRevenueList.length === 0 ? (
            <p className='text-xs text-zinc-500 text-center py-12'>No vehicle types categorized.</p>
          ) : (
            <div className='space-y-3.5'>
              {vehicleRevenueList.map((vh) => (
                <div key={vh.label} className='flex items-center justify-between rounded-xl bg-zinc-950/20 px-3 py-2.5 border border-white/5'>
                  <div className='min-w-0 flex-1 pr-2'>
                    <p className='text-xs font-bold text-white truncate'>{vh.label}</p>
                    <p className='text-[9px] text-zinc-500 mt-0.5'>{vh.count} completed bookings</p>
                  </div>
                  <div className='text-right shrink-0'>
                    <p className='font-mono text-xs font-bold text-gold-soft'>{money(vh.revenueCents)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className='space-y-3 mb-8'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Collected Cashflow</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatBlock label='Stripe (month)' value={money(month.stripeCents)} hint='Succeeded card payments' />
          <StatBlock label='Cash (month)' value={money(month.cashCents)} hint='Hand-collected cash' />
          <StatBlock label='Zelle/Venmo (month)' value={money(month.zelleCents)} hint='Electronic direct deposits' />
          <StatBlock label='Other (month)' value={money(month.otherCents)} hint='Comp/manual ledger rows' />
        </div>
        <div className='mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatBlock label='Today' value={money(today.grossCents)} hint={`${today.paymentCount} payment(s)`} href='/admin/payments?range=today' />
          <StatBlock label='This week' value={money(week.grossCents)} hint={`${week.paymentCount} payment(s)`} href='/admin/payments?range=week' />
          <StatBlock label='This month' value={money(month.grossCents)} hint={`${month.paymentCount} payment(s)`} href='/admin/payments?range=month' />
          <StatBlock label='Year to date' value={money(year.grossCents)} hint={`${year.paymentCount} payment(s)`} />
        </div>
      </section>

      {/* Live Stripe Account Balances */}
      <section className='mb-8 space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Live Stripe Account Balances</p>
        {isStripeConnected && (stripeBalances.available !== null || stripeBalances.pending !== null) ? (
          <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
            <StatBlock label='Available Stripe balance' value={stripeBalances.available == null ? 'Unavailable' : money(stripeBalances.available)} hint='Funds ready for instant bank payout' />
            <StatBlock label='Pending Stripe balance' value={stripeBalances.pending == null ? 'Unavailable' : money(stripeBalances.pending)} hint='Credit card funds clearing' />
            {stripeBalances.treasury != null ? <StatBlock label='Treasury balance' value={money(stripeBalances.treasury)} hint='Stripe financial storage account' /> : null}
          </div>
        ) : (
          <div className="gb-glass rounded-2xl border border-amber-500/20 bg-amber-500/5 p-5 text-xs text-amber-200">
            <p className="font-bold flex items-center gap-1.5 text-gold-soft">
              <AlertTriangle className="h-4.5 w-4.5 text-gold-soft" />
              No Stripe revenue data available yet.
            </p>
            <p className="mt-1 text-zinc-400">
              Stripe API connection is currently inactive or using incomplete credentials. Configure your live API secret key in Settings to sync clearing balances and treasury accounts.
            </p>
          </div>
        )}
      </section>

      <section className='mb-8 space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Financial Ledger Profitability</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatBlock label='Gross Collected' value={money(financial.grossRevenueCents)} hint='Canonical payment + receipt-backed MTD' />
          <StatBlock label='Expenses' value={money(financial.expensesCents)} hint='Expenses + operations + mileage fuel' />
          <StatBlock label='Fees' value={money(financial.stripeFeesCents)} hint='Card processing charges' />
          <StatBlock label='Refunds' value={money(financial.refundsCents)} hint='Reversed transaction totals' />
          <StatBlock label='Net Profit' value={money(financial.netProfitCents)} hint='Gross - refunds - fees - expenses' />
          <StatBlock label='Payouts to bank' value={money(financial.payoutsCents)} hint='Disbursed bank transfers' />
          <StatBlock label='Open balances' value={money(balanceDueCents)} href='/admin/work-orders' hint='Accounts receivable' />
          <StatBlock label='Pending deposits' value={money(financial.pendingDepositsCents)} href='/admin/work-orders' hint='Jobs awaiting deposit' />
          <StatBlock label='Paid invoices/deposits' value={money(financial.paidInvoicesDepositsCents)} href='/admin/payments' hint='Cleared invoice transactions' />
        </div>
        <p className='text-xs text-zinc-500'>
          ledger profitability is computed from local payment records and manual technician expenses. Payouts and fees are automatically tracked at time of transaction synchronization.
        </p>
      </section>

      <section className='mb-8 grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]'>
        <div className='rounded-3xl border border-gold/20 bg-black/45 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Revenue source breakdown</p>
          <p className='mt-1 text-xs text-zinc-500'>Canonical month-to-date sources from payments and receipt-backed records.</p>
          <div className='mt-4 space-y-2'>
            {sourceBreakdown.map((row) => (
              <div key={row.label} className='rounded-2xl border border-white/10 bg-zinc-950/70 px-4 py-3'>
                <div className='flex items-center justify-between gap-3'>
                  <p className='text-sm font-bold text-white'>{row.label}</p>
                  <p className='font-mono text-sm font-black text-gold-soft'>{money(row.cents)}</p>
                </div>
                <p className='mt-1 text-[11px] text-zinc-500'>{row.hint}</p>
              </div>
            ))}
          </div>
        </div>

        <div className='rounded-3xl border border-gold/20 bg-black/45 p-5'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Recent real ledger rows</p>
          <div className='mt-4 grid gap-4 md:grid-cols-2'>
            <div>
              <p className='text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300'>Payments</p>
              <div className='mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/10'>
                {financial.recentPayments.slice(0, 10).map((row) => (
                  <Link key={row.id} href={row.href ?? '/admin/payments'} className='block border-b border-white/5 px-3 py-2 last:border-0 hover:bg-white/5'>
                    <div className='flex justify-between gap-2 text-xs'>
                      <span className='truncate text-zinc-200'>{row.label}</span>
                      <span className='font-mono font-bold text-emerald-300'>{money(row.amountCents)}</span>
                    </div>
                    <p className='mt-0.5 text-[10px] text-zinc-500'>{row.method ?? row.source} · {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : 'No date'}</p>
                  </Link>
                ))}
                {financial.recentPayments.length === 0 ? <p className='px-3 py-8 text-center text-xs text-zinc-500'>No counted payment rows this month.</p> : null}
              </div>
            </div>
            <div>
              <p className='text-[10px] font-black uppercase tracking-[0.18em] text-amber-300'>Expenses</p>
              <div className='mt-2 max-h-72 overflow-y-auto rounded-2xl border border-white/10'>
                {financial.recentExpenses.slice(0, 10).map((row) => (
                  <div key={row.id} className='border-b border-white/5 px-3 py-2 last:border-0'>
                    <div className='flex justify-between gap-2 text-xs'>
                      <span className='truncate text-zinc-200'>{row.label}</span>
                      <span className='font-mono font-bold text-amber-300'>{money(row.amountCents)}</span>
                    </div>
                    <p className='mt-0.5 text-[10px] text-zinc-500'>{row.source} · {row.occurredAt ? new Date(row.occurredAt).toLocaleString() : 'No date'}</p>
                  </div>
                ))}
                {financial.recentExpenses.length === 0 ? <p className='px-3 py-8 text-center text-xs text-zinc-500'>No expense rows this month.</p> : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {paymentAlerts.length > 0 ? (
        <section className='mt-8 space-y-3'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-red-300'>Payment alerts</p>
          <ul className='space-y-2 text-sm'>
            {paymentAlerts.map((e) => {
              const row = e as { id: string; event_type: string; error_message: string | null; created_at: string; appointment_id: string | null };
              return (
                <li key={row.id} className='rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-100'>
                  <span className='font-mono text-[10px] uppercase'>{row.event_type}</span>
                  <p className='mt-1'>{row.error_message ?? 'Payment processing failure'}</p>
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

      <div className='mt-8'>
        <DuplicatePaymentsPanel initialGroups={duplicateGroups} />
      </div>

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
        <dl className='mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4'>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Ledger rows</dt>
            <dd className='font-mono font-bold text-white'>{financial.diagnostics.ledgerRowsLoaded}</dd>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Expense rows</dt>
            <dd className='font-mono font-bold text-white'>{financial.diagnostics.expenseRowsLoaded}</dd>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Business expenses</dt>
            <dd className='font-mono font-bold text-white'>{financial.diagnostics.businessExpenseRowsLoaded}</dd>
          </div>
          <div className='rounded-xl border border-white/10 px-3 py-2'>
            <dt className='text-zinc-500'>Mileage logs</dt>
            <dd className='font-mono font-bold text-white'>{financial.diagnostics.mileageRowsLoaded}</dd>
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
        {monthDiagnostics.duplicateGroups.length > 0 ? (
          <div className='mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4'>
            <p className='text-[10px] font-black uppercase tracking-[0.2em] text-amber-200'>Duplicate payment protection</p>
            <p className='mt-1 text-xs text-amber-100/80'>
              {monthDiagnostics.duplicateExtraCount} duplicate row{monthDiagnostics.duplicateExtraCount === 1 ? '' : 's'} are being ignored in revenue math so Stripe/manual double-entry does not inflate totals.
            </p>
            <ul className='mt-3 space-y-2 text-xs text-amber-50/90'>
              {monthDiagnostics.duplicateGroups.slice(0, 8).map((group) => (
                <li key={group.key} className='rounded-xl border border-amber-500/20 bg-black/30 px-3 py-2'>
                  <span className='font-mono'>{group.key}</span> · {money(group.amountCents)} · {group.ids.length} matching rows
                </li>
              ))}
            </ul>
            <Link href='/admin/system-diagnostics' className='mt-3 inline-block text-[10px] font-black uppercase text-gold-soft underline'>
              Open diagnostics
            </Link>
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
        <div className='mt-5 overflow-x-auto rounded-2xl border border-white/10'>
          <table className='min-w-[980px] w-full text-left text-xs'>
            <thead className='bg-white/[0.03] text-[10px] uppercase tracking-[0.16em] text-zinc-500'>
              <tr>
                <th className='px-3 py-2'>Source</th>
                <th className='px-3 py-2'>Amount</th>
                <th className='px-3 py-2'>Status</th>
                <th className='px-3 py-2'>Included?</th>
                <th className='px-3 py-2'>Reason</th>
                <th className='px-3 py-2'>Revenue key</th>
                <th className='px-3 py-2'>Stripe IDs</th>
              </tr>
            </thead>
            <tbody>
              {monthDiagnostics.auditRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className='px-3 py-6 text-center text-zinc-500'>No payment or receipt rows loaded for this period.</td>
                </tr>
              ) : (
                monthDiagnostics.auditRows.map((row) => (
                  <tr key={`${row.sourceTable}-${row.id}-${row.reason}`} className='border-t border-white/5'>
                    <td className='px-3 py-2'>
                      <p className='font-mono text-zinc-300'>{row.sourceTable}</p>
                      <p className='font-mono text-[10px] text-zinc-600'>{row.id.slice(0, 18)}</p>
                    </td>
                    <td className='px-3 py-2 font-mono font-bold text-white'>{money(row.amountCents)}</td>
                    <td className='px-3 py-2 text-zinc-400'>{row.method} / {row.status}</td>
                    <td className='px-3 py-2'>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.included ? 'bg-emerald-500/10 text-emerald-300' : 'bg-amber-500/10 text-amber-200'}`}>
                        {row.included ? 'Included' : 'Excluded'}
                      </span>
                    </td>
                    <td className='px-3 py-2 text-zinc-400'>{row.reason}</td>
                    <td className='px-3 py-2 font-mono text-[10px] text-zinc-500'>{row.revenueKey || 'manual/no key'}</td>
                    <td className='px-3 py-2 font-mono text-[10px] text-zinc-500'>
                      {row.stripePaymentIntentId || row.stripeCheckoutSessionId || 'none'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
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
