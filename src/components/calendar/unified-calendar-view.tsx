'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  ArrowUpRight,
  RefreshCw,
  Cloud,
  Ban,
  Briefcase,
} from 'lucide-react';
import { addCalendarEventAction } from '@/lib/admin/calendar-events-actions';
import { createCalendarBlockAction, deleteCalendarBlockAction } from '@/lib/admin/calendar-block-actions';
import type { CalendarFeedItem, CalendarFeedResponse } from '@/lib/calendar/calendar-types';
import type { WeatherSnapshot } from '@/lib/weather-forecast';
import { CalendarDayWeatherDetail } from '@/components/calendar/calendar-day-weather-detail';
import { dateKeyChicago } from '@/lib/chicago-time';
import { monthFeedBounds } from '@/lib/calendar/calendar-utils';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { googleSyncStripMessage, resolveGoogleCalendarConnectionStatus } from '@/lib/google/google-calendar-status';

const TZ = 'America/Chicago';

function itemChipClass(item: CalendarFeedItem) {
  if (item.kind === 'appointment' || item.kind === 'fallback') {
    return 'gb-calendar-chip-job bg-muted text-foreground border-border';
  }
  if (item.kind === 'block') {
    if (item.source === 'google_calendar') return 'bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-500/20';
    return 'bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-500/20';
  }
  return 'bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-500/20';
}

