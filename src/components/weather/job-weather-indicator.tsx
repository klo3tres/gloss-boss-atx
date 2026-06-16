import type { WeatherSnapshot } from '@/lib/weather-forecast';
import { CloudRain, Thermometer, AlertTriangle } from 'lucide-react';

export function JobWeatherIndicator({ weather }: { weather: WeatherSnapshot }) {
  if (!weather.ok) {
    if (!weather.blocker) return null;
    return (
      <p className="mt-1 text-[10px] text-amber-200/80">
        Weather: {weather.blocker}
      </p>
    );
  }

  return (
    <div
      className={`mt-2 inline-flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide ${
        weather.severe ? 'border-rose-500/40 bg-rose-500/10 text-rose-100' : 'border-cyan-500/30 bg-cyan-500/5 text-cyan-100'
      }`}
    >
      {weather.severe ? <AlertTriangle className="h-3.5 w-3.5" /> : <CloudRain className="h-3.5 w-3.5" />}
      <span className="inline-flex items-center gap-1 normal-case">
        <Thermometer className="h-3 w-3" />
        {weather.temperatureF ?? '—'}°F
      </span>
      <span>Rain {weather.rainChancePct ?? 0}%</span>
      {weather.description ? <span className="normal-case capitalize text-zinc-400">{weather.description}</span> : null}
    </div>
  );
}
