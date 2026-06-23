import type { TitanBriefing } from '@/lib/titan-briefing';

export type RevenueForecastEngine = {
  thisWeekCents: number;
  nextWeekCents: number;
  thisMonthCents: number;
  confidencePercent: number;
  factors: string[];
};

export function buildRevenueForecast(briefing: TitanBriefing): RevenueForecastEngine {
  const forecast = briefing.intelligence.forecast;
  const month = forecast.forecastedMonthCents;
  const daysLeft = briefing.forecast.daysLeftInMonth;
  const daily = daysLeft > 0 ? month / (30 - daysLeft + daysLeft) : month / 30;
  const weekRate = Math.round(daily * 7);
  const scheduled = briefing.insights.revenueTodayCents;

  return {
    thisWeekCents: weekRate + scheduled,
    nextWeekCents: Math.round(weekRate * 1.1),
    thisMonthCents: month,
    confidencePercent: forecast.confidencePercent,
    factors: forecast.factors,
  };
}
