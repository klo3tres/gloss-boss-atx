'use client';

import { useEffect, useMemo, useState } from 'react';
import { CloudRain, Thermometer, AlertTriangle } from 'lucide-react';
import type { WeatherSnapshot } from '@/lib/weather-forecast';

export function BookingWeatherHint({
  serviceAddress,
  serviceCity,
  serviceState,
  serviceZip,
  scheduledIso,
}: {
  serviceAddress: string;
  serviceCity: string;
  serviceState: string;
  serviceZip: string;
  scheduledIso?: string;
}) {
  const fullAddress = useMemo(
    () => [serviceAddress, serviceCity, serviceState, serviceZip].map((p) => p.trim()).filter(Boolean).join(', '),
    [serviceAddress, serviceCity, serviceState, serviceZip],
  );
  const [snap, setSnap] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    if (fullAddress.length < 8) {
      setSnap(null);
      return;
    }
    const ctrl = new AbortController();
    const when = scheduledIso ? `&when=${encodeURIComponent(scheduledIso)}` : '';
    fetch(`/api/weather?address=${encodeURIComponent(fullAddress)}${when}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((data: WeatherSnapshot) => setSnap(data))
      .catch(() => {
        /* ignore abort / network */
      });
    return () => ctrl.abort();
  }, [fullAddress, scheduledIso]);

  if (!fullAddress) return null;
  if (!snap) return null;

  if (!snap.ok) {
    return (
      <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs text-amber-200/90">
        Weather: {snap.blocker ?? 'Unavailable'}
      </p>
    );
  }

  return (
    <div
      className={`mt-2 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2 text-xs ${
        snap.severe ? 'border-rose-500/40 bg-rose-500/10 text-rose-100' : 'border-cyan-500/25 bg-cyan-500/5 text-cyan-100'
      }`}
    >
      {snap.severe ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CloudRain className="h-4 w-4 shrink-0" />}
      <span className="inline-flex items-center gap-1">
        <Thermometer className="h-3.5 w-3.5" />
        {snap.temperatureF ?? '—'}°F
      </span>
      <span>Rain {snap.rainChancePct ?? 0}%</span>
      {snap.description ? <span className="text-zinc-400 capitalize">{snap.description}</span> : null}
      {snap.severe ? <span className="font-bold uppercase tracking-wide">Severe weather possible</span> : null}
    </div>
  );
}
