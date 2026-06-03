'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { RevenuePaymentDetail, RevenueSummary } from '@/lib/revenue-metrics';
import { displayMoney } from '@/lib/display-format';
import { AdminEmptyState } from '@/components/admin/admin-metric-drawer';

type GoalRow = {
  id: string;
  title: string;
  goalType: string;
  targetCents: number;
  currentCents: number;
  status: string;
};

type DrillKey =
  | 'today'
  | 'week'
  | 'month'
  | 'year'
  | 'stripe'
  | 'cash'
  | 'zelle'
  | 'venmo'
  | 'cash_app'
  | 'apple_pay'
  | 'check'
  | 'comp'
  | 'open'
  | null;

function StatCard({
  label,
  value,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className='gb-premium-card rounded-2xl border border-gold/15 bg-black/50 p-5 text-left shadow-md backdrop-blur-sm transition duration-300 hover:border-gold/45 hover:shadow-[0_0_20px_rgba(212,175,55,0.12)]'>
      <p className='text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400'>{label}</p>
      <p className='mt-3 font-mono text-2xl font-black tracking-tight text-gold-soft'>{value}</p>
      {hint ? <p className='mt-1 text-[10px] italic leading-tight text-zinc-500'>{hint}</p> : null}
      {onClick ? <p className='mt-2 text-[10px] uppercase text-gold-soft/80'>Tap to drill down →</p> : null}
    </div>
  );
  if (!onClick) return inner;
  return (
    <button type='button' onClick={onClick} className='block w-full text-left'>
      {inner}
    </button>
  );
}

function ZeroExplanation({ includeTest, hasPayments }: { includeTest: boolean; hasPayments: boolean }) {
  if (hasPayments) return null;
  return (
    <div className='rounded-2xl border border-dashed border-white/15 bg-black/40 px-5 py-4 text-xs leading-relaxed text-zinc-500'>
      <p className='font-bold text-zinc-400'>Why $0 may appear</p>
      <ul className='mt-2 list-disc space-y-1 pl-4'>
        <li>No succeeded payment rows in this period</li>
        {!includeTest ? <li>Test bookings are hidden — toggle “Include test payments” above</li> : null}
        <li>Voided payments are excluded from collected totals</li>
        <li>Stripe webhook delays can lag deposit rows by a few minutes</li>
        <li>Completed jobs without recorded payments won’t add to collected revenue</li>
      </ul>
    </div>
  );
}

