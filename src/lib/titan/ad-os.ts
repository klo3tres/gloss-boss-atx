import type { SupabaseClient } from '@supabase/supabase-js';
import { monthKeyChicago } from '@/lib/chicago-time';
import { fetchPaymentsSince, startOfMonthIso, summarizePayments } from '@/lib/revenue-metrics';

export type ChannelAttribution = {
  channel: string;
  label: string;
  spendCents: number;
  revenueCents: number;
  leadCount: number;
  roas: number | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function normalizeChannel(raw: string): string {
  const s = raw.toLowerCase();
  if (/facebook|fb|meta|instagram|ig/.test(s)) return 'facebook';
  if (/google|gclid|ppc|ads/.test(s)) return 'google';
  if (/referr|word.of.mouth|friend/.test(s)) return 'referral';
  if (/tiktok/.test(s)) return 'tiktok';
  if (/youtube|yt/.test(s)) return 'youtube';
  if (/titan|b2b|radar|fleet/.test(s)) return 'b2b';
  if (/field|tech/.test(s)) return 'field';
  if (/online|web|book/.test(s)) return 'organic';
  return s || 'unknown';
}

const CHANNEL_LABELS: Record<string, string> = {
  facebook: 'Facebook / Meta',
  google: 'Google Ads',
  referral: 'Referral',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  b2b: 'B2B / Titan Radar',
  field: 'Field / Tech',
  organic: 'Organic / Website',
  unknown: 'Unattributed',
};

export async function loadAdAttribution(admin: SupabaseClient, periodKey?: string): Promise<{
  channels: ChannelAttribution[];
  tablesReady: boolean;
}> {
  const period = periodKey ?? monthKeyChicago();
  const monthStart = startOfMonthIso();
  const now = new Date().toISOString();

  const spendProbe = await admin.from('marketing_spend').select('id').limit(1);
  const tablesReady = !spendProbe.error;

  const [spendRes, leadsRes, apptsRes, payments] = await Promise.all([
    tablesReady
      ? admin.from('marketing_spend').select('channel, spend_cents').eq('period_key', period)
      : Promise.resolve({ data: [] }),
    admin
      .from('leads')
      .select('id, lead_source, marketing_channel, status, created_at')
      .gte('created_at', monthStart)
      .limit(2000),
    admin
      .from('appointments')
      .select('id, marketing_channel, utm_source, booking_source, base_price_cents, created_at')
      .gte('created_at', monthStart)
      .limit(2000),
    fetchPaymentsSince(admin, monthStart, now),
  ]);

  const paymentSummary = summarizePayments(payments, { excludeTest: true, fromIso: monthStart, toIso: now });
  const totalRevenue = paymentSummary.grossCents;

  const channelRevenue = new Map<string, number>();
  const channelLeads = new Map<string, number>();
  const spendByChannel = new Map<string, number>();

  for (const row of spendRes.data ?? []) {
    const ch = normalizeChannel(str((row as { channel?: string }).channel));
    spendByChannel.set(ch, (spendByChannel.get(ch) ?? 0) + cents((row as { spend_cents?: number }).spend_cents));
  }

  for (const row of leadsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const ch = normalizeChannel(str(r.marketing_channel) || str(r.lead_source));
    channelLeads.set(ch, (channelLeads.get(ch) ?? 0) + 1);
  }

  for (const row of apptsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const ch = normalizeChannel(str(r.marketing_channel) || str(r.utm_source) || str(r.booking_source));
    const slice = Math.round(totalRevenue / Math.max(1, (apptsRes.data ?? []).length));
    channelRevenue.set(ch, (channelRevenue.get(ch) ?? 0) + slice);
  }

  if (channelRevenue.size === 0 && totalRevenue > 0) {
    channelRevenue.set('organic', totalRevenue);
  }

  const allChannels = new Set([...spendByChannel.keys(), ...channelRevenue.keys(), ...channelLeads.keys()]);

  const channels: ChannelAttribution[] = [...allChannels].map((channel) => {
    const spend = spendByChannel.get(channel) ?? 0;
    const revenue = channelRevenue.get(channel) ?? 0;
    return {
      channel,
      label: CHANNEL_LABELS[channel] ?? channel,
      spendCents: spend,
      revenueCents: revenue,
      leadCount: channelLeads.get(channel) ?? 0,
      roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : null,
    };
  });

  return { channels: channels.sort((a, b) => b.revenueCents - a.revenueCents), tablesReady };
}

export async function upsertMarketingSpend(
  admin: SupabaseClient,
  channel: string,
  periodKey: string,
  spendCents: number,
) {
  const now = new Date().toISOString();
  await admin.from('marketing_spend').upsert(
    {
      channel: normalizeChannel(channel),
      period_key: periodKey,
      spend_cents: spendCents,
      updated_at: now,
    },
    { onConflict: 'channel,period_key' },
  );
}
