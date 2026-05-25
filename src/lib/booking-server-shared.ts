import type { SupabaseClient } from '@supabase/supabase-js';
import { computeBookingPricing, type BookingPricingBreakdown } from '@/lib/booking-pricing';
import { parseBookingAvailabilityConfig } from '@/lib/booking-availability-config';
import {
  applyPromoToBreakdown,
  incrementPromoUse,
  loadPromoByCode,
  validatePromoRow,
  type PromoValidationResult,
} from '@/lib/promo-engine';
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
  const m5 = /null value in column "?([\w]+)"?/i.exec(message);
  if (m5?.[1]) return m5[1];
  return null;
}

/**
 * Strip optional columns / heal drift for almost every Postgres error except hard duplicates.
 * Empty message still retries (strip cycle) so minimal row can be attempted.
 */
export function isRetriableAppointmentInsertError(message: string): boolean {
  if (isDefinitelyFatalAppointmentInsertError(message)) return false;
  return true;
}

export function isDefinitelyFatalAppointmentInsertError(message: string): boolean {
  return /duplicate key value|unique constraint|\b23505\b/i.test(message);
}

function logAppointmentInsertFailure(
  attempt: number,
  err: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  row: Record<string, unknown>,
) {
  console.error('[booking-shared] appointments insert attempt failed', {
    attempt,
    rowKeys: Object.keys(row),
    message: err?.message,
    code: err?.code,
    details: err?.details,
    hint: err?.hint,
  });
}

async function insertAppointmentSelectingTokens(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<{
  data: { id: string; access_token: string } | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
}> {
  const run = async (sel: string) => admin.from('appointments').insert(row).select(sel).single();

  let res = await run('id, access_token');
  if (!res.error && res.data) {
    return { data: res.data as unknown as { id: string; access_token: string }, error: null };
  }
  const msg0 = res.error?.message ?? '';
  if (
    res.error &&
    /access_token|Could not find the 'access_token' column|undefined column:?\s*access_token/i.test(msg0)
  ) {
    const res2 = await run('id');
    if (res2.error || !res2.data) {
      return { data: null, error: res2.error ?? res.error };
    }
    const row2 = res2.data as unknown as { id?: unknown };
    if (typeof row2.id !== 'string') {
      return { data: null, error: res2.error ?? res.error };
    }
    const id = row2.id;
    const tokRow = await admin.from('appointments').select('access_token').eq('id', id).maybeSingle();
    if (tokRow.error || !tokRow.data || tokRow.data.access_token == null) {
      console.error('[booking-shared] read access_token after insert failed', id, tokRow.error?.message);
      return { data: null, error: tokRow.error ?? res2.error ?? res.error };
    }
    return { data: { id, access_token: String(tokRow.data.access_token) }, error: null };
  }
  return { data: null, error: res.error };
}

function shrinkRowToMinimalAppointment(full: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const k of APPOINTMENT_CORE_KEYS) {
    if (k in full && full[k] !== undefined) o[k] = full[k];
  }
  return o;
}

