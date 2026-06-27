'use client';

import type { WeatherSnapshot } from '@/lib/weather-forecast';

function weatherTheme(snapshot: WeatherSnapshot) {
  const rain = snapshot.rainChancePct ?? 0;
  const desc = `${snapshot.condition ?? ''} ${snapshot.description ?? ''}`.toLowerCase();
  if (/storm|thunder|tornado|hurricane/.test(desc) || snapshot.severe) return 'storm';
  if (rain >= 50) return 'rainy';
  if (rain >= 30) return 'cloudy';
  if ((snapshot.temperatureF ?? 0) >= 95) return 'hot';
  return 'sunny';
}

export function WeatherOperatorCard({ weather, compact }: { weather: WeatherSnapshot | null; compact?: boolean }) {
  if (!weather?.ok) {
    return <p className="text-xs text-zinc-500">{weather?.blocker ?? 'Weather unavailable'}</p>;
  }

  const theme = weatherTheme(weather);
  const daily = weather.dailyForecasts?.find((d) => d.date === weather.selectedDateKey) ?? weather.dailyForecasts?.[0];
  const rain = weather.rainChancePct ?? daily?.rainChancePct ?? 0;
  const readiness = rain >= 50 || weather.severe ? 35 : rain >= 30 ? 65 : 90;
  const recommendation =
    rain >= 50 || weather.severe
      ? 'Reschedule exterior work — prioritize interiors or covered locations.'
      : rain < 30
        ? 'Good day for details — book exterior jobs confidently.'
        : 'Watch rain windows — morning or post-shower slots preferred.';

  const themeClass =
    theme === 'storm'
      ? 'weather-theme-storm'
      : theme === 'rainy'
        ? 'weather-theme-rainy'
        : theme === 'cloudy'
          ? 'weather-theme-cloudy'
          : theme === 'hot'
            ? 'weather-theme-hot'
            : 'weather-theme-sunny';

  return (
    <div className={`weather-operator-card ${themeClass} rounded-2xl border border-white/10 p-4 ${compact ? '' : 'p-5'}`}>
      <div className="weather-operator-bg" aria-hidden />
      <div className="relative z-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Weather Operator</p>
            <p className="mt-2 font-mono text-3xl font-black text-white">{weather.temperatureF ?? daily?.tempMaxF}°F</p>
            <p className="text-sm capitalize text-zinc-300">{weather.description ?? daily?.description}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-zinc-500">Detail readiness</p>
            <p className="text-2xl font-black text-emerald-300">{readiness}%</p>
          </div>
        </div>
        {daily ? (
          <p className="mt-3 text-xs text-zinc-400">
            High {daily.tempMaxF}° · Low {daily.tempMinF}° · Rain {daily.rainChancePct}%
          </p>
        ) : null}
        <p className="mt-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100">
          <span className="font-black uppercase text-cyan-300">Titan: </span>
          {recommendation}
        </p>
        <p className="mt-2 text-[10px] text-zinc-600">Best window: morning before heat · after rain passes · interiors anytime.</p>
      </div>
    </div>
  );
}
