'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, Cloud, CloudRain, RefreshCw, Sun } from 'lucide-react';
import type { WeatherSnapshot } from '@/lib/weather-forecast';

type Variant = 'customer' | 'tech' | 'admin';
type Props = { snapshot?: WeatherSnapshot | null; locationLabel?: string; variant?: Variant; compact?: boolean; homepageCompact?: boolean; autoFetch?: boolean; settingsHref?: string; className?: string };

function WeatherIcon({ condition, className = 'h-5 w-5' }: { condition?: string; className?: string }) {
  const value = (condition ?? '').toLowerCase();
  if (/rain|storm|drizzle|shower/.test(value)) return <CloudRain className={`${className} text-sky-300`} />;
  if (/cloud|overcast|fog|mist/.test(value)) return <Cloud className={`${className} text-zinc-300`} />;
  return <Sun className={`${className} text-amber-300`} />;
}

export function WeatherReadinessWidget({ snapshot: initialSnapshot = null, locationLabel = 'Austin service area', variant = 'customer', compact = false, homepageCompact = false, autoFetch = false, settingsHref = '/admin/integrations#weather', className = '' }: Props) {
  const storageKey = `gb_weather_minimized_${variant}`;
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(autoFetch && !initialSnapshot);
  const [minimized, setMinimized] = useState(compact || homepageCompact);

  useEffect(() => { try { const saved = window.localStorage.getItem(storageKey); if (saved != null) setMinimized(saved === '1'); } catch { /* optional */ } }, [storageKey]);
  useEffect(() => setSnapshot(initialSnapshot), [initialSnapshot]);

  const refresh = (signal?: AbortSignal) => {
    if (!autoFetch) return;
    setLoading(true);
    fetch('/api/weather', { signal, cache: 'no-store' })
      .then(async (response) => { const data = (await response.json()) as WeatherSnapshot; if (!response.ok) throw new Error(data.blocker ?? `Weather request failed (${response.status})`); setSnapshot(data); })
      .catch((error) => { if (error?.name !== 'AbortError') setSnapshot({ ok: false, blocker: error instanceof Error ? error.message : 'Weather lookup failed.' }); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { if (!autoFetch) return; const controller = new AbortController(); refresh(controller.signal); return () => controller.abort(); }, [autoFetch]);
  const toggle = () => setMinimized((current) => { const next = !current; try { window.localStorage.setItem(storageKey, next ? '1' : '0'); } catch { /* optional */ } return next; });
  const condition = snapshot?.description ?? snapshot?.condition ?? 'Forecast';
  const days = snapshot?.dailyForecasts?.slice(0, 5) ?? [];
  const hours = snapshot?.hourlyForecasts?.slice(0, 8) ?? [];

  return (
    <section className={`overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-zinc-950 to-amber-950/20 p-4 shadow-lg ${className}`} aria-label="Weather forecast">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3"><WeatherIcon condition={condition} className="h-7 w-7" /><div className="min-w-0"><p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-300">Weather forecast</p><p className="truncate text-sm font-black text-white">{locationLabel} Â· {snapshot?.temperatureF ?? 'â€”'}Â°F Â· {condition}</p></div></div>
        <div className="flex shrink-0 gap-1">
          {autoFetch ? <button type="button" onClick={() => refresh()} disabled={loading} className="rounded-lg border border-white/10 p-2 text-zinc-400 hover:text-white" aria-label="Refresh forecast"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></button> : null}
          <button type="button" onClick={toggle} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-2 text-[9px] font-black uppercase text-zinc-300">{minimized ? 'Expand' : 'Minimize'} {minimized ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}</button>
        </div>
      </div>
      {!minimized ? (!snapshot?.ok ? (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100"><p>{loading ? 'Loading forecastâ€¦' : snapshot?.blocker ?? 'Forecast unavailable.'}</p>{variant === 'admin' ? <Link href={settingsHref} className="mt-2 inline-block font-black uppercase text-amber-300 underline">Weather settings</Link> : null}</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div><p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Today by hour</p><div className="grid grid-cols-4 gap-2 sm:grid-cols-8">{hours.map((hour, index) => <div key={`${hour.hourLabel}-${index}`} className="rounded-xl border border-white/8 bg-black/35 p-2 text-center"><p className="text-[8px] font-black uppercase text-zinc-500">{hour.hourLabel}</p><WeatherIcon condition={hour.condition} className="mx-auto mt-1 h-4 w-4" /><p className="mt-1 font-mono text-xs font-black text-white">{hour.temperatureF}Â°</p><p className="text-[8px] text-sky-300">{hour.rainChancePct}% rain</p></div>)}</div></div>
          <div><p className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Five-day forecast</p><div className="grid grid-cols-5 gap-2">{days.map((day) => <div key={day.date} className="rounded-xl border border-white/8 bg-black/35 p-2 text-center"><p className="text-[8px] font-black uppercase text-zinc-400">{day.dayName.slice(0, 3)}</p><WeatherIcon condition={day.condition} className="mx-auto mt-1 h-4 w-4" /><p className="mt-1 font-mono text-[11px] font-black text-white">{day.tempMaxF}Â° <span className="text-zinc-600">{day.tempMinF}Â°</span></p><p className="text-[8px] text-sky-300">{day.rainChancePct}%</p></div>)}</div></div>
        </div>
      )) : null}
    </section>
  );
}