function stripForeignKeyColumnsFromRow(message: string, row: Record<string, unknown>): boolean {
  let changed = false;
  if (
    (/Key \(offer_id\)|table ["']offers["']/i.test(message) || (/offer_id/i.test(message) && /foreign key/i.test(message))) &&
    'offer_id' in row
  ) {
    delete row.offer_id;
    changed = true;
  }
  if (
    (/Key \(customer_id\)|table ["']customers["']/i.test(message) ||
      (/customer_id/i.test(message) && /foreign key/i.test(message))) &&
    'customer_id' in row
  ) {
    delete row.customer_id;
    changed = true;
  }
  return changed;
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

export type ClaimedOfferRow = {
  percent: number;
  fixedCents: number;
  stackableWithSitePromo: boolean;
  offerId: string;
};

const OFFER_SELECT_FULL =
  'id, percent_off, discount_percent, active, stackable, archived, discount_fixed_cents, starts_at, ends_at';

function parseClaimedOfferRow(data: Record<string, unknown> | null): ClaimedOfferRow | null {
  if (!data || !data.active) return null;
  if (data.archived === true) return null;
  const id = typeof data.id === 'string' ? data.id : null;
  if (!id) return null;

  const now = new Date();
  if (typeof data.starts_at === 'string') {
    const s = new Date(data.starts_at);
    if (!Number.isNaN(s.getTime()) && now < s) return null;
  }
  if (typeof data.ends_at === 'string') {
    const e = new Date(data.ends_at);
    if (!Number.isNaN(e.getTime()) && now > e) return null;
  }

  const fixedRaw = data.discount_fixed_cents;
  const fixedCents =
    typeof fixedRaw === 'number' && !Number.isNaN(fixedRaw) && fixedRaw > 0 ? Math.round(fixedRaw) : 0;
  const pct = Number(
    (data as { percent_off?: number; discount_percent?: number }).percent_off ??
      (data as { discount_percent?: number }).discount_percent ??
      0,
  );
  const pctClamped = Math.min(100, Math.max(0, Number.isFinite(pct) ? pct : 0));
  const useFixed = fixedCents > 0;
  if (!useFixed && pctClamped <= 0) return null;

  const stack = (data as { stackable?: boolean }).stackable;
  return {
    percent: useFixed ? 0 : pctClamped,
    fixedCents: useFixed ? fixedCents : 0,
    stackableWithSitePromo: stack !== false,
    offerId: id,
  };
}

export async function loadClaimedOffer(admin: SupabaseClient, offerRef: string | undefined): Promise<ClaimedOfferRow | null> {
  const ref = String(offerRef ?? '').trim();
  if (!ref) return null;

  const byId = async (sel: string) => admin.from('offers').select(sel).eq('id', ref).maybeSingle();

  const bySlug = async (sel: string, slug: string) =>
    admin.from('offers').select(sel).eq('slug', slug.toLowerCase()).maybeSingle();

  if (OFFER_UUID_RE.test(ref)) {
    let { data, error } = await byId(OFFER_SELECT_FULL);
    if (error && isSchemaDriftError(error.message)) {
      ({ data, error } = await byId('id, percent_off, discount_percent, active, stackable'));
      if (!error && data) {
        return parseClaimedOfferRow({ ...(data as unknown as Record<string, unknown>), archived: false });
      }
      return null;
    }
    if (error) {
      console.warn('[booking-shared] loadClaimedOffer id', error.message);
      return null;
    }
    return parseClaimedOfferRow(data as Record<string, unknown> | null);
  }

  let { data, error } = await bySlug(OFFER_SELECT_FULL, ref);
  if (error && isSchemaDriftError(error.message)) {
    ({ data, error } = await bySlug('id, percent_off, discount_percent, active, stackable', ref));
    if (!error && data) {
      return parseClaimedOfferRow({ ...(data as unknown as Record<string, unknown>), archived: false });
    }
    return null;
  }
  if (error) {
    console.warn('[booking-shared] loadClaimedOffer slug', error.message);
    return null;
  }
  return parseClaimedOfferRow(data as Record<string, unknown> | null);
}

/** Per-addon cents keyed by slug/label/name (lowercase). */
export async function sumAddonCentsBySlug(admin: SupabaseClient, selections: string[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {};
  if (selections.length === 0) return map;
  try {
    let { data, error } = await admin.from('addons').select('*').eq('active', true);
    if (error && isSchemaDriftError(error.message)) {
      ({ data, error } = await admin.from('addons').select('slug, name, price_cents').eq('active', true));
    }
    if (error) return map;
    const rows = (data ?? []) as Record<string, unknown>[];
    for (const sel of selections) {
      const key = sel.trim().toLowerCase();
      const hit = rows.find((r) => {
        const slug = typeof r.slug === 'string' ? r.slug.toLowerCase() : '';
        const lab = r.label != null ? String(r.label).trim().toLowerCase() : '';
        const nam = r.name != null ? String(r.name).trim().toLowerCase() : '';
        return slug === key || lab === key || nam === key;
      });
      const cents = hit && typeof hit.price_cents === 'number' && !Number.isNaN(hit.price_cents) ? hit.price_cents : 0;
      if (cents > 0) {
        map[key] = cents;
        const slug = typeof hit?.slug === 'string' ? hit.slug.toLowerCase() : '';
        if (slug) map[slug] = cents;
      }
    }
  } catch {
    return map;
  }
  return map;
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
  'payment_id',
  'technician_id',
  'deposit_percent',
  'assigned_technician_id',
  'stripe_checkout_session_id',
  'stripe_payment_intent_id',
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
  const maxAttempts = 40;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await insertAppointmentSelectingTokens(admin, row);
    if (data && !error) return { data, error: null };

    const errObj = error;
    const msg = errObj?.message ?? '';
    logAppointmentInsertFailure(attempt, errObj, row);

    if (msg && isDefinitelyFatalAppointmentInsertError(msg)) {
      return { data: null, error: msg };
    }
    if (msg && !isRetriableAppointmentInsertError(msg)) {
      return { data: null, error: msg };
    }

    if (stripForeignKeyColumnsFromRow(msg, row)) continue;

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

  const minimal = shrinkRowToMinimalAppointment(payload);
  for (let attempt = 0; attempt < 16; attempt++) {
    const { data, error } = await insertAppointmentSelectingTokens(admin, minimal);
    if (data && !error) return { data, error: null };

    const errObj = error;
    const msg = errObj?.message ?? '';
    logAppointmentInsertFailure(100 + attempt, errObj, minimal);

    if (msg && isDefinitelyFatalAppointmentInsertError(msg)) {
      return { data: null, error: msg };
    }
    if (msg && !isRetriableAppointmentInsertError(msg)) {
      return { data: null, error: msg };
    }

    if (stripForeignKeyColumnsFromRow(msg, minimal)) continue;

    const badCol = extractMissingColumnKey(msg);
    if (badCol && badCol in minimal && !APPOINTMENT_CORE_KEYS.has(badCol)) {
      delete minimal[badCol];
      continue;
    }

    const extras = Object.keys(minimal).filter((k) => !APPOINTMENT_CORE_KEYS.has(k));
    if (extras.length > 0) {
      extras.sort();
      delete minimal[extras[0]!];
      continue;
    }

    break;
  }

  console.error('[booking-shared] insertAppointmentResilient exhausted retries (full + minimal)', {
    payloadKeys: Object.keys(payload),
  });
  return {
    data: null,
    error:
      'We could not save this booking due to a database configuration issue. Please call Gloss Boss ATX.',
  };
}

export type VehicleLineInput = { serviceSlug: string; vehicleClass: string; vehicleDescription: string; vehicleColor?: string };

const ALLOWED_CLASS = new Set(['sedan', 'suv', 'truck', 'suv_truck']);

export type ResolvedVehicleLine = {
  serviceSlug: string;
  vehicleClass: string;
  vehicleDescription: string;
  vehicleColor?: string;
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
      vehicleColor: line.vehicleColor,
      priceCents,
    });
  }

  return { ok: true, resolved, vehicleLineCents };
}

export type QuotePromoMeta = {
  code: string | null;
  applied: PromoValidationResult & { ok: true } | null;
  freePromoApplied: boolean;
  testOneDollar: boolean;
  message: string | null;
};

/** Full quote: vehicles + add-ons + deals + optional offer + promo (single source of truth with UI). */
export async function computeQuoteFromInputs(admin: SupabaseClient, params: {
  lines: VehicleLineInput[];
  addOns: string[];
  offerRef?: string;
  promoCode?: string;
  paymentChoice?: 'deposit' | 'full';
  allowFreeTestPromo?: boolean;
  incrementPromoOnApply?: boolean;
}): Promise<
  | { ok: false; error: string; status: number }
  | {
      ok: true;
      resolved: ResolvedVehicleLine[];
      breakdown: BookingPricingBreakdown;
      claimed: ClaimedOfferRow | null;
      promo: QuotePromoMeta;
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

  const addOnCentsBySlug = await sumAddonCentsBySlug(admin, params.addOns);
  const addOnCentsSum = Object.values(addOnCentsBySlug).reduce((s, n) => s + n, 0);
  const deals = await loadDealConfigForBooking(admin);
  const claimed = await loadClaimedOffer(admin, params.offerRef);
  let breakdown = computeBookingPricing({
    vehicleLineCents: pricedLines.vehicleLineCents,
    addOnCentsSum,
    deals,
    claimedOffer: claimed
      ? {
          percent: claimed.percent,
          fixedCents: claimed.fixedCents,
          stackableWithSitePromo: claimed.stackableWithSitePromo,
        }
      : null,
    depositPercent: params.paymentChoice === 'full' ? 100 : 30,
  });

  if ('kind' in breakdown) {
    return { ok: false, error: 'Invalid pricing', status: 400 };
  }

  const promoCode = String(params.promoCode ?? '').trim().toUpperCase();
  const promoMeta: QuotePromoMeta = {
    code: promoCode || null,
    applied: null,
    freePromoApplied: false,
    testOneDollar: false,
    message: null,
  };

  if (promoCode) {
    const promoRow = await loadPromoByCode(admin, promoCode);
    if (!promoRow) {
      return { ok: false, error: 'Invalid or inactive promo code.', status: 400 };
    }
    const baseEligibleCents = Math.max(
      0,
      breakdown.afterMultiCarVehicleCents - breakdown.offerDiscountCents - breakdown.websitePromoDiscountCents,
    );
    const validated = validatePromoRow(promoRow, {
      code: promoCode,
      paymentChoice: params.paymentChoice,
      vehicleLines: pricedLines.resolved.map((r) => ({ serviceSlug: r.serviceSlug, vehicleClass: r.vehicleClass })),
      vehicleLineCents: pricedLines.vehicleLineCents,
      baseEligibleCents,
      addOnSubtotalCents: breakdown.addOnSubtotalCents,
      orderCents: breakdown.prePromoCents,
      addOnSlugs: params.addOns,
      addOnCentsBySlug,
      allowFreeTestPromo: params.allowFreeTestPromo,
    });
    if (!validated.ok) {
      return { ok: false, error: validated.error, status: 400 };
    }
    breakdown = applyPromoToBreakdown(breakdown, validated);
    promoMeta.applied = validated;
    promoMeta.freePromoApplied = validated.comped;
    promoMeta.testOneDollar = validated.testOneDollar;
    promoMeta.message = validated.message;
    if (params.incrementPromoOnApply) {
      await incrementPromoUse(admin, promoCode);
    }
  }

  return { ok: true, resolved: pricedLines.resolved, breakdown, claimed, promo: promoMeta };
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
