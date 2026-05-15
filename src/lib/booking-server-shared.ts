import type { SupabaseClient } from '@supabase/supabase-js';
import { computeBookingPricing, type BookingPricingBreakdown } from '@/lib/booking-pricing';
import { parseBookingAvailabilityConfig } from '@/lib/booking-availability-config';
import { parseDealConfig } from '@/lib/public-site-data';
import { safePriceCentsForBooking, type PriceRowInput } from '@/lib/safe-price-resolver';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';

export function isSchemaDriftError(message: string): boolean {
  return /column|does not exist|schema cache|Could not find|undefined column/i.test(message);
}

export function extractMissingColumnKey(message: string): string | null {
  const m1 = /Could not find the '([^']+)' column/i.exec(message);
  if (m1?.[1]) return m1[1];
  const m3 = /column\s+["']?([\w]+)["']?\s+does not exist/i.exec(message);
  if (m3?.[1]) return m3[1];
  const m4 = /undefined column:?\s*([\w]+)/i.exec(message);
  if (m4?.[1]) return m4[1];
  return null;
}

export async function loadBookingAvailabilityRules(admin: SupabaseClient) {
  try {
    const { data } = await admin.from('site_settings').select('value').eq('key', 'booking_availability').maybeSingle();
    if (!data?.value) return parseBookingAvailabilityConfig(null);
    try {
      return parseBookingAvailabilityConfig(JSON.parse(String(data.value)));
    } catch {
      return parseBookingAvailabilityConfig(null);
    }
  } catch {
    return parseBookingAvailabilityConfig(null);
  }
}

export async function loadDealConfigForBooking(admin: SupabaseClient) {
  const { data } = await admin.from('homepage_content').select('value').eq('key', 'deal_config').maybeSingle();
  return parseDealConfig(data?.value ?? null);
}

export const OFFER_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClaimedOfferRow = { percent: number; stackableWithSitePromo: boolean; offerId: string };

export async function loadClaimedOffer(admin: SupabaseClient, offerRef: string | undefined): Promise<ClaimedOfferRow | null> {
  const ref = String(offerRef ?? '').trim();
  if (!ref) return null;

  const parseRow = (data: Record<string, unknown> | null) => {
    if (!data || !data.active) return null;
    const id = typeof data.id === 'string' ? data.id : null;
    if (!id) return null;
    const pct = Number(
      (data as { percent_off?: number; discount_percent?: number }).percent_off ??
        (data as { discount_percent?: number }).discount_percent ??
        0,
    );
    if (!Number.isFinite(pct) || pct <= 0) return null;
    const stack = (data as { stackable?: boolean }).stackable;
    return { percent: pct, stackableWithSitePromo: stack !== false, offerId: id };
  };

  const byId = async (sel: string) =>
    admin.from('offers').select(sel).eq('id', ref).maybeSingle();

  const bySlug = async (sel: string, slug: string) =>
    admin.from('offers').select(sel).eq('slug', slug.toLowerCase()).maybeSingle();

  if (OFFER_UUID_RE.test(ref)) {
    let { data, error } = await byId('id, percent_off, discount_percent, active, stackable');
    if (error && isSchemaDriftError(error.message)) {
      ({ data, error } = await byId('id, percent_off, discount_percent, active'));
      if (!error && data) {
        return parseRow({ ...(data as unknown as Record<string, unknown>), stackable: true });
      }
      return null;
    }
    if (error) {
      console.warn('[booking-shared] loadClaimedOffer id', error.message);
      return null;
    }
    return parseRow(data as Record<string, unknown> | null);
  }

  let { data, error } = await bySlug('id, percent_off, discount_percent, active, stackable', ref);
  if (error && isSchemaDriftError(error.message)) {
    ({ data, error } = await bySlug('id, percent_off, discount_percent, active', ref));
    if (!error && data) {
      return parseRow({ ...(data as unknown as Record<string, unknown>), stackable: true });
    }
    return null;
  }
  if (error) {
    console.warn('[booking-shared] loadClaimedOffer slug', error.message);
    return null;
  }
  return parseRow(data as Record<string, unknown> | null);
}

