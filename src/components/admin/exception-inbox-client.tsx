'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import { ExceptionActionButtons } from '@/components/admin/exception-action-buttons';
import { syncExceptionsNowAction } from '@/app/(dashboard)/admin/exceptions/exception-actions';
import type { ExceptionCategory, ExceptionSeverity, OperationsSnapshot } from '@/lib/operations-snapshot';
import { formatTimelineLine } from '@/lib/business-exception-inbox';
import { formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';

const CATEGORIES: { id: ExceptionCategory | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'payments', label: 'Payments' },
  { id: 'work_orders', label: 'Work Orders' },
  { id: 'agreements', label: 'Agreements' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'weather', label: 'Weather' },
  { id: 'photos', label: 'Photos / QA' },
  { id: 'customers', label: 'Customers' },
  { id: 'leads', label: 'Leads' },
  { id: 'system', label: 'System' },
];

const SEVERITIES: { id: ExceptionSeverity | 'all'; label: string }[] = [
  { id: 'all', label: 'All severities' },
  { id: 'critical', label: 'Critical' },
  { id: 'warning', label: 'Warning' },
  { id: 'info', label: 'Info' },
];

function severityClass(severity: ExceptionSeverity) {
  if (severity === 'critical') return 'border-red-500/30 bg-red-500/5';
  if (severity === 'warning') return 'border-gold/25 bg-black/50';
  return 'border-white/10 bg-black/45';
}

