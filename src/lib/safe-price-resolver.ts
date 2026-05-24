import { centsForSlugVehicleFromDefaults } from '@/lib/catalog-fallback';
import { normalizeVehicleClass, pickCentsForUiClass, type PriceRowLike, type UiVehicleClass } from '@/lib/vehicle-pricing';

export type PriceRowInput = { service_id: string; vehicle_class: string; price_cents: number };
export type SafePriceServiceRef = { slug: string; serviceId: string };

const QUOTE_ONLY_SLUGS = new Set(['ceramic-coating']);

export type SafePriceResult =
  | { ok: true; cents: number; isQuote: false }
  | { ok: true; isQuote: true; cents: null }
  | { ok: false; isQuote: false; cents: null };

function pickDbCents(dbPrices: PriceRowInput[], serviceId: string, uiClass: UiVehicleClass): number | undefined {
  return pickCentsForUiClass(dbPrices as PriceRowLike[], serviceId, uiClass);
}

/**
 * Resolve bookable/display price: DB `service_prices` first, then embedded catalog by slug.
 * Ceramic = quote-only. Never returns 0 — unknown numeric falls back to marketing defaults.
 * Vehicle class is normalized to sedan, suv, or truck.
 */
export function safePriceResolver(
  service: SafePriceServiceRef,
  vehicleClass: string,
  dbPrices: PriceRowInput[],
): SafePriceResult {
  const uiClass = normalizeVehicleClass(vehicleClass);

  /** Ceramic / quote-first slugs: use published DB price when present, else consultation quote. */
  if (QUOTE_ONLY_SLUGS.has(service.slug)) {
    const fromDb = pickDbCents(dbPrices, service.serviceId, uiClass);
    if (fromDb != null && fromDb > 0) return { ok: true, cents: fromDb, isQuote: false };
    return { ok: true, isQuote: true, cents: null };
  }

  const fromDb = pickDbCents(dbPrices, service.serviceId, uiClass);
  if (fromDb != null) return { ok: true, cents: fromDb, isQuote: false };

  const fromDef = centsForSlugVehicleFromDefaults(service.slug, uiClass);
  if (fromDef != null && fromDef > 0) return { ok: true, cents: fromDef, isQuote: false };

  return { ok: false, isQuote: false, cents: null };
}

/** Booking API: cents required; null = cannot complete checkout for this line. */
export function safePriceCentsForBooking(
  service: SafePriceServiceRef,
  vehicleClass: string,
  dbPrices: PriceRowInput[],
): number | null {
  const r = safePriceResolver(service, vehicleClass, dbPrices);
  if (r.isQuote || !r.ok || r.cents == null || r.cents <= 0) return null;
  return r.cents;
}

/** UI: never show $0 — returns cents or null (display as Quote). */
export function safePriceCentsForDisplay(
  service: SafePriceServiceRef,
  vehicleClass: string,
  dbPrices: PriceRowInput[],
): number | null {
  const r = safePriceResolver(service, vehicleClass, dbPrices);
  if (r.isQuote) return null;
  if (r.ok && r.cents != null && r.cents > 0) return r.cents;
  return null;
}
