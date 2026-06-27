'use client';

import type { WeatherSnapshot } from '@/lib/weather-forecast';
import { WeatherOperatorCard } from '@/components/weather/weather-operator-card';

export function CalendarDayWeatherDetail({ weather, loading }: { weather: WeatherSnapshot | null; loading: boolean }) {
  if (loading) return <p className="text-xs text-zinc-500 animate-pulse">Loading weather…</p>;
  return <WeatherOperatorCard weather={weather} compact />;
}