function fmtSync(iso?: string | null) {
  if (!iso) return 'Never';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function syncStatusFromFeed(
  googleSync: CalendarFeedResponse['googleSync'],
  googleAutoPull: CalendarFeedResponse['googleAutoPull'],
  checking: boolean,
): string {
  return googleSyncStripMessage({
    connectionStatus: googleSync?.connectionStatus ?? resolveGoogleCalendarConnectionStatus({
      configured: true,
      hasConnectionRow: Boolean(googleSync?.connected),
      lastError: googleAutoPull?.error ?? googleSync?.lastError,
    }),
    connected: Boolean(googleSync?.connected),
    checking,
    lastPullAt: googleAutoPull?.lastPullAt ?? googleSync?.lastPullAt,
    lastError: googleAutoPull?.error ?? googleSync?.lastError,
    accountEmail: googleSync?.accountEmail,
    justPulled: Boolean(googleAutoPull?.ran && !googleAutoPull.error && !googleAutoPull.skipped),
  });
}

export function UnifiedCalendarView({
  variant = 'full',
  role = 'admin',
}: {
  variant?: 'full' | 'compact';
  role?: 'admin' | 'tech';
}) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [items, setItems] = useState<CalendarFeedItem[]>([]);
  const [googleSync, setGoogleSync] = useState<CalendarFeedResponse['googleSync']>();
  const [googleAutoPull, setGoogleAutoPull] = useState<CalendarFeedResponse['googleAutoPull']>();
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const [selectedDayWeather, setSelectedDayWeather] = useState<WeatherSnapshot | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  const [noteResult, setNoteResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [blockResult, setBlockResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const { from, to } = monthFeedBounds(year, month);

  const monthName = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: TZ,
  }).format(currentDate);

  const todayKey = dateKeyChicago(new Date());
  const isCompact = variant === 'compact';
  const isAdmin = role === 'admin';

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    setFeedError(null);
    try {
      const res = await fetchWithTimeout(`/api/calendar/feed?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&role=${role}`, {
        credentials: 'same-origin',
        timeoutMs: 90000,
      });
      const data = (await res.json()) as CalendarFeedResponse & { error?: string; ok?: boolean };
      if (!res.ok || !data.ok) {
        setFeedError(data.error ?? 'Could not load calendar');
        setItems([]);
        return;
      }
      setItems(data.items);
      setGoogleSync(data.googleSync);
      setGoogleAutoPull(data.googleAutoPull);
    } catch {
      setFeedError('Network error loading calendar');
      setItems([]);
    } finally {
      setLoadingFeed(false);
    }
  }, [from, to, role]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (!selectedDay) {
      setSelectedDayWeather(null);
      return;
    }
    setLoadingWeather(true);
    const ctrl = new AbortController();
    fetch(`/api/weather?when=${selectedDay}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((data: WeatherSnapshot) => setSelectedDayWeather(data))
      .catch(() => setSelectedDayWeather(null))
      .finally(() => setLoadingWeather(false));
    return () => ctrl.abort();
  }, [selectedDay]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarFeedItem[]>();
    for (const item of items) {
      const bucket = map.get(item.dayKey) ?? [];
      bucket.push(item);
      map.set(item.dayKey, bucket);
    }
    return map;
  }, [items]);

  const firstDay = new Date(year, month, 1);
  const blanks = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = useMemo(() => {
    const list: Array<
      | { type: 'blank'; key: string }
      | { type: 'day'; key: string; day: number; items: CalendarFeedItem[] }
    > = [];
    for (let i = 0; i < blanks; i++) list.push({ type: 'blank', key: `blank-${i}` });
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const key = dateKeyChicago(date);
      list.push({ type: 'day', key, day: i, items: itemsByDay.get(key) ?? [] });
    }
    return list;
  }, [year, month, blanks, daysInMonth, itemsByDay]);

  const selectedItems = selectedDay ? itemsByDay.get(selectedDay) ?? [] : [];
  const selectedJobs = selectedItems.filter((i) => i.kind === 'appointment' || i.kind === 'fallback');
  const selectedBlocks = selectedItems.filter((i) => i.kind === 'block');
  const selectedNotes = selectedItems.filter((i) => i.kind === 'note');

  const selectedLabel = selectedDay
    ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', {
        timeZone: TZ,
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : '';

  const lastSynced = googleAutoPull?.lastPullAt ?? googleSync?.lastPullAt ?? googleSync?.lastSyncAt ?? googleSync?.lastPushAt;
  const syncStatusLabel = syncStatusFromFeed(googleSync, googleAutoPull, loadingFeed && isAdmin);

  const runGooglePull = () => {
    void (async () => {
      setSyncBusy(true);
      setSyncMsg(null);
      const res = await fetchWithTimeout('/api/admin/google-calendar/pull', {
        method: 'POST',
        credentials: 'same-origin',
        timeoutMs: 90000,
      });
      const data = (await res.json()) as { ok?: boolean; imported?: number; error?: string };
      setSyncBusy(false);
      if (!res.ok || !data.ok) {
        setSyncMsg(data.error ?? 'Sync failed');
        return;
      }
      setSyncMsg(`Debug pull: ${data.imported ?? 0} events`);
      await loadFeed();
    })();
  };

  const cellMinH = isCompact ? 'min-h-[72px] sm:min-h-20' : 'min-h-[100px] sm:min-h-[140px]';

  return (
    <div className="space-y-4 pb-8 sm:space-y-6">
      {/* Header */}
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 backdrop-blur sm:rounded-3xl sm:p-6 ${isCompact ? '' : 'shadow-md'}`}>
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl border border-gold/25 bg-black/60 p-2.5 sm:rounded-2xl sm:p-3">
            <Calendar className="h-5 w-5 text-gold sm:h-6 sm:w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-base font-black uppercase tracking-wider text-white sm:text-xl">
              {isAdmin ? 'One Calendar' : 'Your schedule'}
            </h2>
            <p className="text-[10px] text-zinc-500 sm:text-xs">
              {isAdmin ? 'Bookings · blocks · Google · weather' : 'Assigned jobs from Titan'}
            </p>
          </div>
        </div>
        <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-4">
          <div className="flex rounded-xl border border-white/10 bg-black p-0.5 sm:rounded-2xl sm:p-1">
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white sm:rounded-xl"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
            <span className="min-w-[110px] self-center px-1 text-center font-mono text-[10px] font-black uppercase text-white sm:min-w-[140px] sm:text-xs">
              {monthName}
            </span>
            <button
              type="button"
              onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white sm:rounded-xl"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCurrentDate(new Date())}
            className="rounded-xl border border-gold/30 bg-gold/5 px-3 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/15"
          >
            Today
          </button>
        </div>
      </div>

      {/* Google sync strip — admin full only */}
      {isAdmin && !isCompact ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 text-xs">
            <p className="font-black uppercase tracking-wider text-gold-soft">Google Calendar</p>
            {googleSync?.connected ? (
              <>
                <p className="mt-1 text-muted-foreground">{googleSync.accountEmail ?? 'Connected account'}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{syncStatusLabel}</p>
              </>
            ) : googleSync?.connectionStatus === 'needs_reconnect' || googleSync?.connectionStatus === 'error' ? (
              <>
                <p className="mt-1 text-amber-700 dark:text-amber-200">{syncStatusLabel}</p>
                {googleSync.accountEmail ? (
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{googleSync.accountEmail}</p>
                ) : null}
              </>
            ) : (
              <p className="mt-1 text-muted-foreground">Connect Google Calendar to block booking slots from your personal calendar.</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!googleSync?.connected ? (
              <a
                href="/api/admin/google-calendar/connect"
                className="rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black"
              >
                {googleSync?.connectionStatus === 'needs_reconnect' || googleSync?.connectionStatus === 'error'
                  ? 'Reconnect Google Calendar'
                  : 'Connect Google Calendar'}
              </a>
            ) : (
              <>
                <span className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700 dark:text-emerald-200">
                  Connected
                </span>
                <button
                  type="button"
                  disabled={syncBusy || loadingFeed}
                  onClick={runGooglePull}
                  className="text-[10px] font-medium uppercase text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                  title={`Last pull: ${fmtSync(lastSynced)}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <RefreshCw className={`h-3 w-3 ${syncBusy ? 'animate-spin' : ''}`} />
                    Force refresh
                  </span>
                </button>
              </>
            )}
            <button
              type="button"
              disabled={loadingFeed}
              onClick={() => void loadFeed()}
              className="rounded-xl border border-border px-3 py-2 text-[10px] font-black uppercase text-muted-foreground disabled:opacity-50"
            >
              Refresh view
            </button>
          </div>
          {syncMsg ? <p className="text-[10px] text-muted-foreground sm:col-span-2">{syncMsg}</p> : null}
        </div>
      ) : null}

      {feedError ? (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">{feedError}</p>
      ) : null}

      {loadingFeed ? (
        <p className="text-center text-xs text-zinc-500">Loading calendar…</p>
      ) : null}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1">
          <Briefcase className="h-3 w-3 text-gold-soft" /> Jobs
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/20 px-2 py-1 text-rose-300">
          <Ban className="h-3 w-3" /> Blocked
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 px-2 py-1 text-violet-300">
          Google
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 px-2 py-1 text-indigo-300">
          Notes
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/20 px-2 py-1 text-cyan-300">
          <Cloud className="h-3 w-3" /> Weather on tap
        </span>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto rounded-2xl border border-white/5 bg-zinc-950/20 p-2 sm:rounded-3xl sm:p-4">
        <div className={isCompact ? 'min-w-0' : 'min-w-[320px] sm:min-w-[640px]'}>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[8px] font-black uppercase tracking-wider text-zinc-500 sm:gap-2 sm:text-[10px]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                <span className="hidden sm:inline">{d}</span>
                <span className="sm:hidden">{d.slice(0, 1)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {cells.map((cell) =>
              cell.type === 'blank' ? (
                <div key={cell.key} className={`rounded-xl border border-transparent ${cellMinH}`} />
              ) : (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(cell.key)}
                  className={`${cellMinH} flex flex-col rounded-xl border p-1.5 text-left transition sm:rounded-2xl sm:p-2 ${
                    cell.key === todayKey
                      ? 'border-gold/50 bg-gold/5 shadow-[0_0_20px_rgba(212,175,55,0.1)]'
                      : 'border-white/10 bg-black/45 hover:border-gold/30'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className={`font-mono text-xs font-black ${cell.key === todayKey ? 'text-gold' : 'text-zinc-400'}`}>
                      {cell.day}
                    </span>
                    {cell.items.length > 0 ? (
                      <span className="rounded-full bg-gold/15 px-1.5 py-0.5 text-[8px] font-black text-gold-soft">
                        {cell.items.length}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 hidden flex-1 space-y-0.5 overflow-hidden sm:block">
                    {cell.items.slice(0, isCompact ? 2 : 3).map((item) => (
                      <div key={item.id} className={`truncate rounded px-1 py-0.5 text-[8px] font-bold border ${itemChipClass(item)}`}>
                        {item.timeLabel ? `${item.timeLabel} ` : ''}
                        {item.title}
                      </div>
                    ))}
                  </div>
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {/* Day drawer */}
      <AnimatePresence>
        {selectedDay ? (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDay(null)}
              className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed inset-x-0 bottom-0 z-[140] max-h-[90vh] overflow-y-auto rounded-t-3xl border border-gold/20 bg-zinc-950 p-4 shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-lg sm:rounded-none sm:rounded-l-3xl sm:p-6"
            >
              <div className="mb-4 flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Day detail</p>
                  <h3 className="mt-1 text-lg font-black uppercase text-white">{selectedLabel}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Weather</p>
                  <CalendarDayWeatherDetail weather={selectedDayWeather} loading={loadingWeather} />
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Jobs</p>
                    {isAdmin ? (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/work-orders/add?date=${selectedDay}&time=09:00`}
                          className="flex items-center gap-0.5 text-[9px] font-black uppercase text-emerald-300 hover:underline"
                          onClick={() => setSelectedDay(null)}
                        >
                          Add job <ArrowUpRight className="h-3 w-3" />
                        </Link>
                        <Link
                          href={`/admin/dispatch?date=${selectedDay}`}
                          className="flex items-center gap-0.5 text-[9px] font-black uppercase text-gold hover:underline"
                        >
                          Dispatch <ArrowUpRight className="h-3 w-3" />
                        </Link>
                      </div>
                    ) : null}
                  </div>
                  {selectedJobs.length === 0 ? (
                    <p className="text-xs text-zinc-500">No jobs this day.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedJobs.map((job) => (
                        <Link
                          key={job.id}
                          href={job.href ?? '#'}
                          onClick={() => setSelectedDay(null)}
                          className="block rounded-xl border border-white/5 bg-zinc-950 p-3 text-xs hover:border-gold/30"
                        >
                          <div className="flex justify-between font-bold">
                            <span className="text-white">{job.title}</span>
                            {job.price ? <span className="font-mono text-gold-soft">{job.price}</span> : null}
                          </div>
                          <p className="mt-1 text-[10px] text-zinc-400">
                            {job.subtitle} · {job.timeLabel}
                          </p>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {selectedBlocks.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">Blocked time</p>
                    <div className="space-y-2">
                      {selectedBlocks.map((block) => (
                        <div key={block.id} className="rounded-xl border border-rose-500/20 bg-rose-950/20 p-3 text-xs">
                          <p className="font-bold text-rose-100">{block.title}</p>
                          <p className="mt-1 text-[10px] text-zinc-400">{block.timeLabel}</p>
                          {isAdmin && block.source === 'manual' ? (
                            <button
                              type="button"
                              className="mt-2 text-[10px] font-black uppercase text-rose-300 hover:underline"
                              onClick={() => {
                                void (async () => {
                                  const res = await deleteCalendarBlockAction(block.id);
                                  if (res.ok) await loadFeed();
                                  else setBlockResult({ ok: false, error: res.error });
                                })();
                              }}
                            >
                              Remove block
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedNotes.length > 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                    <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-zinc-500">Notes</p>
                    {selectedNotes.map((n) => (
                      <div key={n.id} className="rounded-xl border border-indigo-500/20 bg-indigo-950/20 p-3 text-xs">
                        <p className="font-bold text-white">{n.title}</p>
                        {n.note ? <p className="mt-1 text-zinc-400">{n.note}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {isAdmin ? (
                  <>
                    <form
                      action={(formData) => {
                        setBlockResult(null);
                        startTransition(async () => {
                          const res = await createCalendarBlockAction(formData);
                          setBlockResult(res);
                          if (res.ok) await loadFeed();
                        });
                      }}
                      className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3"
                    >
                      <input type="hidden" name="dayKey" value={selectedDay} />
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-200">Block time (hides booking slots)</p>
                      <input
                        name="title"
                        placeholder="e.g. Personal errand"
                        className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <label className="text-[10px] text-zinc-400">
                          Start
                          <input name="startTime" type="time" defaultValue="09:00" className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white" />
                        </label>
                        <label className="text-[10px] text-zinc-400">
                          End
                          <input name="endTime" type="time" defaultValue="12:00" className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-xs text-white" />
                        </label>
                      </div>
                      {blockResult ? (
                        <p className={`text-[10px] font-bold ${blockResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {blockResult.message || blockResult.error}
                        </p>
                      ) : null}
                      <button
                        type="submit"
                        disabled={pending}
                        className="w-full rounded-xl border border-rose-500/40 py-2 text-[10px] font-black uppercase text-rose-200 disabled:opacity-50"
                      >
                        {pending ? 'Saving…' : 'Add block'}
                      </button>
                    </form>

                    <form
                      action={(formData) => {
                        setNoteResult(null);
                        startTransition(async () => {
                          const res = await addCalendarEventAction(formData);
                          setNoteResult(res);
                          if (res.ok) await loadFeed();
                        });
                      }}
                      className="rounded-2xl border border-gold/15 bg-gold/5 p-4 space-y-3"
                    >
                      <input type="hidden" name="dayKey" value={selectedDay} />
                      <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Add note (internal)</p>
                      <input
                        name="title"
                        required
                        placeholder="Event title"
                        className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white"
                      />
                      <textarea
                        name="note"
                        rows={2}
                        placeholder="Optional details"
                        className="w-full resize-none rounded-xl border border-white/10 bg-black px-3 py-2 text-xs text-white"
                      />
                      {noteResult ? (
                        <p className={`text-[10px] font-bold ${noteResult.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {noteResult.message || noteResult.error}
                        </p>
                      ) : null}
                      <button
                        type="submit"
                        disabled={pending}
                        className="w-full rounded-xl bg-gold py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
                      >
                        {pending ? 'Saving…' : 'Add note'}
                      </button>
                    </form>
                  </>
                ) : null}
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
