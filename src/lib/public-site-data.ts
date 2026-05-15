import { getLocalFallbackCatalog, centsForSlugVehicleFromDefaults } from '@/lib/catalog-fallback';
import { pickSedanCents, pickSuvTruckCents } from '@/lib/vehicle-pricing';
import { defaultDealConfig, type DealConfig, type ServicePackage } from '@/lib/site-config';

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

export type SiteDataFeaturedSlide = {
  id: string;
  label: string;
  image: string;
};

export type PublicSiteDataPayload = {
  ok: boolean;
  schemaWarnings: string[];
  services: ServicePackage[];
  deals: DealConfig;
  offers: SiteDataOfferCard[];
  multiCar: SiteDataMultiCar | null;
  featuredShowcase: SiteDataFeaturedSlide[];
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
  if (cents == null || Number.isNaN(cents) || cents <= 0) return null;
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
      let sedanC = pickSedanCents(prices, s.id);
      let suvTruckC = pickSuvTruckCents(prices, s.id);
      if (sedanC == null) {
        const fb = centsForSlugVehicleFromDefaults(s.slug, 'sedan');
        if (fb != null) sedanC = fb;
      }
      if (suvTruckC == null) {
        const fb = centsForSlugVehicleFromDefaults(s.slug, 'suv_truck');
        if (fb != null) suvTruckC = fb;
      }
      return {
        id: s.slug,
        title: s.title,
        subtitle: s.subtitle ?? '',
        sedanPrice: dollarsFromCents(sedanC),
        suvTruckPrice: dollarsFromCents(suvTruckC),
        includes: subtitleToIncludes(s.subtitle),
      };
    });
}

export function parseDealConfig(raw: unknown): DealConfig {
  if (!raw || typeof raw !== 'object') return { ...defaultDealConfig };
  const o = raw as Record<string, unknown>;
  const parsed: DealConfig = {
    websitePromoPercent:
      typeof o.websitePromoPercent === 'number' && !Number.isNaN(o.websitePromoPercent)
        ? o.websitePromoPercent
        : defaultDealConfig.websitePromoPercent,
    websitePromoLabel: typeof o.websitePromoLabel === 'string' ? o.websitePromoLabel : defaultDealConfig.websitePromoLabel,
    websitePromoActive: typeof o.websitePromoActive === 'boolean' ? o.websitePromoActive : defaultDealConfig.websitePromoActive,
    multiCarSecondVehicleDiscountPercent:
      typeof o.multiCarSecondVehicleDiscountPercent === 'number' && !Number.isNaN(o.multiCarSecondVehicleDiscountPercent)
        ? o.multiCarSecondVehicleDiscountPercent
        : defaultDealConfig.multiCarSecondVehicleDiscountPercent,
  };
  const inert =
    !parsed.websitePromoActive &&
    parsed.websitePromoPercent <= 0 &&
    parsed.multiCarSecondVehicleDiscountPercent <= 0;
  return inert ? { ...defaultDealConfig } : parsed;
}

/** Marketing offer cards when `offers` table is empty or unavailable. */
export function defaultMarketingOffers(): SiteDataOfferCard[] {
  return [
    {
      id: 'default-website-promo',
      title: 'Website Booking Offer',
      description: 'Book online and save on your first detail.',
      discountPercent: defaultDealConfig.websitePromoPercent,
      active: defaultDealConfig.websitePromoActive,
      sortOrder: 0,
    },
  ];
}

const DEFAULT_FEATURED_SLIDES: SiteDataFeaturedSlide[] = [
  {
    id: 'default-1',
    label: 'Featured Transformation',
    image: 'https://images.unsplash.com/photo-1503376780353-7e6692761b13?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'default-2',
    label: 'Featured Transformation',
    image: 'https://images.unsplash.com/photo-1549317336-206569e8475c?auto=format&fit=crop&w=1200&q=80',
  },
  {
    id: 'default-3',
    label: 'Featured Transformation',
    image: 'https://images.unsplash.com/photo-1494976388531-dad849ce67e7?auto=format&fit=crop&w=1200&q=80',
  },
];

export function defaultFeaturedShowcaseSlides(): SiteDataFeaturedSlide[] {
  return DEFAULT_FEATURED_SLIDES.map((s) => ({ ...s }));
}

/** When CMS JSON is empty or invalid — automotive stock placeholders with clear CMS hint. */
export function featuredShowcasePlaceholders(): SiteDataFeaturedSlide[] {
  return [
    { id: 'ph-1', label: 'Upload first transformation in Admin → Site content', image: DEFAULT_FEATURED_SLIDES[0].image },
    { id: 'ph-2', label: 'Featured Transformation', image: DEFAULT_FEATURED_SLIDES[1].image },
    { id: 'ph-3', label: 'Featured Transformation', image: DEFAULT_FEATURED_SLIDES[2].image },
  ];
}

/** Parses `homepage_content.featured_showcase` JSON: `{ "slides": [ { "image": "url", "label": "..." } ] }`. */
export function parseFeaturedShowcase(raw: unknown): SiteDataFeaturedSlide[] {
  if (!raw || typeof raw !== 'object') return featuredShowcasePlaceholders();
  const o = raw as Record<string, unknown>;
  const slides = o.slides;
  if (!Array.isArray(slides) || slides.length === 0) return featuredShowcasePlaceholders();
  const out: SiteDataFeaturedSlide[] = [];
  slides.forEach((item, i) => {
    if (!item || typeof item !== 'object') return;
    const row = item as Record<string, unknown>;
    const rawImg = typeof row.image === 'string' ? row.image.trim() : '';
    const image = rawImg.startsWith('http') || rawImg.startsWith('/') ? rawImg : '';
    if (!image) return;
    const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : 'Featured Transformation';
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : `slide-${i}`;
    out.push({ id, label, image });
  });
  return out.length > 0 ? out : featuredShowcasePlaceholders();
}

/**
 * Example two-vehicle total from live catalog + deal_config discount.
 * Prefers `full-detail`, then any package with a non-sedan price.
 */
export function computeMultiCarExample(services: ServicePackage[], deals: DealConfig, preferSlug = 'full-detail'): SiteDataMultiCar | null {
  const disc = deals.multiCarSecondVehicleDiscountPercent;
  const pickService =
    services.find((s) => s.id === preferSlug) ?? services.find((s) => s.suvTruckPrice != null && s.suvTruckPrice > 0);

  if (!pickService) return null;

  const firstDollars = pickService.suvTruckPrice;
  if (firstDollars == null || firstDollars <= 0) return null;

  const vehicleClass = 'suv_truck';

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
