import type { SupabaseClient } from '@supabase/supabase-js';

export type TitanOffer = {
  id: string;
  name: string;
  territory: string | null;
  serviceFocus: string | null;
  discountLabel: string | null;
  promoCode: string | null;
  status: string;
  leadsCount: number;
  bookingsCount: number;
  revenueCents: number;
  outreachSms: string;
  worked: boolean | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function loadOffers(admin: SupabaseClient): Promise<{ offers: TitanOffer[]; tablesReady: boolean }> {
  const probe = await admin.from('titan_offers').select('id').limit(1);
  if (probe.error) {
    return { offers: defaultOfferIdeas(), tablesReady: false };
  }

  const { data } = await admin.from('titan_offers').select('*').order('created_at', { ascending: false }).limit(12);

  if (!data?.length) {
    return { offers: defaultOfferIdeas(), tablesReady: true };
  }

  return {
    offers: data.map(mapOffer),
    tablesReady: true,
  };
}

function mapOffer(row: Record<string, unknown>): TitanOffer {
  const bookings = Number(row.bookings_count ?? 0);
  const revenue = Number(row.revenue_cents ?? 0);
  return {
    id: str(row.id),
    name: str(row.name),
    territory: str(row.territory) || null,
    serviceFocus: str(row.service_focus) || null,
    discountLabel: str(row.discount_label) || null,
    promoCode: str(row.promo_code) || null,
    status: str(row.status),
    leadsCount: Number(row.leads_count ?? 0),
    bookingsCount: bookings,
    revenueCents: revenue,
    outreachSms: str(row.outreach_sms),
    worked: bookings > 0 ? true : str(row.status) === 'ended' ? false : null,
  };
}

function defaultOfferIdeas(): TitanOffer[] {
  const book = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://glossbossatx.com/book';
  return [
    {
      id: 'idea-georgetown',
      name: 'Georgetown SUV Interior Week',
      territory: 'Georgetown',
      serviceFocus: 'SUV interior detail',
      discountLabel: '$25 off interior',
      promoCode: 'GTOWN25',
      status: 'draft',
      leadsCount: 0,
      bookingsCount: 0,
      revenueCents: 0,
      outreachSms: `Georgetown SUV owners — Interior Detail Week! $25 off this week only. Book: ${book} Code GTOWN25`,
      worked: null,
    },
    {
      id: 'idea-fleet-friday',
      name: 'Fleet Friday',
      territory: 'Round Rock / Pflugerville',
      serviceFocus: 'Fleet maintenance wash',
      discountLabel: 'First fleet vehicle free',
      promoCode: 'FLEETFRI',
      status: 'draft',
      leadsCount: 0,
      bookingsCount: 0,
      revenueCents: 0,
      outreachSms: `Fleet Friday — first vehicle detailed free for new fleet accounts. Reply FLEET for a quote.`,
      worked: null,
    },
  ];
}

export async function createOffer(
  admin: SupabaseClient,
  input: {
    name: string;
    territory?: string;
    serviceFocus?: string;
    discountLabel?: string;
    promoCode?: string;
    outreachSms: string;
  },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const probe = await admin.from('titan_offers').select('id').limit(1);
  if (probe.error) return { ok: false, error: 'Migration 000096 required' };

  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('titan_offers')
    .insert({
      name: input.name,
      territory: input.territory ?? null,
      service_focus: input.serviceFocus ?? null,
      discount_label: input.discountLabel ?? null,
      promo_code: input.promoCode ?? null,
      outreach_sms: input.outreachSms,
      status: 'active',
      starts_at: now,
      updated_at: now,
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: str(data?.id) };
}

export async function activateOffer(admin: SupabaseClient, offerId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from('titan_offers').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', offerId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
