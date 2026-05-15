import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultServicePackages } from '@/lib/site-config';

export type FallbackServiceRow = { id: string; slug: string; title: string; subtitle: string | null; sort_order: number };
export type FallbackPriceRow = { service_id: string; vehicle_class: string; price_cents: number };

/** Deterministic 12 hex chars for UUID tail (stable per slug). */
function slugToUuidTail12(slug: string): string {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = (h >>> 0).toString(16).padStart(8, '0');
  const b = (Math.imul(h, 709607) >>> 0).toString(16).padStart(8, '0');
  return (a + b).slice(0, 12).padEnd(12, '0');
}

/** Stable pseudo-UUID per slug so client cache + UI stay consistent across reloads. */
export function fallbackServiceIdForSlug(slug: string): string {
  return `fb000000-0000-4000-8000-${slugToUuidTail12(slug)}`;
}

/** Slugs that may legitimately have no numeric online quote (consultation-only packages). */
const BOOKING_OPTIONAL_QUOTE_SLUGS = new Set(['ceramic-coating']);

const STABLE_VEHICLE_CLASSES = ['sedan', 'suv', 'truck', 'suv_truck'] as const;

/** Marketing default cents for a package slug + vehicle class (null = no default, e.g. consultation-only). */
export function centsForSlugVehicleFromDefaults(slug: string, vehicleClass: string): number | null {
  const pkg = defaultServicePackages.find((p) => p.id === slug);
  if (!pkg) return null;
  if (vehicleClass === 'sedan' && pkg.sedanPrice != null) return Math.round(pkg.sedanPrice * 100);
  const large = pkg.truckPrice ?? pkg.suvPrice ?? pkg.suvTruckPrice;
  if (large != null && (vehicleClass === 'suv' || vehicleClass === 'truck' || vehicleClass === 'suv_truck')) {
    return Math.round(large * 100);
  }
  return null;
}

function pickDbPriceCents(dbPrices: FallbackPriceRow[], serviceId: string, cls: string): number | undefined {
  const direct = dbPrices.find((p) => p.service_id === serviceId && p.vehicle_class === cls);
  if (direct && typeof direct.price_cents === 'number' && !Number.isNaN(direct.price_cents) && direct.price_cents > 0) {
    return direct.price_cents;
  }
  if (cls === 'suv' || cls === 'truck') {
    const leg = dbPrices.find((p) => p.service_id === serviceId && p.vehicle_class === 'suv_truck');
    if (leg && typeof leg.price_cents === 'number' && !Number.isNaN(leg.price_cents) && leg.price_cents > 0) {
      return leg.price_cents;
    }
  }
  return undefined;
}

/**
 * Deterministic join of live `services` + `service_prices` by `service_id`.
 * Missing DB prices are filled from embedded marketing defaults by **slug** (never drops live service rows).
 * Used by public site-data, `/api/services`, and booking — avoids flicker from overwriting live rows with partial merges.
 */
export function mergeServicesWithPricesStable(
  dbServices: FallbackServiceRow[],
  dbPrices: FallbackPriceRow[],
): { services: FallbackServiceRow[]; prices: FallbackPriceRow[] } {
  if (!dbServices.length) {
    const fb = getLocalFallbackCatalog();
    return { services: [...fb.services], prices: [...fb.prices] };
  }

  const dedup = new Map<string, FallbackPriceRow>();

  for (const s of dbServices) {
    for (const cls of STABLE_VEHICLE_CLASSES) {
      const fromDb = pickDbPriceCents(dbPrices, s.id, cls);
      const fromDef = fromDb ?? centsForSlugVehicleFromDefaults(s.slug, cls);
      if (fromDef == null || Number.isNaN(fromDef) || fromDef <= 0) continue;
      const row: FallbackPriceRow = { service_id: s.id, vehicle_class: cls, price_cents: Math.round(fromDef) };
      dedup.set(`${row.service_id}|${row.vehicle_class}`, row);
    }
  }

  return { services: [...dbServices], prices: [...dedup.values()] };
}