export async function sumSelectedAddonCents(admin: SupabaseClient, selections: string[]): Promise<number> {
  if (selections.length === 0) return 0;
  try {
    let { data, error } = await admin.from('addons').select('*').eq('active', true);
    if (error && isSchemaDriftError(error.message)) {
      ({ data, error } = await admin.from('addons').select('slug, name, price_cents').eq('active', true));
    }
    if (error && isSchemaDriftError(error.message)) {
      ({ data, error } = await admin.from('addons').select('slug, price_cents').eq('active', true));
    }
    if (error) {
      console.warn('[booking-shared] addons unavailable; 0 add-on cents', error.message);
      return 0;
    }
    const rows = (data ?? []) as Record<string, unknown>[];
    let sum = 0;
    for (const sel of selections) {
      const key = sel.trim().toLowerCase();
      const hit = rows.find((r) => {
        const slug = typeof r.slug === 'string' ? r.slug.toLowerCase() : '';
        const lab = r.label != null ? String(r.label).trim().toLowerCase() : '';
        const nam = r.name != null ? String(r.name).trim().toLowerCase() : '';
        return slug === key || lab === key || nam === key;
      });
      const cents = hit && typeof hit.price_cents === 'number' && !Number.isNaN(hit.price_cents) ? hit.price_cents : 0;
      if (cents > 0) sum += cents;
    }
    return sum;
  } catch (e) {
    console.warn('[booking-shared] sumSelectedAddonCents', e);
    return 0;
  }
}

export async function loadServicePricesForService(admin: SupabaseClient, serviceId: string): Promise<PriceRowInput[]> {
  const { data } = await admin.from('service_prices').select('*').eq('service_id', serviceId);
  const rows: PriceRowInput[] = [];
  for (const row of data ?? []) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const sid = typeof r.service_id === 'string' ? r.service_id : serviceId;
    const vc = typeof r.vehicle_class === 'string' ? r.vehicle_class : '';
    const pc = r.price_cents;
    if (typeof pc === 'number' && !Number.isNaN(pc)) rows.push({ service_id: sid, vehicle_class: vc, price_cents: pc });
  }
  return rows;
}

/** Columns we try hard to keep; others may be stripped on drift (deposit_percent has DB default). */
const APPOINTMENT_CORE_KEYS = new Set([
  'guest_email',
  'guest_phone',
  'guest_name',
  'vehicle_description',
  'service_slug',
  'vehicle_class',
  'base_price_cents',
  'deposit_amount_cents',
  'scheduled_start',
  'status',
]);

const APPOINTMENT_STRIP_ORDER: string[] = [
  'offer_id',
  'booking_source',
  'booking_add_ons',
  'booking_vehicles',
  'notes',
  'customer_id',
  'deposit_percent',
  'assigned_technician_id',
  'stripe_checkout_session_id',
  'created_by',
  'stripe_checkout_kind',
  'field_invoice_paid_at',
  'intake_completed_at',
  'job_started_at',
  'job_completed_at',
];

export async function insertAppointmentResilient(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ data: { id: string; access_token: string } | null; error: string | null }> {
  let row: Record<string, unknown> = { ...payload };
  const maxAttempts = 48;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await admin.from('appointments').insert(row).select('id, access_token').single();
    if (!res.error && res.data) {
      return { data: res.data as { id: string; access_token: string }, error: null };
    }
    const msg = res.error?.message ?? '';
    if (!isSchemaDriftError(msg)) {
      return { data: null, error: msg || 'Could not create booking' };
    }

    const badCol = extractMissingColumnKey(msg);
    if (badCol && badCol in row && !APPOINTMENT_CORE_KEYS.has(badCol)) {
      delete row[badCol];
      continue;
    }

    const nextStrip = APPOINTMENT_STRIP_ORDER.find((k) => k in row);
    if (nextStrip) {
      delete row[nextStrip];
      continue;
    }

    const extras = Object.keys(row).filter((k) => !APPOINTMENT_CORE_KEYS.has(k));
    if (extras.length > 0) {
      extras.sort();
      delete row[extras[0]!];
      continue;
    }

    break;
  }

  console.error('[booking-shared] insertAppointmentResilient exhausted retries', payload);
  return {
    data: null,
    error:
      'We could not save this booking due to a database configuration issue. Please call Gloss Boss ATX.',
  };
}

