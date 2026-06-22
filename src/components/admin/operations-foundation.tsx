'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Calendar,
  ChevronRight,
  CloudRain,
  CreditCard,
  FileWarning,
  MessageSquare,
  ShieldAlert,
  Users,
  Wrench,
} from 'lucide-react';
import type {
  DailyOperationsBoard,
  ExceptionCategory,
  ExceptionSummary,
  OperationException,
  OperationsSnapshot,
} from '@/lib/operations-snapshot';
import { formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';

const CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  payments: 'Payments',
  work_orders: 'Work Orders',
  agreements: 'Agreements',
  notifications: 'Notifications',
  weather: 'Weather',
  photos: 'Photos / QA',
  customers: 'Customers',
  leads: 'Leads',
  system: 'System',
};

function severityBorder(severity: OperationException['severity']) {
  if (severity === 'critical') return 'border-red-500/30 bg-red-500/5';
  if (severity === 'warning') return 'border-gold/25 bg-black/50';
  return 'border-white/10 bg-black/45';
}

function severityBadge(severity: OperationException['severity']) {
  if (severity === 'critical') return 'bg-red-500/15 text-red-200';
  if (severity === 'warning') return 'bg-gold/10 text-gold-soft';
  return 'bg-zinc-800 text-zinc-400';
}

function categoryIcon(category: ExceptionCategory) {
  switch (category) {
    case 'payments':
      return CreditCard;
    case 'notifications':
      return Bell;
    case 'agreements':
      return FileWarning;
    case 'weather':
      return CloudRain;
    case 'photos':
      return ShieldAlert;
    case 'customers':
    case 'leads':
      return Users;
    case 'work_orders':
      return Wrench;
    default:
      return AlertTriangle;
  }
}

function SummaryBar({ summary }: { summary: ExceptionSummary }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
        <p className="text-[10px] font-black uppercase text-red-200">Critical</p>
        <p className="mt-1 font-mono text-3xl font-black text-white">{summary.critical}</p>
      </div>
      <div className="rounded-2xl border border-gold/25 bg-black/50 p-4">
        <p className="text-[10px] font-black uppercase text-gold-soft">Warnings</p>
        <p className="mt-1 font-mono text-3xl font-black text-white">{summary.warning}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
        <p className="text-[10px] font-black uppercase text-zinc-400">Informational</p>
        <p className="mt-1 font-mono text-3xl font-black text-white">{summary.info}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
        <p className="text-[10px] font-black uppercase text-zinc-400">Jobs needing action</p>
        <p className="mt-1 font-mono text-3xl font-black text-white">{summary.jobsRequiringAction}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
        <p className="text-[10px] font-black uppercase text-zinc-400">Money at risk</p>
        <p className="mt-1 font-mono text-2xl font-black text-white">{displayMoney(summary.moneyRequiringActionCents)}</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
        <p className="text-[10px] font-black uppercase text-zinc-400">Comms issues</p>
        <p className="mt-1 font-mono text-3xl font-black text-white">{summary.communicationIssues}</p>
      </div>
    </section>
  );
}