/**
 * When `service_prices` is missing or empty, attach marketing-default cents to **real** service UUIDs by slug match.
 */
export function mergeFallbackPricesByServiceSlug(services: { id: string; slug: string }[]): FallbackPriceRow[] {
  const prices: FallbackPriceRow[] = [];
  for (const s of services) {
    const pkg = defaultServicePackages.find((p) => p.id === s.slug);
    if (!pkg) continue;
    if (pkg.sedanPrice != null) {
      prices.push({ service_id: s.id, vehicle_class: 'sedan', price_cents: Math.round(pkg.sedanPrice * 100) });
    }
    const large = pkg.truckPrice ?? pkg.suvPrice ?? pkg.suvTruckPrice;
    if (large != null) {
      const cents = Math.round(large * 100);
      prices.push({ service_id: s.id, vehicle_class: 'suv', price_cents: cents });
      prices.push({ service_id: s.id, vehicle_class: 'truck', price_cents: cents });
      prices.push({ service_id: s.id, vehicle_class: 'suv_truck', price_cents: cents });
    }
  }
  return prices;
}

export function servicesHaveQuotesForBooking(services: { id: string; slug: string }[], prices: FallbackPriceRow[]): boolean {
  for (const s of services) {
    if (BOOKING_OPTIONAL_QUOTE_SLUGS.has(s.slug)) continue;
    const rows = prices.filter((p) => p.service_id === s.id);
    if (rows.length === 0) return false;
    const classes = new Set(rows.map((p) => p.vehicle_class));
    const okSedan = classes.has('sedan');
    const okLarge = classes.has('suv_truck') || classes.has('suv') || classes.has('truck');
    if (!okSedan && !okLarge) return false;
  }
  return true;
}

/**
 * Offline / disaster sample catalog (matches marketing defaults).
 * Service IDs are synthetic — booking with this catalog should stay disabled (`canBookOnline: false`).
 */
export function getLocalFallbackCatalog(): { services: FallbackServiceRow[]; prices: FallbackPriceRow[] } {
  const services: FallbackServiceRow[] = defaultServicePackages.map((p, i) => ({
    id: fallbackServiceIdForSlug(p.id),
    slug: p.id,
    title: p.title,
    subtitle: p.subtitle,
    sort_order: (i + 1) * 10,
  }));

  const prices: FallbackPriceRow[] = [];
  for (const p of defaultServicePackages) {
    const sid = fallbackServiceIdForSlug(p.id);
    if (p.sedanPrice != null) {
      prices.push({ service_id: sid, vehicle_class: 'sedan', price_cents: Math.round(p.sedanPrice * 100) });
    }
    const large = p.truckPrice ?? p.suvPrice ?? p.suvTruckPrice;
    if (large != null) {
      const cents = Math.round(large * 100);
      prices.push({ service_id: sid, vehicle_class: 'suv', price_cents: cents });
      prices.push({ service_id: sid, vehicle_class: 'truck', price_cents: cents });
      prices.push({ service_id: sid, vehicle_class: 'suv_truck', price_cents: cents });
    }
  }

  return { services, prices };
}

/**
 * Ensures every default package + vehicle price exists: live Supabase rows override by slug, gaps stay on built-in defaults.
 */
export function mergeLiveCatalogWithDefaults(
  liveServices: FallbackServiceRow[],
  livePrices: FallbackPriceRow[],
): { services: FallbackServiceRow[]; prices: FallbackPriceRow[] } {
  const fb = getLocalFallbackCatalog();
  const slugs = defaultServicePackages.map((p) => p.id);
  const liveBySlug = new Map(liveServices.map((s) => [s.slug, s]));

  const services: FallbackServiceRow[] = slugs.map((slug, i) => {
    const live = liveBySlug.get(slug);
    if (live) {
      return {
        ...live,
        sort_order: typeof live.sort_order === 'number' && !Number.isNaN(live.sort_order) ? live.sort_order : (i + 1) * 10,
      };
    }
    const f = fb.services.find((x) => x.slug === slug);
    if (f) return f;
    return {
      id: fallbackServiceIdForSlug(slug),
      slug,
      title: slug,
      subtitle: null,
      sort_order: (i + 1) * 10,
    };
  });

  let prices = [...fb.prices];
  for (const live of liveServices) {
    const fbSid = fallbackServiceIdForSlug(live.slug);
    prices = prices.filter((p) => p.service_id !== fbSid && p.service_id !== live.id);
  }
  prices.push(...livePrices);

  const dedup = new Map<string, FallbackPriceRow>();
  for (const p of prices) {
    dedup.set(`${p.service_id}|${p.vehicle_class}`, p);
  }

  return { services, prices: [...dedup.values()] };
}

