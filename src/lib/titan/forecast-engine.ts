import type { SupabaseClient } from '@supabase/supabase-js';
import type { WeatherSnapshot } from '@/lib/weather-forecast';
import { startOfMonthIso } from '@/lib/revenue-metrics';

export type TitanForecast = {
  currentMonthCents: number;
  forecastedMonthCents: number;
  confidencePercent: number;
  factors: string[];
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function daysLeftInMonthChicago(): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now);
  const day = Number(parts.find((p) => p.type === 'day')?.value ?? 1);
  const month = Number(parts.find((p) => p.type === 'month')?.value ?? 1);
  const year = Number(parts.find((p) => p.type === 'year')?.value ?? 2026);
  const last = new Date(year, month, 0).getDate();
  return Math.max(0, last - day);
}

export async function buildTitanForecast(
  admin: SupabaseClient,
  currentMonthCents: number,
  weather: WeatherSnapshot,
): Promise<TitanForecast> {
  const monthStart = startOfMonthIso();
  const now = new Date();
  const nowIso = now.toISOString();
  const daysLeft = daysLeftInMonthChicago();
  const dayOfMonth = Math.max(1, 30 - daysLeft);

  const [scheduledRes, leadsRes, completedMonthRes] = await Promise.all([
    admin
      .from('appointments')
      .select('id, base_price_cents, deposit_amount_cents, status, scheduled_start')
      .gte('scheduled_start', nowIso)
      .in('status', ['scheduled', 'confirmed', 'deposit_paid', 'in_progress', 'pending'])
      .limit(200),
    admin.from('leads').select('id', { count: 'exact', head: true }).in('status', ['new', 'quoted', 'contacted']),
    admin
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .gte('scheduled_start', monthStart)
      .eq('status', 'completed'),
  ]);

  let scheduledPipelineCents = 0;
  for (const row of scheduledRes.data ?? []) {
    const a = row as Record<string, unknown>;
    scheduledPipelineCents += cents(a.base_price_cents) || cents(a.deposit_amount_cents) || 15000;
  }

  const runRate = dayOfMonth > 0 ? currentMonthCents / dayOfMonth : 0;
  const runRateProjection = Math.round(runRate * (dayOfMonth + daysLeft));
  const leadCount = leadsRes.count ?? 0;
  const leadPipelineCents = leadCount * 12000 * 0.25;

  let forecastedMonthCents = runRateProjection + scheduledPipelineCents + Math.round(leadPipelineCents);
  const factors: string[] = [
    `Run rate: $${(runRate / 100).toFixed(0)}/day`,
    `${scheduledRes.data?.length ?? 0} future booking(s) on calendar`,
    `${completedMonthRes.count ?? 0} completed MTD`,
  ];

  if (leadCount > 0) factors.push(`${leadCount} open lead(s) in pipeline`);

  let confidence = 55;
  if ((completedMonthRes.count ?? 0) >= 8) confidence += 15;
  if ((scheduledRes.data?.length ?? 0) >= 3) confidence += 10;
  if (dayOfMonth >= 10) confidence += 10;

  const rainDays = weather.rainWarningDays?.length ?? 0;
  if (rainDays > 0) {
    forecastedMonthCents = Math.round(forecastedMonthCents * (1 - Math.min(0.12, rainDays * 0.04)));
    factors.push(`Weather adjustment: ${rainDays} rainy day(s)`);
    confidence -= 5;
  }

  confidence = Math.min(92, Math.max(45, confidence));

  return {
    currentMonthCents,
    forecastedMonthCents,
    confidencePercent: confidence,
    factors,
  };
}
