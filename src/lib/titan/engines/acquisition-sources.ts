import type { SupabaseClient } from '@supabase/supabase-js';
import { monthKeyChicago } from '@/lib/chicago-time';
import { startOfMonthIso } from '@/lib/revenue-metrics';

export type AcquisitionSourceRow = {
  id: string;
  label: string;
  leadsCount: number;
  bookingsCount: number;
  revenueCents: number;
  verdict: 'scale' | 'maintain' | 'reduce';
};

const SOURCE_TAXONOMY: { id: string; label: string; patterns: RegExp[] }[] = [
  { id: 'facebook', label: 'Facebook Groups', patterns: [/facebook|fb|meta|instagram/i] },
  { id: 'nextdoor', label: 'Nextdoor', patterns: [/nextdoor/i] },
  { id: 'referral', label: 'Referrals', patterns: [/referr|word.of.mouth/i] },
  { id: 'apartments', label: 'Apartments / HOA', patterns: [/apartment|hoa|property|resident/i, /titan_radar/i] },
  { id: 'fleet', label: 'Fleet', patterns: [/fleet/i] },
  { id: 'realtor', label: 'Realtors', patterns: [/realtor|real.estate/i] },
  { id: 'car_clubs', label: 'Car Clubs', patterns: [/car.club|bmw|porsche|meet/i] },
  { id: 'titan_scanner', label: 'Titan Opportunity Scanner', patterns: [/titan_opportunity|buying_signal/i] },
  { id: 'titan_widget', label: 'Titan Site Widget', patterns: [/titan_site_widget|titan_widget/i] },
  { id: 'organic', label: 'Organic / Website', patterns: [/organic|web|book|google/i] },
];

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function classifySource(raw: string): string {
  for (const src of SOURCE_TAXONOMY) {
    if (src.patterns.some((p) => p.test(raw))) return src.id;
  }
  return 'other';
}

export async function buildAcquisitionSourcesBoard(admin: SupabaseClient): Promise<{
  rows: AcquisitionSourceRow[];
  headline: string;
  tablesReady: boolean;
}> {
  const monthStart = startOfMonthIso();
  const period = monthKeyChicago();

  const [leadsRes, apptsRes] = await Promise.all([
    admin.from('leads').select('id, lead_source, marketing_channel, status').gte('created_at', monthStart).limit(2000),
    admin
      .from('appointments')
      .select('id, lead_source, marketing_channel, utm_source, booking_source, base_price_cents, status')
      .gte('created_at', monthStart)
      .limit(2000),
  ]);

  const agg = new Map<string, { leads: number; bookings: number; revenue: number }>();
  for (const src of SOURCE_TAXONOMY) {
    agg.set(src.id, { leads: 0, bookings: 0, revenue: 0 });
  }
  agg.set('other', { leads: 0, bookings: 0, revenue: 0 });

  for (const row of leadsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const raw = `${str(r.marketing_channel)} ${str(r.lead_source)}`;
    const id = classifySource(raw);
    const bucket = agg.get(id) ?? { leads: 0, bookings: 0, revenue: 0 };
    bucket.leads += 1;
    agg.set(id, bucket);
  }

  for (const row of apptsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const raw = `${str(r.marketing_channel)} ${str(r.lead_source)} ${str(r.utm_source)} ${str(r.booking_source)}`;
    const id = classifySource(raw);
    const bucket = agg.get(id) ?? { leads: 0, bookings: 0, revenue: 0 };
    if (str(r.status) === 'completed' || str(r.status) === 'scheduled') {
      bucket.bookings += 1;
      bucket.revenue += Number(r.base_price_cents ?? 0);
    }
    agg.set(id, bucket);
  }

  const rows: AcquisitionSourceRow[] = SOURCE_TAXONOMY.map((src) => {
    const data = agg.get(src.id) ?? { leads: 0, bookings: 0, revenue: 0 };
    let verdict: AcquisitionSourceRow['verdict'] = 'maintain';
    if (data.revenue >= 50000 || data.bookings >= 3) verdict = 'scale';
    else if (data.leads >= 5 && data.bookings === 0) verdict = 'reduce';
    return {
      id: src.id,
      label: src.label,
      leadsCount: data.leads,
      bookingsCount: data.bookings,
      revenueCents: data.revenue,
      verdict,
    };
  }).sort((a, b) => b.revenueCents - a.revenueCents);

  const top = rows.find((r) => r.revenueCents > 0);
  const headline = top
    ? `${top.label} produced $${(top.revenueCents / 100).toFixed(0)} this month — ${period}`
    : 'Log lead sources to see which channels produce revenue';

  return { rows, headline, tablesReady: !leadsRes.error };
}