function deriveSlugWhenColumnMissing(id: string, title: string, index: number): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const short = id.replace(/-/g, '').slice(0, 8);
  if (base) return `${base}-${short}`;
  return `service-${short || String(index)}`;
}

function strCell(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
  return '';
}

/**
 * Map arbitrary `services` row (`select('*')`) to catalog shape; never throws.
 * Slug: `row.slug` ?? slugified title/name ?? `service-${id}`.
 */
export function mapUnknownToFallbackServiceRow(row: Record<string, unknown>, index: number): FallbackServiceRow | null {
  const id = strCell(row.id);
  if (!id) return null;
  if (row.active === false || row.published === false) return null;
  const title = strCell(row.title) || strCell(row.name) || 'Service';
  const slugRaw = strCell(row.slug);
  const slug = slugRaw || deriveSlugWhenColumnMissing(id, title, index);
  const subtitle =
    typeof row.subtitle === 'string'
      ? row.subtitle
      : typeof row.description === 'string'
        ? row.description
        : null;
  const sort_order =
    typeof row.sort_order === 'number' && !Number.isNaN(row.sort_order)
      ? row.sort_order
      : typeof row.order_index === 'number' && !Number.isNaN(row.order_index)
        ? row.order_index
        : (index + 1) * 10;
  return { id, slug, title, subtitle, sort_order };
}

/** Map `service_prices` rows from `select('*')` into stable quote rows. */
export function mapServicePriceRows(raw: unknown[] | null | undefined): FallbackPriceRow[] {
  if (!Array.isArray(raw)) return [];
  const out: FallbackPriceRow[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const sid = strCell(r.service_id) || strCell(r.serviceId);
    const cls = (strCell(r.vehicle_class) || strCell(r.vehicleClass)).toLowerCase();
    const rawCents = r.price_cents ?? r.amount_cents;
    const cents = typeof rawCents === 'number' && !Number.isNaN(rawCents) ? rawCents : Number(rawCents);
    if (!sid || !cls || Number.isNaN(cents)) continue;
    out.push({ service_id: sid, vehicle_class: cls, price_cents: Math.round(cents) });
  }
  return out;
}

/**
 * Loads active `services` for catalog APIs. Uses `select('*')` and maps in app so missing columns never hard-fail.
 */
export async function loadActiveServicesResilient(client: SupabaseClient): Promise<{ rows: FallbackServiceRow[]; error: string | null }> {
  const attempts = [
    () => client.from('services').select('*').eq('active', true).order('sort_order', { ascending: true }),
    () => client.from('services').select('*').order('sort_order', { ascending: true }),
  ];

  for (const run of attempts) {
    const { data, error } = await run();
    const msg = String(error?.message ?? '');
    if (error && /active|column .* does not exist|Could not find|schema cache/i.test(msg)) {
      continue;
    }
    if (error) {
      return { rows: [], error: msg || 'services_query_failed' };
    }
    if (!Array.isArray(data)) {
      return { rows: [], error: null };
    }
    const rows = (data as Record<string, unknown>[])
      .map((r, i) => mapUnknownToFallbackServiceRow(r, i))
      .filter((x): x is FallbackServiceRow => x != null);
    return { rows, error: null };
  }

  return { rows: [], error: 'services_query_failed' };
}