export type VehicleLineInput = { serviceSlug: string; vehicleClass: string; vehicleDescription: string };

const ALLOWED_CLASS = new Set(['sedan', 'suv_truck']);

export type ResolvedVehicleLine = {
  serviceSlug: string;
  vehicleClass: string;
  vehicleDescription: string;
  priceCents: number;
};

/**
 * Resolve per-line prices from catalog (same rules as /api/bookings).
 */
export async function resolveVehicleLinesPricing(
  admin: SupabaseClient,
  lines: VehicleLineInput[],
): Promise<
  | { ok: false; error: string; status: number }
  | { ok: true; resolved: ResolvedVehicleLine[]; vehicleLineCents: number[] }
> {
  const vehicleLineCents: number[] = [];
  const resolved: ResolvedVehicleLine[] = [];

  for (const line of lines) {
    const { data: service, error: svcErr } = await admin
      .from('services')
      .select('id, slug')
      .eq('slug', line.serviceSlug)
      .eq('active', true)
      .maybeSingle();

    if (svcErr || !service) {
      return { ok: false, error: `Invalid service: ${line.serviceSlug}`, status: 400 };
    }

    const priceRows = await loadServicePricesForService(admin, service.id);
    const vehicleClass = normalizeVehicleClass(line.vehicleClass);
    const priceCents = safePriceCentsForBooking(
      { slug: line.serviceSlug, serviceId: service.id },
      vehicleClass,
      priceRows,
    );
    if (priceCents == null) {
      return {
        ok: false,
        error:
          line.serviceSlug === 'ceramic-coating'
            ? 'Ceramic coating requires a consultation — call us to book.'
            : `Pricing not available for ${line.serviceSlug} / ${line.vehicleClass}.`,
        status: 400,
      };
    }

    vehicleLineCents.push(priceCents);
    resolved.push({
      serviceSlug: line.serviceSlug,
      vehicleClass,
      vehicleDescription: line.vehicleDescription,
      priceCents,
    });
  }

  return { ok: true, resolved, vehicleLineCents };
}

/** Full quote: vehicles + add-ons + deals + optional offer (single source of truth with UI). */
export async function computeQuoteFromInputs(admin: SupabaseClient, params: {
  lines: VehicleLineInput[];
  addOns: string[];
  offerRef?: string;
}): Promise<
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      resolved: ResolvedVehicleLine[];
      breakdown: BookingPricingBreakdown;
      claimed: ClaimedOfferRow | null;
    }
> {
  if (
    params.lines.length === 0 ||
    params.lines.some(
      (l) =>
        !l.serviceSlug ||
        !l.vehicleClass ||
        !l.vehicleDescription ||
        !ALLOWED_CLASS.has(normalizeVehicleClass(l.vehicleClass)),
    )
  ) {
    return { ok: false, error: 'Missing vehicle lines or invalid vehicle class', status: 400 };
  }

  const pricedLines = await resolveVehicleLinesPricing(admin, params.lines);
  if (!pricedLines.ok) return pricedLines;

  const addOnCentsSum = await sumSelectedAddonCents(admin, params.addOns);
  const deals = await loadDealConfigForBooking(admin);
  const claimed = await loadClaimedOffer(admin, params.offerRef);
  const breakdown = computeBookingPricing({
    vehicleLineCents: pricedLines.vehicleLineCents,
    addOnCentsSum,
    deals,
    claimedOffer: claimed ? { percent: claimed.percent, stackableWithSitePromo: claimed.stackableWithSitePromo } : null,
    depositPercent: 30,
  });

  if ('kind' in breakdown) {
    return { ok: false, error: 'Invalid pricing', status: 400 };
  }

  return { ok: true, resolved: pricedLines.resolved, breakdown, claimed };
}

/** Field invoices charge 100% of quoted total (deposit engine == full total). */
export function breakdownForFieldFullPay(bd: BookingPricingBreakdown): BookingPricingBreakdown {
  const finalTotalCents = bd.finalTotalCents;
  return {
    ...bd,
    depositPercent: 100,
    depositCents: finalTotalCents,
  };
}
