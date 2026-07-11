import { appleAdvancedApiStatus, businessCoordinates } from '@/lib/weather-config';
import { titanConfig } from '@/lib/titan/config';

export type HourlyForecast = {
  hourLabel: string;
  temperatureF: number;
  rainChancePct: number;
  condition: string;
};

export type DailyForecast = {
  date: string;
  dayName: string;
  tempMinF: number;
  tempMaxF: number;
  rainChancePct: number;
  condition: string;
  description: string;
  severe: boolean;
  isBest: boolean;
  isRainy: boolean;
};

export type WeatherSnapshot = {
  ok: boolean;
  blocker?: string;
  temperatureF?: number;
  rainChancePct?: number;
  description?: string;
  condition?: string;
  severe?: boolean;
  provider?: 'openweather';
  selectedDateKey?: string;
  dailyForecasts?: DailyForecast[];
  bestDetailingDays?: string[];
  rainWarningDays?: string[];
  hourlyForecasts?: HourlyForecast[];
  bestDayReason?: string;
  heatWarning?: boolean;
  garageRecommended?: boolean;
  fetchedAt?: string;
  appleAdvancedApi?: {
    configured: boolean;
    message: string;
    missing: string[];
  };
};

const BUSINESS_TZ = 'America/Chicago';

function parseChicagoDateKey(whenIso?: string): { when: Date; dateKey: string | null } {
  const trimmed = whenIso?.trim();
  if (trimmed && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    // Noon Central — avoids UTC midnight shifting to the previous day
    const when = new Date(`${trimmed}T12:00:00-06:00`);
    return { when, dateKey: trimmed };
  }
  const when = trimmed ? new Date(trimmed) : new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(when);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  const dateKey = y && m && d ? `${y}-${m}-${d}` : null;
  return { when, dateKey };
}

