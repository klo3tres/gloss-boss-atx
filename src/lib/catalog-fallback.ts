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

/** Slugs that may legitimately have no numeric online quote (consultation / TBD). */
const BOOKING_OPTIONAL_QUOTE_SLUGS = new Set(['ceramic-coating']);

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