function ChannelBar({ label, cents, total, onClick }: { label: string; cents: number; total: number; onClick?: () => void }) {
  const pct = total > 0 ? Math.round((cents / total) * 100) : 0;
  const row = (
    <div className='space-y-1.5'>
      <div className='flex justify-between text-xs'>
        <span className='font-bold text-zinc-300'>{label}</span>
        <span className='font-mono text-gold-soft'>
          {displayMoney(cents)} {total > 0 ? `· ${pct}%` : ''}
        </span>
      </div>
      <div className='h-2 overflow-hidden rounded-full bg-black/60'>
        <div className='h-full rounded-full bg-gradient-to-r from-gold/80 to-gold-soft' style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
  if (!onClick) return row;
  return (
    <button type='button' onClick={onClick} className='block w-full text-left'>
      {row}
    </button>
  );
}

export function RevenueDashboardClient({
  today,
  week,
  month,
  year,
  balanceDueCents,
  paymentDetails,
  goals,
  includeTest,
  avgTicketCents,
  completedJobsCount,
}: {
  today: RevenueSummary;
  week: RevenueSummary;
  month: RevenueSummary;
  year: RevenueSummary;
  balanceDueCents: number;
  paymentDetails: RevenuePaymentDetail[];
  goals: GoalRow[];
  includeTest: boolean;
  avgTicketCents?: number;
  completedJobsCount?: number;
}) {
  const [drill, setDrill] = useState<DrillKey>(null);

  const monthStart = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const dailyBars = useMemo(() => {
    const days: Array<{ label: string; cents: number }> = [];
    const now = new Date();
    const dayCount = now.getDate();
    for (let d = 1; d <= dayCount; d++) {
      const dt = new Date(now.getFullYear(), now.getMonth(), d);
      days.push({
        label: dt.toLocaleDateString('en-US', { weekday: 'narrow', day: 'numeric' }),
        cents: 0,
      });
    }
    for (const p of paymentDetails) {
      const paid = new Date(p.paidAt);
      if (paid < monthStart || paid > now) continue;
      const idx = paid.getDate() - 1;
      if (idx >= 0 && idx < days.length) days[idx]!.cents += p.amountCents;
    }
    return days;
  }, [paymentDetails, monthStart]);

  const maxDaily = Math.max(...dailyBars.map((d) => d.cents), 1);

  const channelRows = useMemo(
    () => [
      { key: 'stripe' as const, label: 'Stripe / card', cents: month.stripeCents + month.manualCardCents },
      { key: 'cash' as const, label: 'Cash', cents: month.cashCents },
      { key: 'zelle' as const, label: 'Zelle', cents: month.zelleCents },
      { key: 'venmo' as const, label: 'Venmo', cents: month.venmoCents },
      { key: 'cash_app' as const, label: 'Cash App', cents: month.cashAppCents },
      { key: 'apple_pay' as const, label: 'Apple Pay', cents: month.applePayCents },
      { key: 'check' as const, label: 'Check', cents: month.checkCents },
      { key: 'comp' as const, label: 'Comp / free', cents: month.compCents },
    ],
    [month],
  );

  const drillRows = useMemo(() => {
    if (!drill) return [];
    const now = new Date().toISOString();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfWeek = new Date();
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day + (day === 0 ? -6 : 1));
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const startOfYear = new Date(startOfMonth.getFullYear(), 0, 1);

    const inRange = (iso: string, from: Date) => iso >= from.toISOString() && iso <= now;
    const inMonth = (iso: string) => inRange(iso, startOfMonth);

    if (drill === 'today') return paymentDetails.filter((p) => inRange(p.paidAt, startOfToday));
    if (drill === 'week') return paymentDetails.filter((p) => inRange(p.paidAt, startOfWeek));
    if (drill === 'month') return paymentDetails.filter((p) => inRange(p.paidAt, startOfMonth));
    if (drill === 'year') return paymentDetails.filter((p) => inRange(p.paidAt, startOfYear));
    if (drill === 'stripe')
      return paymentDetails.filter((p) => (p.channel === 'stripe' || p.channel === 'manual_card') && inMonth(p.paidAt));
    if (drill === 'cash') return paymentDetails.filter((p) => p.channel === 'cash' && inMonth(p.paidAt));
    if (drill === 'zelle') return paymentDetails.filter((p) => p.channel === 'zelle' && inMonth(p.paidAt));
    if (drill === 'venmo') return paymentDetails.filter((p) => p.channel === 'venmo' && inMonth(p.paidAt));
    if (drill === 'cash_app') return paymentDetails.filter((p) => p.channel === 'cash_app' && inMonth(p.paidAt));
    if (drill === 'apple_pay') return paymentDetails.filter((p) => p.channel === 'apple_pay' && inMonth(p.paidAt));
    if (drill === 'check') return paymentDetails.filter((p) => p.channel === 'check' && inMonth(p.paidAt));
    if (drill === 'comp') return paymentDetails.filter((p) => p.channel === 'comp' && inMonth(p.paidAt));
    return [];
  }, [drill, paymentDetails]);

  const drillTitle =
    drill === 'today'
      ? 'Today collected'
      : drill === 'week'
        ? 'This week collected'
        : drill === 'month'
          ? 'This month collected'
          : drill === 'year'
            ? 'Year to date'
            : drill === 'stripe'
              ? 'Stripe / card (month)'
              : drill === 'cash'
                ? 'Cash (month)'
                : drill === 'zelle'
                  ? 'Zelle (month)'
                  : drill === 'venmo'
                    ? 'Venmo (month)'
                    : drill === 'cash_app'
                      ? 'Cash App (month)'
                      : drill === 'apple_pay'
                        ? 'Apple Pay (month)'
                        : drill === 'check'
                          ? 'Check (month)'
                          : drill === 'comp'
                            ? 'Comp / free (month)'
                            : '';

  const hasAnyPayments = month.paymentCount > 0;

  return (
    <>
      <section className='mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <StatCard label='Month collected' value={displayMoney(month.grossCents)} hint={`${month.paymentCount} payments`} onClick={() => setDrill('month')} />
        <StatCard label='Open balances' value={displayMoney(balanceDueCents)} hint='Balance due on live jobs' onClick={() => setDrill('open')} />
        <StatCard
          label='Avg completed ticket'
          value={displayMoney(avgTicketCents ?? 0)}
          hint={completedJobsCount != null ? `${completedJobsCount} jobs this month` : 'Completed job average'}
        />
        <StatCard
          label='Completed jobs'
          value={String(completedJobsCount ?? 0)}
          hint='Marked complete this month'
        />
      </section>

      <ZeroExplanation includeTest={includeTest} hasPayments={hasAnyPayments} />

      <section className='mt-8 space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Daily revenue · this month</p>
        {dailyBars.every((d) => d.cents === 0) ? (
          <AdminEmptyState title='No daily payments yet' detail='Each bar shows succeeded payments by calendar day. Data appears after deposits and balance payments post.' />
        ) : (
          <div className='rounded-2xl border border-gold/15 bg-black/40 p-4'>
            <div className='flex h-36 items-end gap-1 sm:gap-2'>
              {dailyBars.map((d) => (
                <div key={d.label} className='flex min-w-0 flex-1 flex-col items-center gap-1'>
                  <div
                    className='w-full max-w-[2rem] rounded-t bg-gradient-to-t from-gold/30 to-gold-soft transition-all'
                    style={{ height: `${Math.max(4, (d.cents / maxDaily) * 100)}%` }}
                    title={`${d.label}: ${displayMoney(d.cents)}`}
                  />
                  <span className='truncate text-[8px] text-zinc-500'>{d.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className='mt-8 space-y-3'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Collected</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <StatCard label='Today' value={displayMoney(today.grossCents)} hint={`${today.paymentCount} payment(s)`} onClick={() => setDrill('today')} />
          <StatCard label='This week' value={displayMoney(week.grossCents)} hint={`${week.paymentCount} payment(s)`} onClick={() => setDrill('week')} />
          <StatCard label='This month' value={displayMoney(month.grossCents)} hint={`${month.paymentCount} payment(s)`} onClick={() => setDrill('month')} />
          <StatCard label='Year to date' value={displayMoney(year.grossCents)} hint={`${year.paymentCount} payment(s)`} onClick={() => setDrill('year')} />
        </div>
      </section>

      <section className='mt-8 space-y-4'>
        <div className='flex flex-wrap items-end justify-between gap-2'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Channel breakdown · month</p>
          <Link href='/admin/goals' className='text-[10px] font-black uppercase text-gold-soft underline'>
            Manage goals →
          </Link>
        </div>
        <div className='gb-premium-card space-y-4 rounded-2xl border border-gold/15 p-5'>
          {channelRows.map((c) => (
            <ChannelBar
              key={c.key}
              label={c.label}
              cents={c.cents}
              total={month.grossCents}
              onClick={() => setDrill(c.key)}
            />
          ))}
        </div>
      </section>

      {goals.length > 0 ? (
        <section className='mt-8 space-y-3'>
          <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Goals progress</p>
          <div className='grid gap-3 sm:grid-cols-2'>
            {goals.map((g) => {
              const pct = g.targetCents > 0 ? Math.min(100, Math.round((g.currentCents / g.targetCents) * 100)) : 0;
              return (
                <Link
                  key={g.id}
                  href='/admin/goals'
                  className='block rounded-2xl border border-violet-500/30 bg-violet-950/20 p-4 transition hover:border-gold/40'
                >
                  <p className='text-sm font-bold text-white'>{g.title}</p>
                  <p className='mt-1 text-xs text-zinc-400'>
                    {displayMoney(g.currentCents)} / {displayMoney(g.targetCents)} · {pct}%
                  </p>
                  <div className='mt-3 h-2 overflow-hidden rounded-full bg-black/60'>
                    <div className='h-full rounded-full bg-gradient-to-r from-violet-500 to-gold-soft' style={{ width: `${pct}%` }} />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <section className='mt-8'>
          <AdminEmptyState title='No active goals' detail='Create revenue or job targets under Admin → Goals to track progress against this dashboard.' />
        </section>
      )}

      {drill ? (
        <div className='fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center' role='dialog'>
          <div className='max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-3xl border border-gold/30 bg-zinc-950 shadow-2xl'>
            <div className='flex items-center justify-between border-b border-white/10 px-5 py-4'>
              <h2 className='text-lg font-black text-white'>{drillTitle}</h2>
              <button type='button' onClick={() => setDrill(null)} className='rounded-lg border border-white/15 px-3 py-1 text-xs font-bold uppercase text-zinc-300'>
                Close
              </button>
            </div>
            <div className='max-h-[60vh] overflow-y-auto p-5'>
              {drill === 'open' ? (
                <div className='space-y-3'>
                  <p className='text-sm text-zinc-300'>
                    Open balances total <strong className='text-gold-soft'>{displayMoney(balanceDueCents)}</strong> across appointments with balance due.
                  </p>
                  <Link href='/admin/work-orders' className='inline-block text-xs font-black uppercase text-gold-soft underline'>
                    Open work orders →
                  </Link>
                </div>
              ) : drillRows.length === 0 ? (
                <AdminEmptyState
                  title='No payments in this view'
                  detail={`No valid payment rows${includeTest ? '' : ' (test hidden)'}. Voided rows are excluded.`}
                />
              ) : (
                <ul className='space-y-2'>
                  {drillRows.map((p) => (
                    <li key={p.id} className='rounded-xl border border-white/10 px-4 py-3 text-sm'>
                      <div className='flex flex-wrap justify-between gap-2'>
                        <span className='font-semibold text-white'>{p.customerName}</span>
                        <span className='font-mono text-gold-soft'>{displayMoney(p.amountCents)}</span>
                      </div>
                      <p className='mt-1 text-xs text-zinc-500'>
                        {new Date(p.paidAt).toLocaleString()} · {p.method.replace(/_/g, ' ')} · {p.status}
                      </p>
                      {p.appointmentId ? (
                        <div className='mt-2 flex flex-wrap gap-2'>
                          <Link href={`/admin/work-orders/${p.appointmentId}?shell=admin`} className='text-xs text-gold-soft underline'>
                            Work order
                          </Link>
                          <Link href={`/admin/receipts/${p.appointmentId}`} className='text-xs text-zinc-400 underline'>
                            Receipt
                          </Link>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
