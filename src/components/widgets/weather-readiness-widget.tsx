'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CloudRain, Sun, RefreshCw } from 'lucide-react';
import type { WeatherSnapshot } from '@/lib/weather-forecast';

type Variant = 'customer' | 'tech' | 'admin';

type Props = {
  snapshot?: WeatherSnapshot | null;
  locationLabel?: string;
  variant?: Variant;
  compact?: boolean;
  /** Client fetch when snapshot not passed (admin home). */
  autoFetch?: boolean;
  settingsHref?: string;
  className?: string;
};

const accent: Record<Variant, string> = {
  customer: 'border-gold/25 bg-gold/5',
  tech: 'border-cyan-400/20 bg-cyan-400/5',
  admin: 'border-cyan-400/15 bg-black/45',
};

export function WeatherReadinessWidget({
  snapshot: initialSnapshot = null,
  locationLabel = 'Austin service area',
  variant = 'customer',
  compact = false,
  autoFetch = false,
  settingsHref = '/admin/integrations#weather',
  className = '',
}: Props) {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(initialSnapshot);
  const [loading, setLoading] = useState(autoFetch && !initialSnapshot);

  const refresh = (signal?: AbortSignal) => {
    if (!autoFetch) return;
    setLoading(true);
    fetch('/api/weather', { signal, cache: 'no-store' })
      .then((r) => r.json())
      .then((data: WeatherSnapshot) => setSnapshot(data))
      .catch((e) => {
        if (e?.name !== 'AbortError') {
          setSnapshot({ ok: false, blocker: e instanceof Error ? e.message : 'Weather lookup failed.' });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSnapshot(initialSnapshot);
  }, [initialSnapshot]);

  useEffect(() => {
    if (!autoFetch) return;
    const ctrl = new AbortController();
    refresh(ctrl.signal);
    return () => ctrl.abort();
  }, [autoFetch]);

  const rain = snapshot?.rainChancePct ?? 0;
  const highRain = rain >= 45;
  const severe = snapshot?.severe || highRain;

  return (
    <section
      className={`overflow-hidden rounded-2xl border p-4 sm:p-5 ${accent[variant]} ${className}`}
      aria-label="Weather readiness"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">Weather readiness</p>
          <p className="mt-1 truncate text-sm font-bold text-white">{locationLabel}</p>
        </div>
        {autoFetch ? (
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[9px] font-black uppercase text-zinc-400 hover:text-white disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        ) : null}
      </div>

      {loading && !snapshot ? (
        <p className="mt-3 text-xs text-zinc-500">Loading forecast…</p>
      ) : null}

      {!snapshot?.ok ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-zinc-400">
          <p className="font-bold uppercase tracking-wider text-zinc-300">Forecast unavailable</p>
          <p className="mt-1 break-words">{snapshot?.blocker || 'OpenWeather not configured.'}</p>
          {variant === 'admin' && settingsHref ? (
            <Link href={settingsHref} className="mt-2 inline-block text-[10px] font-black uppercase text-cyan-300 hover:underline">
              Configure weather →
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div
            className={`flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-3 ${
              severe ? 'border-rose-500/35 bg-rose-500/10' : 'border-white/10 bg-black/35'
            }`}
          >
            {severe ? <CloudRain className="h-5 w-5 shrink-0 text-rose-300" /> : <Sun className="h-5 w-5 shrink-0 text-gold-soft" />}
            <div className="min-w-0">
              <p className="text-2xl font-black text-white">{snapshot.temperatureF ?? '—'}°F</p>
              <p className="truncate text-xs capitalize text-zinc-400">
                {snapshot.description || snapshot.condition} · Rain {rain}%
              </p>
            </div>
          </div>

          {snapshot.dailyForecasts && snapshot.dailyForecasts.length > 0 ? (
            <div className="-mx-1 overflow-x-auto px-1 pb-1 scrollbar-none">
              <div className={`flex gap-2 ${compact ? 'min-w-[320px]' : 'min-w-[360px]'} sm:min-w-0 sm:grid sm:grid-cols-5`}>
                {snapshot.dailyForecasts.slice(0, 5).map((d) => (
                  <div
                    key={d.date}
                    className={`min-w-[4.5rem] shrink-0 rounded-xl border p-2 text-center sm:min-w-0 ${
                      d.isBest
                        ? 'border-gold/35 bg-gold/10'
                        : d.isRainy
                          ? 'border-rose-500/30 bg-rose-500/10'
                          : 'border-white/10 bg-black/40'
                    }`}
                  >
                    <p className="text-[9px] font-bold uppercase text-zinc-500">{d.dayName.slice(0, 3)}</p>
                    <p className="mt-1 font-mono text-xs font-black text-white">{d.tempMaxF}°</p>
                    <p className="font-mono text-[10px] text-zinc-500">{d.rainChancePct}%</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {!compact && snapshot.bestDetailingDays && snapshot.bestDetailingDays.length > 0 ? (
            <p className="text-xs text-zinc-300">
              <span className="font-black uppercase text-gold-soft">Best days: </span>
              {snapshot.bestDetailingDays.join(', ')}
            </p>
          ) : null}

          {!compact && snapshot.rainWarningDays && snapshot.rainWarningDays.length > 0 ? (
            <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
              Rain likely: <strong>{snapshot.rainWarningDays.join(', ')}</strong>
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
