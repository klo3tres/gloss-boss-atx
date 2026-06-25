'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import {
  formatScheduleShortDate,
  formatScheduleTime,
  scheduleDayKey,
  type ScheduleWidgetItem,
} from '@/lib/widgets/schedule-types';

type Props = {
  items: ScheduleWidgetItem[];
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  bookHref?: string;
  maxList?: number;
  className?: string;
};

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ date: Date | null; key: string }> = [];
  for (let i = 0; i < startPad; i++) cells.push({ date: null, key: `pad-${i}` });
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ date, key: scheduleDayKey(date.toISOString()) });
  }
  return cells;
}

export function UpcomingScheduleWidget({
  items,
  title = 'Schedule',
  subtitle = 'Upcoming appointments',
  emptyMessage = 'Nothing scheduled yet.',
  bookHref,
  maxList = 6,
  className = '',
}: Props) {
  const today = new Date();
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const dayKeys = useMemo(() => new Set(items.map((i) => scheduleDayKey(i.scheduledStart))), [items]);

  const monthLabel = viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
    if (!selectedDay) return sorted;
    return sorted.filter((i) => scheduleDayKey(i.scheduledStart) === selectedDay);
  }, [items, selectedDay]);

  const grid = buildMonthGrid(viewMonth.getFullYear(), viewMonth.getMonth());
  const todayKey = scheduleDayKey(today.toISOString());

  return (
    <section className={`overflow-hidden rounded-2xl border border-white/10 bg-black/45 p-4 sm:p-5 ${className}`}>
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">
            <CalendarDays className="h-4 w-4 shrink-0" />
            {title}
          </p>
          <h3 className="mt-1 text-lg font-black text-white">{subtitle}</h3>
        </div>
        {bookHref ? (
          <Link
            href={bookHref}
            className="shrink-0 rounded-lg bg-gold px-3 py-1.5 text-[10px] font-black uppercase text-black hover:bg-gold-soft"
          >
            Book
          </Link>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[280px]">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
              className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-xs font-black uppercase text-zinc-300">{monthLabel}</p>
            <button
              type="button"
              onClick={() => setViewMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
              className="rounded-lg border border-white/10 p-1.5 text-zinc-400 hover:text-white"
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-bold uppercase text-zinc-600">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {grid.map((cell) => {
              if (!cell.date) return <span key={cell.key} className="aspect-square" />;
              const key = scheduleDayKey(cell.date.toISOString());
              const hasJob = dayKeys.has(key);
              const isToday = key === todayKey;
              const isSelected = selectedDay === key;
              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : key)}
                  className={`relative flex aspect-square items-center justify-center rounded-lg text-xs font-bold transition ${
                    isSelected
                      ? 'bg-gold text-black'
                      : isToday
                        ? 'border border-gold/50 text-gold-soft'
                        : hasJob
                          ? 'bg-gold/15 text-white hover:bg-gold/25'
                          : 'text-zinc-500 hover:bg-white/5'
                  }`}
                >
                  {cell.date.getDate()}
                  {hasJob && !isSelected ? (
                    <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-gold" />
                  ) : null}
                </button>
              );
            })}
          </div>
          {selectedDay ? (
            <button
              type="button"
              onClick={() => setSelectedDay(null)}
              className="mt-2 text-[10px] font-black uppercase text-zinc-500 hover:text-gold-soft"
            >
              Show all upcoming
            </button>
          ) : null}
        </div>
      </div>

      <ul className="mt-4 max-h-[420px] space-y-2 overflow-y-auto overscroll-contain">
        {filtered.length === 0 ? (
          <li className="rounded-xl border border-dashed border-white/10 py-8 text-center text-sm text-zinc-500">{emptyMessage}</li>
        ) : (
          filtered.slice(0, maxList).map((item) => (
            <li key={item.id} className="rounded-xl border border-white/10 bg-zinc-950/60 p-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-black text-white">{item.title}</p>
                  <p className="mt-0.5 text-xs text-gold-soft">{formatScheduleTime(item.scheduledStart)}</p>
                  {item.subtitle ? <p className="mt-1 truncate text-xs text-zinc-400">{item.subtitle}</p> : null}
                  {item.address ? (
                    <p className="mt-1 flex items-start gap-1 text-[10px] text-zinc-500">
                      <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                      <span className="line-clamp-2 break-words">{item.address}</span>
                    </p>
                  ) : null}
                </div>
                {item.href ? (
                  <Link
                    href={item.href}
                    className="shrink-0 rounded-lg border border-gold/30 px-2 py-1 text-[9px] font-black uppercase text-gold-soft hover:bg-gold/10"
                  >
                    Open
                  </Link>
                ) : null}
              </div>
              {item.status ? (
                <p className="mt-2 text-[9px] font-black uppercase tracking-wider text-zinc-500">{item.status.replace(/_/g, ' ')}</p>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
