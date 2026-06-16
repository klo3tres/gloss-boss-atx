export type WeatherSnapshot = {
  ok: boolean;
  blocker?: string;
  temperatureF?: number;
  rainChancePct?: number;
  description?: string;
  severe?: boolean;
};

/** Lightweight forecast via OpenWeather (optional). Does not block booking. */
export async function fetchWeatherForAddress(address: string, whenIso?: string): Promise<WeatherSnapshot> {
  const key = process.env.OPENWEATHER_API_KEY?.trim();
  if (!key) {
    return { ok: false, blocker: 'OPENWEATHER_API_KEY not set — add in Vercel env for weather on jobs.' };
  }
  const q = address.trim();
  if (!q) return { ok: false, blocker: 'No address for weather lookup.' };

  try {
    const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${key}`;
    const geoRes = await fetch(geoUrl, { next: { revalidate: 3600 } });
    if (!geoRes.ok) return { ok: false, blocker: `Geocode failed (${geoRes.status}).` };
    const geo = (await geoRes.json()) as Array<{ lat?: number; lon?: number }>;
    const lat = geo[0]?.lat;
    const lon = geo[0]?.lon;
    if (lat == null || lon == null) return { ok: false, blocker: 'Could not geocode address for weather.' };

    const when = whenIso ? new Date(whenIso) : new Date();
    const daysOut = Math.max(0, Math.min(5, Math.floor((when.getTime() - Date.now()) / (24 * 60 * 60 * 1000))));
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${key}`;
    const fRes = await fetch(forecastUrl, { next: { revalidate: 1800 } });
    if (!fRes.ok) return { ok: false, blocker: `Forecast API failed (${fRes.status}).` };
    const data = (await fRes.json()) as {
      list?: Array<{ dt: number; main?: { temp?: number }; pop?: number; weather?: Array<{ main?: string; description?: string }> }>;
    };
    const target = when.getTime();
    let best = data.list?.[0];
    let bestDelta = Infinity;
    for (const slot of data.list ?? []) {
      const delta = Math.abs(slot.dt * 1000 - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = slot;
      }
    }
    if (!best) return { ok: false, blocker: 'No forecast slots returned.' };

    const rainPct = Math.round((best.pop ?? 0) * 100);
    const desc = best.weather?.[0]?.description ?? best.weather?.[0]?.main ?? '';
    const severe = /thunder|storm|tornado|hurricane|extreme|snow|blizzard/i.test(desc);
    if (daysOut > 5) {
      return {
        ok: true,
        temperatureF: Math.round(best.main?.temp ?? 0),
        rainChancePct: rainPct,
        description: `${desc} (approx — appointment >5 days out)`,
        severe,
      };
    }
    return {
      ok: true,
      temperatureF: Math.round(best.main?.temp ?? 0),
      rainChancePct: rainPct,
      description: desc,
      severe,
    };
  } catch (e) {
    return { ok: false, blocker: e instanceof Error ? e.message : 'Weather lookup failed.' };
  }
}
