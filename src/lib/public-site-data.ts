import { getLocalFallbackCatalog } from '@/lib/catalog-fallback';
import { pickSedanCents, pickSuvTruckCents } from '@/lib/vehicle-pricing';
import { defaultDealConfig, defaultServicePackages, type DealConfig, type ServicePackage } from '@/lib/site-config';

export type SiteDataOfferCard = {
  id: string;
  /** URL param for /book?offer= — stable slug when configured in Supabase */
  slug?: string;
  title: string;
  description: string;
  /** 0–100 when `discountKind` is `percent` */
  discountPercent: number;
  /** Whole cents when `discountKind` is `fixed`; otherwise null */
  discountFixedCents: number | null;
  discountKind: 'percent' | 'fixed';
  active: boolean;
  archived: boolean;
  sortOrder: number;
  /** When true (default), offer stacks with sitewide promo after offer is applied. */
  stackable: boolean;
  showOnHomepage: boolean;
  showOnServices: boolean;
  showOnBooking: boolean;
  startsAt: string | null;
  endsAt: string | null;
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
  googleReviewUrl: string;
};

/** Used when `homepage_content.deal_config` is missing — no fabricated promos. */
const EMPTY_DEALS: DealConfig = {
  websitePromoPercent: 0,
  websitePromoLabel: '',
  websitePromoActive: false,
  multiCarSecondVehicleDiscountPercent: 0,
  promoStacksWithMultiCar: true,
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
      const sedanC = pickSedanCents(prices, s.id);
      const suvTruckC = pickSuvTruckCents(prices, s.id);
      const canon = defaultServicePackages.find((p) => p.id === s.slug);
      const includes =
        canon && canon.includes.length > 0 ? [...canon.includes] : subtitleToIncludes(s.subtitle);
      return {
        id: s.slug,
        title: s.title,
        subtitle: canon?.subtitle ?? (s.subtitle ?? ''),
        sedanPrice: dollarsFromCents(sedanC),
        suvTruckPrice: dollarsFromCents(suvTruckC),
        includes,
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
    promoStacksWithMultiCar:
      typeof o.promoStacksWithMultiCar === 'boolean' ? o.promoStacksWithMultiCar : defaultDealConfig.promoStacksWithMultiCar,
  };
  const inert =
    !parsed.websitePromoActive &&
    parsed.websitePromoPercent <= 0 &&
    parsed.multiCarSecondVehicleDiscountPercent <= 0;
  return inert ? { ...defaultDealConfig } : parsed;
}

/** True when the offer still has a positive discount in its configured form. */
export function offerHasDiscount(card: SiteDataOfferCard): boolean {
  return card.discountKind === 'fixed'
    ? (card.discountFixedCents ?? 0) > 0
    : card.discountPercent > 0;
}

export function isOfferWithinSchedule(card: SiteDataOfferCard, at: Date = new Date()): boolean {
  if (card.startsAt) {
    const s = new Date(card.startsAt);
    if (!Number.isNaN(s.getTime()) && at < s) return false;
  }
  if (card.endsAt) {
    const e = new Date(card.endsAt);
    if (!Number.isNaN(e.getTime()) && at > e) return false;
  }
  return true;
}

/**
 * Rows the public site-data API may expose: active, not archived, in schedule, with a real discount.
 * Placement flags are not checked here — each page filters display.
 */
export function isOfferEligiblePublicSiteData(card: SiteDataOfferCard, at: Date = new Date()): boolean {
  return card.active && !card.archived && offerHasDiscount(card) && isOfferWithinSchedule(card, at);
}

export function mapDbRowToSiteDataOfferCard(r: Record<string, unknown>): SiteDataOfferCard | null {
  const id = typeof r.id === 'string' ? r.id : null;
  if (!id) return null;
  const title =
    (typeof r.title === 'string' && r.title.trim()) || (typeof r.label === 'string' && r.label.trim()) || 'Offer';
  const desc = typeof r.description === 'string' ? r.description : '';
  const slugRaw = typeof r.slug === 'string' ? r.slug.trim() : '';
  const fixedRaw = r.discount_fixed_cents;
  const discountFixedCents =
    typeof fixedRaw === 'number' && !Number.isNaN(fixedRaw) && fixedRaw > 0 ? Math.round(fixedRaw) : null;
  const pctRaw =
    typeof r.discount_percent === 'number' && !Number.isNaN(r.discount_percent)
      ? r.discount_percent
      : Number(r.percent_off ?? 0);
  const pct = !Number.isFinite(pctRaw) ? 0 : Math.min(100, Math.max(0, pctRaw));
  const discountKind: 'percent' | 'fixed' = discountFixedCents != null ? 'fixed' : 'percent';

  return {
    id,
    slug: slugRaw || undefined,
    title,
    description: desc,
    discountPercent: discountKind === 'percent' ? pct : 0,
    discountFixedCents,
    discountKind,
    active: Boolean(r.active),
    archived: Boolean(r.archived),
    sortOrder: Number(r.sort_order ?? 0),
    stackable: typeof r.stackable === 'boolean' ? r.stackable : true,
    showOnHomepage: typeof r.show_on_homepage === 'boolean' ? r.show_on_homepage : true,
    showOnServices: typeof r.show_on_services === 'boolean' ? r.show_on_services : true,
    showOnBooking: typeof r.show_on_booking === 'boolean' ? r.show_on_booking : true,
    startsAt: typeof r.starts_at === 'string' ? r.starts_at : null,
    endsAt: typeof r.ends_at === 'string' ? r.ends_at : null,
  };
}

export function formatOfferDiscountLabel(card: SiteDataOfferCard): string {
  if (card.discountKind === 'fixed' && (card.discountFixedCents ?? 0) > 0) {
    return `$${(card.discountFixedCents! / 100).toFixed(0)} off`;
  }
  if (card.discountPercent > 0) return `${card.discountPercent}% off`;
  return '';
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

/** `jsonb` values are usually objects; tolerate double-encoded JSON strings from older imports. */
function coerceHomepageJson(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const t = raw.trim();
    if (!t) return null;
    try {
      const inner = JSON.parse(t) as unknown;
      return inner && typeof inner === 'object' && !Array.isArray(inner) ? (inner as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/** Parses `homepage_content.featured_showcase` value. Returns only valid slides — empty array if none (no stock filler). */
export function parseFeaturedShowcase(raw: unknown): SiteDataFeaturedSlide[] {
  const o = coerceHomepageJson(raw);
  if (!o) return [];
  const slides = o.slides;
  if (!Array.isArray(slides) || slides.length === 0) return [];
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
  return out;
}

/** Admin UI hint slides (not used for public homepage defaults). */
export function featuredShowcasePlaceholders(): SiteDataFeaturedSlide[] {
  return [
    { id: 'ph-1', label: 'Upload first transformation in Admin → Site content', image: DEFAULT_FEATURED_SLIDES[0].image },
    { id: 'ph-2', label: 'Featured Transformation', image: DEFAULT_FEATURED_SLIDES[1].image },
    { id: 'ph-3', label: 'Featured Transformation', image: DEFAULT_FEATURED_SLIDES[2].image },
  ];
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
