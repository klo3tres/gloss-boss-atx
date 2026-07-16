import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { DEFAULT_WEATHER_CAMPAIGN_SETTINGS, loadWeatherCampaignSettings } from '@/lib/titan/weather-campaign-engine';
import { upsertSiteSetting } from '@/lib/site-settings-upsert';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });
  return NextResponse.json(await loadWeatherCampaignSettings(admin));
}

export async function PUT(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service role unavailable' }, { status: 503 });

  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await loadWeatherCampaignSettings(admin);
  const bounded = (key: string, fallback: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Number(input[key] ?? fallback) || fallback));
  const settings = {
    ...DEFAULT_WEATHER_CAMPAIGN_SETTINGS,
    ...current,
    recommendationsEnabled: input.recommendationsEnabled !== false,
    autoDraftEnabled: input.autoDraftEnabled !== false,
    autoSendEnabled: input.autoSendEnabled === true,
    requireOwnerApproval: input.requireOwnerApproval !== false,
    minimumHoursAfterRain: bounded('minimumHoursAfterRain', current.minimumHoursAfterRain, 0, 72),
    minimumRainyDays: bounded('minimumRainyDays', current.minimumRainyDays, 1, 7),
    maxCampaignsPerWeek: bounded('maxCampaignsPerWeek', current.maxCampaignsPerWeek, 1, 7),
    cooldownDays: bounded('cooldownDays', current.cooldownDays, 1, 90),
    minimumOpenCapacity: bounded('minimumOpenCapacity', current.minimumOpenCapacity, 1, 25),
    maxMessages: bounded('maxMessages', current.maxMessages, 1, 500),
    quietHoursStart: String(input.quietHoursStart ?? current.quietHoursStart).slice(0, 5),
    quietHoursEnd: String(input.quietHoursEnd ?? current.quietHoursEnd).slice(0, 5),
    eligibleServiceAreas: Array.isArray(input.eligibleServiceAreas) ? input.eligibleServiceAreas.map(String).filter(Boolean).slice(0, 30) : current.eligibleServiceAreas,
    eligibleSegments: Array.isArray(input.eligibleSegments) ? input.eligibleSegments.map(String).filter(Boolean).slice(0, 30) : current.eligibleSegments,
    channels: Array.isArray(input.channels) ? input.channels.filter((item): item is 'sms' | 'email' => item === 'sms' || item === 'email') : current.channels,
    defaultPromotion: input.defaultPromotion ? String(input.defaultPromotion).slice(0, 80) : null,
    promoStacking: input.promoStacking === 'allowed' ? 'allowed' as const : 'blocked' as const,
    manualPollenSpike: input.manualPollenSpike === true,
  };
  if (settings.autoSendEnabled && settings.requireOwnerApproval) {
    settings.autoSendEnabled = false;
  }
  const result = await upsertSiteSetting(admin, { key: 'weather_campaign_settings', value: JSON.stringify(settings) });
  return NextResponse.json(result.ok ? { ok: true, settings } : { error: result.error }, { status: result.ok ? 200 : 500 });
}
