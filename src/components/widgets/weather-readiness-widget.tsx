'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Cloud, CloudRain, RefreshCw, Sun } from 'lucide-react';
import type { WeatherSnapshot } from '@/lib/weather-forecast';

type Variant = 'customer' | 'tech' | 'admin';
type Props = {
  snapshot?: WeatherSnapshot | null;
  locationLabel?: string;
  variant?: Variant;
  compact?: boolean;
  homepageCompact?: boolean;
  autoFetch?: boolean;
  settingsHref?: string;
  className?: string;
};

function WeatherIcon({ condition, className = 'h-5 w-5' }: { condition?: string; className?: string }) {
  const value = (condition ?? '').toLowerCase();
  if (/rain|storm|drizzle|shower/.test(value)) return <CloudRain className={`${className} text-sky-300`} />;
  if (/cloud|overcast|fog|mist/.test(value)) return <Cloud className={`${className} text-zinc-300`} />;
  return <Sun className={`${className} text-amber-300`} />;
}

function serviceTip(snapshot: WeatherSnapshot | null): string {
  if (!snapshot?.ok) return 'Check forecast before booking outdoor service.';
  const rain = snapshot.rainChancePct ?? snapshot.hourlyForecasts?.[0]?.rainChancePct ?? 0;
  if (rain >= 50) return 'High rain chance — consider indoor-friendly or flexible scheduling.';
  if ((snapshot.temperatureF ?? 70) >= 95) return 'Hot day — morning or evening detailing is more comfortable.';
  if ((snapshot.temperatureF ?? 70) <= 40) return 'Cold weather — confirm water availability and finish times.';
  return 'Good window for mobile detailing.';
}

export function WeatherReadinessWidget({
  snapshot: initialSnapshot = null,
  locationLabel = 'Austin service area',
  variant = 'customer',
  compact = false,
  homepageCompact = false,
  autoFetch = false,
  settingsHref = '/admin/integrations#weather',
  className = '',
}: Props) {
  const storageKey = `gb_weather_minimized_${variant}`;
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(autoFetch && !initialSnapshot);
  const [minimized, setMinimized] = useState(compact || homepageCompact);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved != null) setMinimized(saved === '1');
    } catch {
      /* optional */
    }
  }, [storageKey]);

  useEffect(() => setSnapshot(initialSnapshot), [initialSnapshot]);

  const refresh = (signal?: AbortSignal) => {
    if (!autoFetch) return;
    setLoading(true);
    fetch('/api/weather', { signal, cache: 'no-store' })
      .then(async (response) => {
        const data = (await response.json()) as WeatherSnapshot;
        if (!response.ok) throw new Error(data.blocker ?? `Weather request failed (${response.status})`);
        setSnapshot(data);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          setSnapshot({ ok: false, blocker: error instanceof Error ? error.message : 'Weather lookup failed.' });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!autoFetch) return;
    const controller = new AbortController();
    refresh(controller.signal);
    return () => controller.abort();
  }, [autoFetch]);

  const toggle = () =>
    setMinimized((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* optional */
      }
      return next;
    });

  const condition = snapshot?.description ?? snapshot?.condition ?? 'Forecast';
  const temp = snapshot?.temperatureF;
  const rain = snapshot?.rainChancePct ?? snapshot?.hourlyForecasts?.[0]?.rainChancePct ?? null;
  const days = snapshot?.dailyForecasts?.slice(0, 5) ?? [];
  const hours = snapshot?.hourlyForecasts?.slice(0, 8) ?? [];
  const tip = serviceTip(snapshot);

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/90 p-3 shadow-md ${homepageCompact ? 'max-w-xl' : ''} ${className}`}
      aria-label="Weather forecast"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <WeatherIcon condition={condition} className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-300/90">Weather</p>
            <p className="truncate text-sm font-semibold text-white">
              {locationLabel}
              {temp != null ? ` · ${temp}°F` : ''}
              {condition ? ` · ${condition}` : ''}
            </p>
            {minimized ? (
              <p className="mt-1 text-[11px] leading-snug text-zinc-400">
                {rain != null ? `${rain}% rain · ` : ''}
                {tip}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {autoFetch ? (
            <button
              type="button"
              onClick={() => refresh()}
              disabled={loading}
              className="min-h-9 min-w-9 rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white"
              aria-label="Refresh forecast"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={toggle}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/10 px-2.5 text-[9px] font-black uppercase text-zinc-300"
          >
            {minimized ? 'Expand' : 'Minimize'}
            {minimized ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {!minimized ? (
        !snapshot?.ok ? (
          <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
            <p>{loading ? 'Loading forecast…' : snapshot?.blocker ?? 'Forecast unavailable.'}</p>
            {variant === 'admin' ? (
              <Link href={settingsHref} className="mt-2 inline-block font-black uppercase text-amber-300 underline">
                Weather settings
              </Link>
            ) : null}
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-zinc-400">{tip}</p>
            {hours.length ? (
              <div>
                <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Today by hour</p>
                <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                  {hours.map((hour, index) => (
                    <div key={`${hour.hourLabel}-${index}`} className="rounded-lg border border-white/8 bg-black/35 p-1.5 text-center">
                      <p className="text-[8px] font-black uppercase text-zinc-500">{hour.hourLabel}</p>
                      <WeatherIcon condition={hour.condition} className="mx-auto mt-1 h-3.5 w-3.5" />
                      <p className="mt-1 font-mono text-[11px] font-black text-white">{hour.temperatureF}°</p>
                      <p className="text-[8px] text-sky-300">{hour.rainChancePct}%</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {days.length ? (
              <div>
                <p className="mb-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Five-day forecast</p>
                <div className="grid grid-cols-5 gap-1.5">
                  {days.map((day) => (
                    <div key={day.date} className="rounded-lg border border-white/8 bg-black/35 p-1.5 text-center">
                      <p className="text-[8px] font-black uppercase text-zinc-400">{day.dayName.slice(0, 3)}</p>
                      <WeatherIcon condition={day.condition} className="mx-auto mt-1 h-3.5 w-3.5" />
                      <p className="mt-1 font-mono text-[10px] font-black text-white">
                        {day.tempMaxF}° <span className="text-zinc-600">{day.tempMinF}°</span>
                      </p>
                      <p className="text-[8px] text-sky-300">{day.rainChancePct}%</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )
      ) : null}
    </section>
  );
}
