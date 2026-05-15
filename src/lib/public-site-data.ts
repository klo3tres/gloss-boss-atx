import { getLocalFallbackCatalog } from '@/lib/catalog-fallback';
import type { DealConfig, ServicePackage } from '@/lib/site-config';

export type SiteDataOfferCard = {
  id: string;
  title: string;
  description: string;
  discountPercent: number;
  active: boolean;
  sortOrder: number;
};

export type SiteDataMultiCar = {
  serviceSlug: string;
  vehicleClass: string;
  firstCents: number;
  secondCents: number;
  totalCents: number;
  discountPercent: number;
};

export type PublicSiteDataPayload = {
  ok: boolean;
  schemaWarnings: string[];
  services: ServicePackage[];
  deals: DealConfig;
  offers: SiteDataOfferCard[];
  multiCar: SiteDataMultiCar | null;
};

/** Used when `homepage_content.deal_config` is missing — no fabricated promos. */
const EMPTY_DEALS: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: '',
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
};

function subtitleToIncludes(subtitle: string | null): string[] {
  if (!subtitle?.trim()) return [];
  return subtitle
    .split(/[·|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function dollarsFromCents(cents: number | undefined): number | null {
  if (cents == null || Number.isNaN(cents)) return null;
  return Math.round(cents / 100);
}

/** Embedded marketing packages when Supabase catalog is missing, empty, or errored. */
export function getOfflineMarketingPackages(): ServicePackage[] {
  const fb = getLocalFallbackCatalog();
  return mapCatalogToServicePackages(fb.services, fb.prices);
}

export function mapCatalogToServicePackages(
  services: { id: string; slug: string; title: string; subtitle: string | null; sort_order: number }[],
  prices: { service_id: string; vehicle_class: string; price_cents: number }[],
): ServicePackage[] {
  return [...services]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => {
      const pick = (cls: string) => prices.find((p) => p.service_id === s.id && p.vehicle_class === cls)?.price_cents;
      const sedanC = pick('sedan');
      const suvC = pick('suv');
      const truckC = pick('truck');
      const legacyC = pick('suv_truck');
      const suvTruckC = legacyC ?? suvC ?? truckC;
      const suvD = dollarsFromCents(suvC);
      const truckD = dollarsFromCents(truckC);
      return {
        id: s.slug,
        title: s.title,
        subtitle: s.subtitle ?? '',
        sedanPrice: dollarsFromCents(sedanC),
        suvTruckPrice: dollarsFromCents(suvTruckC),
        suvPrice: suvD,
        truckPrice: truckD,
        includes: subtitleToIncludes(s.subtitle),
      };
    });
}

export function parseDealConfig(raw: unknown): DealConfig {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_DEALS };
  const o = raw as Record<string, unknown>;
  return {
    websitePromoPercent:
      typeof o.websitePromoPercent === 'number' && !Number.isNaN(o.websitePromoPercent) ? o.websitePromoPercent : EMPTY_DEALS.websitePromoPercent,
    websitePromoLabel: typeof o.websitePromoLabel === 'string' ? o.websitePromoLabel : EMPTY_DEALS.websitePromoLabel,
    websitePromoActive: typeof o.websitePromoActive === 'boolean' ? o.websitePromoActive : EMPTY_DEALS.websitePromoActive,
    multiCarSecondVehicleDiscountPercent:
      typeof o.multiCarSecondVehicleDiscountPercent === 'number' && !Number.isNaN(o.multiCarSecondVehicleDiscountPercent)
        ? o.multiCarSecondVehicleDiscountPercent
        : EMPTY_DEALS.multiCarSecondVehicleDiscountPercent,
  };
}

/**
 * Example two-vehicle total from live catalog + deal_config discount.
 * Prefers `full-detail`, then any package with a non-sedan price.
 */
export function computeMultiCarExample(services: ServicePackage[], deals: DealConfig, preferSlug = 'full-detail'): SiteDataMultiCar | null {
  const disc = deals.multiCarSecondVehicleDiscountPercent;
  const pickService =
    services.find((s) => s.id === preferSlug) ??
    services.find((s) => s.truckPrice != null || s.suvPrice != null || s.suvTruckPrice != null);

  if (!pickService) return null;

  const truckD = pickService.truckPrice ?? pickService.suvTruckPrice;
  const suvOnlyD = pickService.suvPrice;
  const legacyD = pickService.suvTruckPrice;

  let vehicleClass = 'suv_truck';
  let firstDollars: number | null = null;

  if (pickService.truckPrice != null) {
    vehicleClass = 'truck';
    firstDollars = pickService.truckPrice;
  } else if (pickService.suvPrice != null) {
    vehicleClass = 'suv';
    firstDollars = pickService.suvPrice;
  } else if (legacyD != null) {
    vehicleClass = 'suv_truck';
    firstDollars = legacyD;
  } else if (truckD != null) {
    vehicleClass = 'truck';
    firstDollars = truckD;
  } else if (suvOnlyD != null) {
    vehicleClass = 'suv';
    firstDollars = suvOnlyD;
  }

  if (firstDollars == null) return null;

  const firstCents = Math.round(firstDollars * 100);
  const secondCents = Math.round(firstCents * (1 - disc / 100));
  return {
    serviceSlug: pickService.id,
    vehicleClass,
    firstCents,
    secondCents,
    totalCents: firstCents + secondCents,
    discountPercent: disc,
  };
}
