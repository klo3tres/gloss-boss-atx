import { centsForSlugVehicleFromDefaults } from '@/lib/catalog-fallback';

export type PriceRowInput = { service_id: string; vehicle_class: string; price_cents: number };
export type SafePriceServiceRef = { slug: string; serviceId: string };

const QUOTE_ONLY_SLUGS = new Set(['ceramic-coating']);

export type SafePriceResult =
  | { ok: true; cents: number; isQuote: false }
  | { ok: true; isQuote: true; cents: null }
  | { ok: false; isQuote: false; cents: null };

function pickDbCents(dbPrices: PriceRowInput[], serviceId: string, vehicleClass: string): number | undefined {
  const direct = dbPrices.find((p) => p.service_id === serviceId && p.vehicle_class === vehicleClass);
  if (direct && typeof direct.price_cents === 'number' && !Number.isNaN(direct.price_cents) && direct.price_cents > 0) {
    return direct.price_cents;
  }
  if (vehicleClass === 'suv' || vehicleClass === 'truck') {
    const legacy = dbPrices.find((p) => p.service_id === serviceId && p.vehicle_class === 'suv_truck');
    if (legacy && typeof legacy.price_cents === 'number' && !Number.isNaN(legacy.price_cents) && legacy.price_cents > 0) {
      return legacy.price_cents;
    }
  }
  return undefined;
}

/**
 * Resolve bookable/display price: DB `service_prices` first, then embedded catalog by slug.
 * Ceramic = quote-only. Never returns 0 — unknown numeric falls back to marketing defaults.
 */
export function safePriceResolver(
  service: SafePriceServiceRef,
  vehicleClass: string,
  dbPrices: PriceRowInput[],
): SafePriceResult {
  if (QUOTE_ONLY_SLUGS.has(service.slug)) {
    return { ok: true, isQuote: true, cents: null };
  }

  const fromDb = pickDbCents(dbPrices, service.serviceId, vehicleClass);
  if (fromDb != null) return { ok: true, cents: fromDb, isQuote: false };

  const fromDef = centsForSlugVehicleFromDefaults(service.slug, vehicleClass);
  if (fromDef != null && fromDef > 0) return { ok: true, cents: fromDef, isQuote: false };

  if (vehicleClass === 'suv' || vehicleClass === 'truck') {
    const legacyDef = centsForSlugVehicleFromDefaults(service.slug, 'suv_truck');
    if (legacyDef != null && legacyDef > 0) return { ok: true, cents: legacyDef, isQuote: false };
  }

  const sedanDef = centsForSlugVehicleFromDefaults(service.slug, 'sedan');
  if (sedanDef != null && sedanDef > 0) return { ok: true, cents: sedanDef, isQuote: false };

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
