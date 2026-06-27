'use client';

import type { WeatherSnapshot } from '@/lib/weather-forecast';

export function CalendarDayWeatherDetail({ weather, loading }: { weather: WeatherSnapshot | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-zinc-500 animate-pulse">Loading weather…</p>;
  if (!weather?.ok) return <p className="text-xs text-zinc-500">{weather?.blocker ?? 'Weather unavailable — set OPENWEATHER_API_KEY.'}</p>;

  const daily =
    weather.dailyForecasts?.find((d) => d.date === weather.selectedDateKey) ?? weather.dailyForecasts?.[0];
  const rain = weather.rainChancePct ?? daily?.rainChancePct ?? 0;
  const readiness =
    rain >= 50 || weather.severe ? 'Rain risk — reschedule exterior work' : rain >= 30 ? 'Moderate — watch rain windows' : 'Good day for details';
  const titanNote =
    rain >= 50 || weather.severe ? 'Watch heat/rain — prioritize interiors or reschedule.' : rain < 30 ? 'Good day for details' : 'Plan around rain windows';

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-2xl font-black text-white">{weather.temperatureF ?? daily?.tempMaxF}°F</p>
          <p className="text-zinc-400 capitalize">{weather.description ?? daily?.description ?? weather.condition}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${rain >= 50 ? 'bg-rose-500/15 text-rose-200' : rain < 30 ? 'bg-emerald-500/15 text-emerald-200' : 'bg-amber-500/15 text-amber-200'}`}>
          {readiness}
        </span>
      </div>
      {daily ? (
        <p className="text-zinc-400">High {daily.tempMaxF}°F · Low {daily.tempMinF}°F · Rain {daily.rainChancePct}%</p>
      ) : null}
      <p className="text-zinc-400">Rain probability: {rain}%</p>
      <p className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 text-cyan-100">
        <span className="font-black uppercase text-cyan-300">Titan: </span>{titanNote}
      </p>
      <p className="text-[10px] text-zinc-600">Recommended work windows: morning before heat · after rain passes · interiors anytime in shade.</p>
    </div>
  );
}