async function geocodeAddress(q: string, key: string): Promise<{ lat: number; lon: number } | null> {
  const geoUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(q)}&limit=1&appid=${key}`;
  const geoRes = await fetch(geoUrl, { next: { revalidate: 3600 } });
  if (!geoRes.ok) return null;
  const geo = (await geoRes.json()) as Array<{ lat?: number; lon?: number }>;
  const lat = geo[0]?.lat;
  const lon = geo[0]?.lon;
  if (lat == null || lon == null) return null;
  return { lat, lon };
}

/** Lightweight forecast via OpenWeather. Does not block booking or dispatch. */
export async function fetchWeatherForAddress(address: string, whenIso?: string): Promise<WeatherSnapshot> {
  const appleAdvancedApi = appleAdvancedApiStatus();
  const key = titanConfig.weatherKey();

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
    const homeBase = process.env.BUSINESS_HOME_BASE_ADDRESS?.trim().toLowerCase() ?? '';
    const queryNorm = q.toLowerCase();
    const coords = businessCoordinates();
    let lat: number | undefined;
    let lon: number | undefined;

    if (coords && (!queryNorm || (homeBase && queryNorm === homeBase))) {
      lat = coords.lat;
      lon = coords.lng;
    } else {
      const geocoded = await geocodeAddress(q, key);
      if (geocoded) {
        lat = geocoded.lat;
        lon = geocoded.lon;
      } else if (coords) {
        lat = coords.lat;
        lon = coords.lng;
      }
    }

    if (lat == null || lon == null) {
      return { ok: false, provider: 'openweather', blocker: 'Could not geocode address for weather.', appleAdvancedApi };
    }

    const { when, dateKey: targetDateKey } = parseChicagoDateKey(whenIso);
    const daysOut = Math.max(0, Math.min(5, Math.floor((when.getTime() - Date.now()) / (24 * 60 * 60 * 1000))));
    const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=imperial&appid=${key}`;
    const fRes = await fetch(forecastUrl, { next: { revalidate: 1800 } });
    if (!fRes.ok) {
      return { ok: false, provider: 'openweather', blocker: `OpenWeather forecast API failed (${fRes.status}).`, appleAdvancedApi };
    }

    const data = (await fRes.json()) as {
      list?: Array<{ dt: number; main?: { temp?: number }; pop?: number; weather?: Array<{ main?: string; description?: string }> }>;
    };
    
    if (!data.list || data.list.length === 0) {
      return { ok: false, provider: 'openweather', blocker: 'No forecast slots returned.', appleAdvancedApi };
    }

    const target = when.getTime();
    let best = data.list[0];
    let bestDelta = Infinity;

    for (const slot of data.list) {
      const delta = Math.abs(slot.dt * 1000 - target);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = slot;
      }
    }

    const rainPct = Math.round((best.pop ?? 0) * 100);
    const condition = best.weather?.[0]?.main ?? '';
    const desc = best.weather?.[0]?.description ?? condition;
    const severe = /thunder|storm|tornado|hurricane|extreme|snow|blizzard/i.test(desc);

    // Group the 3-hour forecast slots into 5 daily summaries
    const dailyMap = new Map<string, typeof data.list>();
    for (const slot of data.list) {
      const date = new Date(slot.dt * 1000);
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS_TZ,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const parts = formatter.formatToParts(date);
      const y = parts.find(p => p.type === 'year')?.value;
      const m = parts.find(p => p.type === 'month')?.value;
      const dVal = parts.find(p => p.type === 'day')?.value;
      const dateStr = `${y}-${m}-${dVal}`;

      const group = dailyMap.get(dateStr) ?? [];
      group.push(slot);
      dailyMap.set(dateStr, group);
    }

    const sortedDates = Array.from(dailyMap.keys()).sort();
    const dailyForecasts: DailyForecast[] = [];
    const bestDetailingDays: string[] = [];
    const rainWarningDays: string[] = [];

    for (const dateStr of sortedDates.slice(0, 5)) {
      const group = dailyMap.get(dateStr)!;
      
      let midDaySlot = group[0];
      let minHourDiff = Infinity;
      for (const slot of group) {
        const slotDate = new Date(slot.dt * 1000);
        const hour = parseInt(slotDate.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour12: false, hour: 'numeric' }));
        const diff = Math.abs(hour - 13); // closest to 1 PM Central Time
        if (diff < minHourDiff) {
          minHourDiff = diff;
          midDaySlot = slot;
        }
      }

      const tempMinF = Math.round(Math.min(...group.map(s => s.main?.temp ?? 100)));
      const tempMaxF = Math.round(Math.max(...group.map(s => s.main?.temp ?? -100)));
      const rainChancePct = Math.round(Math.max(...group.map(s => s.pop ?? 0)) * 100);
      const dayCondition = midDaySlot.weather?.[0]?.main ?? '';
      const dayDesc = midDaySlot.weather?.[0]?.description ?? dayCondition;
      const daySevere = group.some(s => /thunder|storm|tornado|hurricane|extreme|snow|blizzard/i.test(s.weather?.[0]?.description ?? ''));

      // best detailing day: rain chance < 30% and max temp >= 45F
      const isBest = rainChancePct < 30 && tempMaxF >= 45;
      const isRainy = rainChancePct >= 50;

      const dateObj = new Date(group[0].dt * 1000);
      const dayName = dateObj.toLocaleDateString('en-US', { timeZone: BUSINESS_TZ, weekday: 'long' });

      dailyForecasts.push({
        date: dateStr,
        dayName,
        tempMinF,
        tempMaxF,
        rainChancePct,
        condition: dayCondition,
        description: dayDesc,
        severe: daySevere,
        isBest,
        isRainy,
      });

      if (isBest) {
        bestDetailingDays.push(dayName);
      }
      if (isRainy) {
        rainWarningDays.push(dayName);
      }
    }

    const matchedDay = targetDateKey ? dailyForecasts.find((d) => d.date === targetDateKey) : undefined;

    const hourlyForecasts: HourlyForecast[] = data.list.slice(0, 8).map((slot) => {
      const date = new Date(slot.dt * 1000);
      const hourLabel = date.toLocaleTimeString('en-US', { timeZone: BUSINESS_TZ, hour: 'numeric' });
      return {
        hourLabel,
        temperatureF: Math.round(slot.main?.temp ?? 0),
        rainChancePct: Math.round((slot.pop ?? 0) * 100),
        condition: slot.weather?.[0]?.main ?? '',
      };
    });

    const bestDay = dailyForecasts.find((d) => d.isBest);
    const bestDayReason = bestDay
      ? `${bestDay.dayName} is ideal because temperatures stay around ${bestDay.tempMaxF}°F and rain chance is only ${bestDay.rainChancePct}%.`
      : dailyForecasts[0]
        ? `Today shows ${dailyForecasts[0].rainChancePct}% rain risk — consider garage cover if showers develop.`
        : undefined;

    const currentTemp = Math.round(best.main?.temp ?? 0);
    const heatWarning = currentTemp >= 95 || dailyForecasts.some((d) => d.tempMaxF >= 98);
    const garageRecommended = rainPct >= 35 || severe || heatWarning;

    return {
      ok: true,
      provider: 'openweather',
      fetchedAt: new Date().toISOString(),
      selectedDateKey: targetDateKey ?? matchedDay?.date,
      temperatureF: matchedDay ? Math.round((matchedDay.tempMinF + matchedDay.tempMaxF) / 2) : Math.round(best.main?.temp ?? 0),
      rainChancePct: matchedDay?.rainChancePct ?? rainPct,
      description: matchedDay?.description ?? (daysOut > 5 ? `${desc} (approx - appointment >5 days out)` : desc),
      condition: matchedDay?.condition ?? condition,
      severe: matchedDay?.severe ?? severe,
      dailyForecasts,
      bestDetailingDays,
      rainWarningDays,
      hourlyForecasts,
      bestDayReason,
      heatWarning,
      garageRecommended,
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