export function ExceptionInboxClient({
  snapshot,
  initialCategory,
  showDismissed,
}: {
  snapshot: OperationsSnapshot;
  initialCategory?: string | null;
  showDismissed?: boolean;
}) {
  const router = useRouter();
  const validCategory = CATEGORIES.some((c) => c.id === initialCategory) ? (initialCategory as ExceptionCategory | 'all') : 'all';
  const [category, setCategory] = useState<ExceptionCategory | 'all'>(validCategory === 'all' ? 'all' : validCategory);
  const [severity, setSeverity] = useState<ExceptionSeverity | 'all'>('all');
  const [query, setQuery] = useState('');
  const [includeDismissed, setIncludeDismissed] = useState(Boolean(showDismissed));
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncErr, setSyncErr] = useState<string | null>(null);
  const [syncPending, startSync] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.exceptions.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (severity !== 'all' && item.severity !== severity) return false;
      if (!q) return true;
      const hay = [
        item.title,
        item.detail,
        item.customerName,
        item.eventType,
        item.channel,
        item.recipient,
        item.suggestedNext,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [snapshot.exceptions, category, severity, query]);

  const toggleDismissed = () => {
    const next = !includeDismissed;
    setIncludeDismissed(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('dismissed', '1');
    else url.searchParams.delete('dismissed');
    router.push(url.pathname + url.search);
  };

  const syncNow = () => {
    setSyncMsg(null);
    setSyncErr(null);
    startSync(async () => {
      const res = await syncExceptionsNowAction();
      if (res.error) setSyncErr(res.error);
      else {
        setSyncMsg(`Synced ${res.scanCount ?? 0} scan items.`);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-[10px] font-black uppercase text-red-200">Critical</p>
          <p className="mt-1 font-mono text-3xl font-black text-white">{snapshot.summary.critical}</p>
        </div>
        <div className="rounded-2xl border border-gold/25 bg-black/50 p-4">
          <p className="text-[10px] font-black uppercase text-gold-soft">Warnings</p>
          <p className="mt-1 font-mono text-3xl font-black text-white">{snapshot.summary.warning}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-[10px] font-black uppercase text-zinc-400">Info</p>
          <p className="mt-1 font-mono text-3xl font-black text-white">{snapshot.summary.info}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-[10px] font-black uppercase text-zinc-400">Jobs</p>
          <p className="mt-1 font-mono text-3xl font-black text-white">{snapshot.summary.jobsRequiringAction}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-[10px] font-black uppercase text-zinc-400">Money</p>
          <p className="mt-1 font-mono text-xl font-black text-white">{displayMoney(snapshot.summary.moneyRequiringActionCents)}</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4">
          <p className="text-[10px] font-black uppercase text-zinc-400">Comms</p>
          <p className="mt-1 font-mono text-3xl font-black text-white">{snapshot.summary.communicationIssues}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-500">
        <div className="space-y-1">
          <p>Live scan {formatChicagoDateTime(snapshot.refreshedAt)} · {snapshot.scanCount} items</p>
          {snapshot.lastSyncAt ? (
            <p>Last background sync {formatChicagoDateTime(snapshot.lastSyncAt)}</p>
          ) : (
            <p>No background sync recorded yet</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={syncPending}
            onClick={syncNow}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:border-gold/50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncPending ? 'animate-spin' : ''}`} />
            Sync now
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 text-[10px] font-black uppercase text-zinc-400">
            <input
              type="checkbox"
              checked={includeDismissed}
              onChange={toggleDismissed}
              className="rounded border-white/20 bg-black/60"
            />
            Show snoozed
          </label>
          <Link href="/admin/daily-operations" className="font-black uppercase text-gold hover:underline">
            Daily operations board →
          </Link>
          <Link href="/admin?overview=1" className="font-black uppercase text-zinc-400 hover:text-white">
            Full dashboard
          </Link>
        </div>
      </div>
      {syncMsg ? <p className="text-xs text-emerald-400">{syncMsg}</p> : null}
      {syncErr ? <p className="text-xs text-red-300">{syncErr}</p> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, customer, error…"
            className="w-full rounded-xl border border-white/10 bg-black/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-zinc-600"
          />
        </div>
        <select
          value={severity}
          onChange={(e) => setSeverity(e.target.value as ExceptionSeverity | 'all')}
          className="rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-sm text-white"
        >
          {SEVERITIES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((tab) => {
          const count = tab.id === 'all' ? snapshot.summary.total : snapshot.summary.byCategory[tab.id];
          const active = category === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setCategory(tab.id)}
              className={`rounded-full border px-3 py-1.5 text-[10px] font-black uppercase transition ${
                active ? 'border-gold/40 bg-gold/10 text-gold-soft' : 'border-white/10 text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

      <section className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-gold/25 bg-black/50 p-10 text-center">
            <p className="font-black uppercase text-white">No exceptions match your filters</p>
            <p className="mt-2 text-sm text-zinc-400">Try clearing search or switching category tabs.</p>
          </div>
        ) : (
          filtered.map((item) => {
            const timelineLines = formatTimelineLine(item.timeline);
            const isDismissed = item.timeline.status === 'dismissed';
            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 ${severityClass(item.severity)} ${isDismissed ? 'opacity-70' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase">
                      <span className="text-zinc-500">{item.category.replace(/_/g, ' ')}</span>
                      <span className={item.severity === 'critical' ? 'text-red-300' : item.severity === 'warning' ? 'text-gold-soft' : 'text-zinc-400'}>
                        {item.severity}
                      </span>
                      {isDismissed ? <span className="text-zinc-500">Snoozed</span> : null}
                    </div>
                    <p className="mt-1 text-sm font-black uppercase text-white">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-zinc-400">{item.detail}</p>
                    {item.suggestedNext ? <p className="mt-2 text-[11px] text-zinc-500">Suggested: {item.suggestedNext}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-x-3 text-[10px] text-zinc-500">
                      {item.customerName ? <span>{item.customerName}</span> : null}
                      {item.occurredAt ? <span className="font-mono">{formatChicagoDateTime(item.occurredAt)}</span> : null}
                    </div>
                    {timelineLines.length > 0 ? (
                      <ul className="mt-2 space-y-0.5 text-[10px] text-zinc-600">
                        {timelineLines.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <ExceptionActionButtons item={item} />
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
