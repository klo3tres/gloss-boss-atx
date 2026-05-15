import { centsForSlugVehicleFromDefaults } from '@/lib/catalog-fallback';
import { normalizeVehicleClass, pickSuvTruckCents, type PriceRowLike } from '@/lib/vehicle-pricing';

export type PriceRowInput = { service_id: string; vehicle_class: string; price_cents: number };
export type SafePriceServiceRef = { slug: string; serviceId: string };

const QUOTE_ONLY_SLUGS = new Set(['ceramic-coating']);

export type SafePriceResult =
  | { ok: true; cents: number; isQuote: false }
  | { ok: true; isQuote: true; cents: null }
  | { ok: false; isQuote: false; cents: null };

function pickDbCents(dbPrices: PriceRowInput[], serviceId: string, uiClass: 'sedan' | 'suv_truck'): number | undefined {
  if (uiClass === 'sedan') {
    const direct = dbPrices.find((p) => p.service_id === serviceId && p.vehicle_class === 'sedan');
    if (direct && typeof direct.price_cents === 'number' && !Number.isNaN(direct.price_cents) && direct.price_cents > 0) {
      return direct.price_cents;
    }
    return undefined;
  }
  return pickSuvTruckCents(dbPrices as PriceRowLike[], serviceId);
}

/**
 * Resolve bookable/display price: DB `service_prices` first, then embedded catalog by slug.
 * Ceramic = quote-only. Never returns 0 — unknown numeric falls back to marketing defaults.
 * suv / truck inputs are normalized to suv_truck.
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