function ExceptionRow({ item, compact }: { item: OperationException; compact?: boolean }) {
  const Icon = categoryIcon(item.category);
  return (
    <div className={`rounded-2xl border p-4 ${severityBorder(item.severity)}`}>
      <div className="flex items-start gap-3">
        <span className={`rounded-xl p-2 ${severityBadge(item.severity)}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${severityBadge(item.severity)}`}>
              {item.severity}
            </span>
            <span className="text-[9px] font-black uppercase text-zinc-500">{CATEGORY_LABELS[item.category]}</span>
          </div>
          <p className="mt-1 text-sm font-black uppercase text-white">{item.title}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{item.detail}</p>
          {!compact && item.suggestedNext ? (
            <p className="mt-2 text-[11px] text-zinc-500">Next: {item.suggestedNext}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
            {item.customerName ? <span>Customer: {item.customerName}</span> : null}
            {item.occurredAt ? <span className="font-mono">{formatChicagoDateTime(item.occurredAt)}</span> : null}
            {item.channel ? <span>{item.channel}{item.recipient ? ` → ${item.recipient}` : ''}</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Link
            href={item.href}
            className="inline-flex items-center gap-1 rounded-lg border border-gold/30 bg-black/60 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:border-gold/50"
          >
            {item.actionLabel}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          {item.secondaryHref && item.secondaryActionLabel ? (
            <Link
              href={item.secondaryHref}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
            >
              {item.secondaryActionLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DailyOpsSection({ dailyOps, expanded }: { dailyOps: DailyOperationsBoard; expanded?: boolean }) {
  const today = dailyOps.today;
  const tomorrow = dailyOps.tomorrow;
  const week = dailyOps.week;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Daily Operations Board</h2>
          <p className="mt-1 text-xs text-zinc-500">Refreshed {formatChicagoDateTime(dailyOps.refreshedAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/daily-operations" className="rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:border-gold/50">
            Full board
          </Link>
          <Link href="/admin/exceptions" className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white">
            All exceptions
          </Link>
          <Link href="/admin/calendar" className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white">
            Calendar
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gold/20 bg-black/55 p-5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gold-soft">
            <Calendar className="h-4 w-4" />
            Today
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-zinc-500">Jobs</p><p className="font-mono text-lg font-black text-white">{today.jobCount}</p></div>
            <div><p className="text-zinc-500">Collected</p><p className="font-mono text-lg font-black text-emerald-400">{displayMoney(today.collectedCents)}</p></div>
            <div><p className="text-zinc-500">Projected</p><p className="font-mono text-lg font-black text-white">{displayMoney(today.projectedRevenueCents)}</p></div>
            <div><p className="text-zinc-500">Unpaid done</p><p className="font-mono text-lg font-black text-red-300">{today.unpaidCompletedCount}</p></div>
            <div><p className="text-zinc-500">Missing tech</p><p className="font-mono text-lg font-black text-white">{today.missingTech}</p></div>
            <div><p className="text-zinc-500">Missing address</p><p className="font-mono text-lg font-black text-white">{today.missingAddress}</p></div>
            <div><p className="text-zinc-500">Missing agreement</p><p className="font-mono text-lg font-black text-white">{today.missingAgreement}</p></div>
            <div><p className="text-zinc-500">Missing photos</p><p className="font-mono text-lg font-black text-white">{today.missingBeforePhotos + today.missingAfterPhotos}</p></div>
          </div>
          {today.weatherRisk ? (
            <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              {today.weatherNote ?? 'Weather risk flagged for today.'}
            </p>
          ) : null}
          {expanded && today.jobs.length > 0 ? (
            <div className="mt-4 space-y-2 border-t border-white/5 pt-4">
              {today.jobs.slice(0, 8).map((job) => (
                <Link key={job.id} href={job.href} className="flex items-center justify-between rounded-lg border border-white/5 px-3 py-2 text-xs hover:border-gold/30">
                  <span className="truncate text-white">{job.time} · {job.guestName}</span>
                  <ChevronRight className="h-3 w-3 shrink-0 text-zinc-500" />
                </Link>
              ))}
            </div>
          ) : null}
          <Link href="/admin/dispatch" className="mt-4 inline-flex text-[10px] font-black uppercase text-gold hover:underline">
            Open dispatch →
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/50 p-5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-300">
            <Calendar className="h-4 w-4" />
            Tomorrow
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-zinc-500">Jobs</p><p className="font-mono text-lg font-black text-white">{tomorrow.jobCount}</p></div>
            <div><p className="text-zinc-500">Unassigned</p><p className="font-mono text-lg font-black text-white">{tomorrow.unassigned}</p></div>
          </div>
          {tomorrow.weatherRisk ? (
            <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
              {tomorrow.weatherNote ?? 'Weather risk flagged for tomorrow.'}
            </p>
          ) : null}
          {tomorrow.prepChecklist.length > 0 ? (
            <ul className="mt-3 space-y-1 text-[11px] text-zinc-400">
              {tomorrow.prepChecklist.map((line) => (
                <li key={line}>• {line}</li>
              ))}
            </ul>
          ) : null}
          <Link href="/admin/calendar" className="mt-4 inline-flex text-[10px] font-black uppercase text-gold hover:underline">
            Plan tomorrow →
          </Link>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/50 p-5">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-zinc-300">
            <Calendar className="h-4 w-4" />
            This week
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-zinc-500">Scheduled</p><p className="font-mono text-lg font-black text-white">{week.scheduledJobs}</p></div>
            <div><p className="text-zinc-500">Completed</p><p className="font-mono text-lg font-black text-emerald-400">{week.completedJobs}</p></div>
            <div><p className="text-zinc-500">Expected revenue</p><p className="font-mono text-lg font-black text-white">{displayMoney(week.expectedRevenueCents)}</p></div>
            <div><p className="text-zinc-500">Open receivables</p><p className="font-mono text-lg font-black text-red-300">{displayMoney(week.openReceivablesCents)}</p></div>
            <div className="col-span-2"><p className="text-zinc-500">Follow-ups due</p><p className="font-mono text-lg font-black text-gold-soft">{week.followUpsDue}</p></div>
          </div>
          <Link href="/admin/revenue" className="mt-4 inline-flex text-[10px] font-black uppercase text-gold hover:underline">
            Revenue center →
          </Link>
        </div>
      </div>
    </section>
  );
}

function CategoryCounts({ summary }: { summary: ExceptionSummary }) {
  const entries = (Object.entries(summary.byCategory) as [ExceptionCategory, number][]).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center">
        <p className="text-sm font-black uppercase text-emerald-300">No open exceptions by category</p>
        <p className="mt-1 text-xs text-zinc-500">Payments, comms, agreements, and field ops look clean.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([cat, count]) => (
        <Link
          key={cat}
          href={`/admin/exceptions?category=${cat}`}
          className="flex items-center justify-between rounded-xl border border-white/10 bg-black/45 px-4 py-3 hover:border-gold/30"
        >
          <span className="text-xs font-black uppercase text-zinc-300">{CATEGORY_LABELS[cat]}</span>
          <span className="font-mono text-lg font-black text-white">{count}</span>
        </Link>
      ))}
    </div>
  );
}

export function OperationsFoundation({
  snapshot,
  mode = 'dashboard',
}: {
  snapshot: OperationsSnapshot;
  mode?: 'dashboard' | 'full' | 'daily-ops';
}) {
  const criticalAndWarnings = useMemo(
    () =>
      snapshot.exceptions.filter((e) => e.severity === 'critical' || e.severity === 'warning'),
    [snapshot.exceptions],
  );

  const followUps = useMemo(
    () => snapshot.exceptions.filter((e) => e.category === 'customers' || e.category === 'leads'),
    [snapshot.exceptions],
  );

  const showLimit = mode === 'dashboard' ? 8 : 50;

  return (
    <div className="space-y-8">
      <SummaryBar summary={snapshot.summary} />

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Critical actions</h2>
            <p className="mt-1 text-xs text-zinc-500">Issues that need owner attention now — not placeholders.</p>
          </div>
          {mode === 'dashboard' ? (
            <Link href="/admin/exceptions" className="text-[10px] font-black uppercase text-gold hover:underline">
              View all {snapshot.summary.total} →
            </Link>
          ) : null}
        </div>

        {criticalAndWarnings.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/5 p-8 text-center">
            <p className="font-black uppercase text-emerald-300">No critical or warning exceptions</p>
            <p className="mt-2 text-sm text-zinc-400">Stripe, payments, notifications, and field readiness are clear.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {criticalAndWarnings.slice(0, showLimit).map((item) => (
              <ExceptionRow key={item.id} item={item} compact={mode === 'dashboard'} />
            ))}
          </div>
        )}
      </section>

      {(mode === 'dashboard' || mode === 'full' || mode === 'daily-ops') && (
        <DailyOpsSection dailyOps={snapshot.dailyOps} expanded={mode !== 'dashboard'} />
      )}

      {mode !== 'daily-ops' && (
        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Exceptions by category</h2>
          <CategoryCounts summary={snapshot.summary} />
        </section>
      )}

      {followUps.length > 0 && mode !== 'daily-ops' ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-gold-soft" />
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Follow-ups due</h2>
          </div>
          <div className="space-y-3">
            {followUps.slice(0, mode === 'dashboard' ? 5 : 20).map((item) => (
              <ExceptionRow key={item.id} item={item} compact={mode === 'dashboard'} />
            ))}
          </div>
        </section>
      ) : null}

      {mode === 'full' ? (
        <section className="space-y-3">
          <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">All exceptions</h2>
          <div className="space-y-3">
            {snapshot.exceptions.map((item) => (
              <ExceptionRow key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
