import { appleAdvancedApiStatus, businessCoordinates } from '@/lib/weather-config';

export type WeatherSnapshot = {
  ok: boolean;
  blocker?: string;
  temperatureF?: number;
  rainChancePct?: number;
  description?: string;
  condition?: string;
  severe?: boolean;
  provider?: 'openweather';
  appleAdvancedApi?: {
    configured: boolean;
    message: string;
    missing: string[];
  };
};

/** Lightweight forecast via OpenWeather. Does not block booking or dispatch. */
export async function fetchWeatherForAddress(address: string, whenIso?: string): Promise<WeatherSnapshot> {
  const appleAdvancedApi = appleAdvancedApiStatus();
  const key = process.env.OPENWEATHER_API_KEY?.trim();

  if (!key) {
    return {
      ok: false,
      provider: 'openweather',
      blocker: 'missing OPENWEATHER_API_KEY',
      appleAdvancedApi,
    };
  }

  const q = address.trim();
  if (!q) {
    return {
      ok: false,
      provider: 'openweather',
      blocker: 'No address for weather lookup. Add BUSINESS_HOME_BASE_ADDRESS or pass a service address.',
      appleAdvancedApi,
    };
  }

  try {
    const coords = businessCoordinates();
    let lat = coords?.lat;
    let lon = coords?.lng;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${key}`;
      const geoRes = await fetch(geoUrl, { next: { revalidate: 3600 } });
      if (!geoRes.ok) {
        return { ok: false, provider: 'openweather', blocker: `OpenWeather geocode failed (${geoRes.status}).`, appleAdvancedApi };
      }
      const geo = (await geoRes.json()) as Array<{ lat?: number; lon?: number }>;
      lat = geo[0]?.lat;
      lon = geo[0]?.lon;
    }

    if (lat == null || lon == null) {
      return { ok: false, provider: 'openweather', blocker: 'Could not geocode address for weather.', appleAdvancedApi };
    }

    const when = whenIso ? new Date(whenIso) : new Date();
    const daysOut = Math.max(0, Math.min(5, Math.floor((when.getTime() - Date.now()) / (24 * 60 * 60 * 1000))));
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${key}`;
    const fRes = await fetch(forecastUrl, { next: { revalidate: 1800 } });
    if (!fRes.ok) {
      return { ok: false, provider: 'openweather', blocker: `OpenWeather forecast API failed (${fRes.status}).`, appleAdvancedApi };
    }

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

    if (!best) {
      return { ok: false, provider: 'openweather', blocker: 'No forecast slots returned.', appleAdvancedApi };
    }

    const rainPct = Math.round((best.pop ?? 0) * 100);
    const condition = best.weather?.[0]?.main ?? '';
    const desc = best.weather?.[0]?.description ?? condition;
    const severe = /thunder|storm|tornado|hurricane|extreme|snow|blizzard/i.test(desc);

    return {
      ok: true,
      provider: 'openweather',
      temperatureF: Math.round(best.main?.temp ?? 0),
      rainChancePct: rainPct,
      description: daysOut > 5 ? `${desc} (approx - appointment >5 days out)` : desc,
      condition,
      severe,
      appleAdvancedApi,
    };
  } catch (e) {
    return {
      ok: false,
      provider: 'openweather',
      blocker: e instanceof Error ? e.message : 'Weather lookup failed.',
      appleAdvancedApi,
    };
  }
}
