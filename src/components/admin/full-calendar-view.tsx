'use client';

import Link from 'next/link';
import { useState, useEffect, useTransition, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  X,
  AlertTriangle,
  Zap,
  Clock,
  HelpCircle,
  Plus,
  ArrowUpRight,
  TrendingUp,
  MapPin,
  Sparkles
} from 'lucide-react';
import { addCalendarEventAction } from '@/lib/admin/calendar-events-actions';
import type { WeatherSnapshot } from '@/lib/weather-forecast';
import { displayMoney } from '@/lib/display-format';

type JobItem = {
  id: string;
  guestName: string;
  service: string;
  scheduledStart: string;
  dayKey: string;
  time: string;
  status: string;
  price: string;
  href: string;
};

type EventItem = {
  id: string;
  dayKey: string;
  title: string;
  note: string;
  createdAt: string;
};

function formatChicagoDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

export function FullCalendarView({
  initialJobs,
  initialEvents,
}: {
  initialJobs: JobItem[];
  initialEvents: EventItem[];
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; error?: string; message?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const [selectedDayWeather, setSelectedDayWeather] = useState<WeatherSnapshot | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthName = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Chicago',
  }).format(currentDate);

  const firstDay = new Date(year, month, 1);
  const blanks = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = formatChicagoDateKey(new Date());

  const jobsByDay = useMemo(() => {
    const map = new Map<string, JobItem[]>();
    for (const job of initialJobs ?? []) {
      const bucket = map.get(job.dayKey) ?? [];
      bucket.push(job);
      map.set(job.dayKey, bucket);
    }
    return map;
  }, [initialJobs]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, EventItem[]>();
    for (const event of initialEvents ?? []) {
      const bucket = map.get(event.dayKey) ?? [];
      bucket.push(event);
      map.set(event.dayKey, bucket);
    }
    return map;
  }, [initialEvents]);

  // Fetch weather when a day is selected
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

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const cells = useMemo(() => {
    const items = [];
    // blanks
    for (let i = 0; i < blanks; i++) {
      items.push({ type: 'blank' as const, key: `blank-${i}` });
    }
    // days
    for (let i = 1; i <= daysInMonth; i++) {
      const date = new Date(year, month, i);
      const key = formatChicagoDateKey(date);
      items.push({
        type: 'day' as const,
        key,
        day: i,
        jobs: jobsByDay.get(key) ?? [],
        events: eventsByDay.get(key) ?? [],
      });
    }
    return items;
  }, [year, month, blanks, daysInMonth, jobsByDay, eventsByDay]);

  const selectedJobs = selectedDay ? jobsByDay.get(selectedDay) ?? [] : [];
  const selectedEvents = selectedDay ? eventsByDay.get(selectedDay) ?? [] : [];
  const selectedLabel = selectedDay
    ? new Date(`${selectedDay}T12:00:00`).toLocaleDateString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })
    : '';

  return (
    <div className="space-y-6 pb-12">
      {/* Calendar Header Control Panel */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-gold/15 bg-black/45 p-6 backdrop-blur shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-gold/25 bg-black/60 p-3 shadow-[0_0_20px_rgba(212,175,55,0.08)]">
            <Calendar className="h-6 w-6 text-gold" />
          </div>
          <div>
            <h1 className="text-xl font-black uppercase text-white tracking-wider">Operational Calendar</h1>
            <p className="text-xs text-zinc-500 font-medium">Manage events, internal notes, and job schedules.</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex rounded-2xl bg-black border border-white/10 p-1">
            <button
              onClick={prevMonth}
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/5 hover:text-white transition duration-200"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="min-w-[140px] text-center font-mono text-xs font-black uppercase text-white tracking-widest self-center px-2">
              {monthName}
            </span>
            <button
              onClick={nextMonth}
              className="rounded-xl p-2 text-zinc-400 hover:bg-white/5 hover:text-white transition duration-200"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="rounded-2xl border border-gold/30 bg-gold/5 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/15 transition duration-200"
          >
            Today
          </button>
        </div>
      </div>

      {/* Main Grid View */}
      <div className="rounded-3xl border border-white/5 bg-zinc-950/20 p-4 shadow-2xl overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Day of Week Labels */}
          <div className="grid grid-cols-7 gap-3 mb-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
            {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => (
              <div key={day} className="py-2 border-b border-white/5">{day}</div>
            ))}
          </div>

          {/* Grid Cells */}
          <div className="grid grid-cols-7 gap-3">
            {cells.map((cell) =>
              cell.type === 'blank' ? (
                <div
                  key={cell.key}
                  className="min-h-[140px] rounded-2xl border border-white/[0.02] bg-white/[0.01]"
                />
              ) : (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(cell.key)}
                  className={`min-h-[140px] rounded-2xl border p-3 text-left transition-all duration-300 flex flex-col justify-between ${
                    cell.key === todayKey
                      ? 'border-gold/50 bg-gold/5 shadow-[0_0_25px_rgba(212,175,55,0.08)]'
                      : 'border-white/10 bg-black/45 hover:border-gold/35 hover:-translate-y-0.5'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`font-mono text-sm font-black ${
                      cell.key === todayKey ? 'text-gold' : 'text-zinc-400'
                    }`}>
                      {cell.day}
                    </span>
                    {cell.jobs.length + cell.events.length > 0 && (
                      <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-black text-gold-soft border border-gold/25">
                        {cell.jobs.length + cell.events.length}
                      </span>
                    )}
                  </div>

                  {/* Cell Job Listings (Truncated) */}
                  <div className="mt-3 space-y-1.5 flex-1 w-full overflow-hidden">
                    {cell.jobs.slice(0, 3).map((job) => (
                      <div
                        key={job.id}
                        className="truncate rounded-lg bg-zinc-950/80 px-2 py-1 text-[9px] font-bold text-zinc-300 border border-white/5"
                      >
                        <span className="text-gold font-mono">{job.time}</span> {job.guestName}
                      </div>
                    ))}
                    {cell.events.slice(0, 2).map((evt) => (
                      <div
                        key={evt.id}
                        className="truncate rounded-lg bg-indigo-950/40 px-2 py-1 text-[9px] font-bold text-indigo-200 border border-indigo-500/10"
                      >
                        Note: {evt.title}
                      </div>
                    ))}
                    {cell.jobs.length + cell.events.length > 5 && (
                      <p className="text-[8px] text-zinc-500 font-bold tracking-wider uppercase mt-1 pl-1">
                        + {cell.jobs.length + cell.events.length - 5} more
                      </p>
                    )}
                  </div>
                </button>
              )
            )}
          </div>
        </div>
      </div>

      {/* Slideout Day Drawer */}
      <AnimatePresence>
        {selectedDay && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDay(null)}
              className="fixed inset-0 z-[130] bg-black/80 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-[140] w-full max-w-md border-l border-gold/20 bg-zinc-950/95 p-6 shadow-2xl backdrop-blur-md overflow-y-auto text-white"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Calendar day info</span>
                  <h3 className="mt-1 text-lg font-black uppercase text-white">{selectedLabel}</h3>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="rounded-xl border border-white/10 p-2 text-zinc-400 hover:text-white hover:border-white/20 transition duration-200"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Weather Forecast Snapshot */}
                <div className="rounded-2xl border border-white/10 bg-black/45 p-4 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-black uppercase tracking-wider text-zinc-500">Day Weather outlook</p>
                    {loadingWeather && <span className="text-[9px] text-zinc-500 animate-pulse">Fetching...</span>}
                  </div>
                  {selectedDayWeather?.ok ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-white text-base font-mono">{selectedDayWeather.temperatureF}°F</p>
                        <p className="text-[10px] text-zinc-400 capitalize mt-0.5">{selectedDayWeather.description || selectedDayWeather.condition} · rain {selectedDayWeather.rainChancePct ?? 0}%</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
                        (selectedDayWeather.rainChancePct ?? 0) >= 50 || selectedDayWeather.severe
                          ? 'bg-rose-500/15 text-rose-200 border border-rose-500/30'
                          : (selectedDayWeather.rainChancePct ?? 0) < 30
                            ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                            : 'bg-zinc-500/15 text-zinc-200 border border-zinc-500/30'
                      }`}>
                        {(selectedDayWeather.rainChancePct ?? 0) >= 50 || selectedDayWeather.severe ? 'Rain risk' : (selectedDayWeather.rainChancePct ?? 0) < 30 ? 'Ideal' : 'Moderate'}
                      </span>
                    </div>
                  ) : !loadingWeather ? (
                    <p className="text-zinc-500">{selectedDayWeather?.blocker || 'Weather forecast unavailable.'}</p>
                  ) : null}
                </div>

                {/* Scheduled Jobs */}
                <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-3">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Scheduled Detailing Jobs</p>
                    <Link
                      href={`/admin/dispatch?date=${selectedDay}`}
                      className="text-[9px] font-black uppercase text-gold hover:underline flex items-center gap-0.5"
                    >
                      Dispatch board <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </div>
                  {selectedJobs.length === 0 ? (
                    <p className="text-xs text-zinc-500">No scheduled appointments for this day.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedJobs.map((job) => (
                        <Link
                          key={job.id}
                          href={job.href}
                          onClick={() => setSelectedDay(null)}
                          className="block rounded-xl border border-white/5 bg-zinc-950 p-3 hover:border-gold/30 transition text-xs"
                        >
                          <div className="flex justify-between items-center font-bold">
                            <span className="text-white">{job.guestName}</span>
                            <span className="font-mono text-gold-soft">{job.price}</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                            <span>{job.service}</span>
                            <span>{job.time}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Internal Notes & Events */}
                <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500 border-b border-white/5 pb-2 mb-3">
                    Internal Notes & Events
                  </p>
                  {selectedEvents.length === 0 ? (
                    <p className="text-xs text-zinc-500">No internal events logged.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedEvents.map((evt) => (
                        <div key={evt.id} className="rounded-xl border border-white/5 bg-zinc-950 p-3 text-xs">
                          <p className="font-bold text-white">{evt.title}</p>
                          {evt.note && <p className="mt-1 text-zinc-400">{evt.note}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes/Event creation form */}
                <form
                  action={(formData) => {
                    setResult(null);
                    startTransition(async () => {
                      const res = await addCalendarEventAction(formData);
                      setResult(res);
                      if (res.ok) {
                        // Reset forms or close drawer if desired
                      }
                    });
                  }}
                  className="rounded-2xl border border-gold/15 bg-gold/5 p-4 space-y-3"
                >
                  <input type="hidden" name="dayKey" value={selectedDay} />
                  <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Add Calendar Note / Event</p>
                  <input
                    name="title"
                    required
                    placeholder="Event title (e.g. Rig Maintenance)"
                    className="w-full rounded-xl border border-white/10 bg-black px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-gold/50"
                  />
                  <textarea
                    name="note"
                    rows={3}
                    placeholder="Optional details..."
                    className="w-full rounded-xl border border-white/10 bg-black px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-gold/50 resize-none"
                  />
                  {result && (
                    <p className={`text-[10px] font-bold ${result.ok ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {result.message || result.error}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={pending}
                    className="w-full rounded-xl bg-gold py-2.5 text-xs font-black uppercase text-black hover:brightness-110 disabled:opacity-60 transition duration-200"
                  >
                    {pending ? 'Saving...' : 'Add Event'}
                  </button>
                </form>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
