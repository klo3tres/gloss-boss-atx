export type ServicePackage = {
  id: string;
  title: string;
  subtitle: string;
  sedanPrice: number | null;
  suvPrice?: number | null;
  truckPrice?: number | null;
  /** SUV / Truck combined price (legacy / booking fallback). */
  suvTruckPrice: number | null;
  includes: string[];
};

export const PRICING_DISCLAIMER =
  'Final pricing may vary based on vehicle size, condition, pet hair, stains, sand, mud, neglected wheels, and extended cleaning needs.';

export const PRICING_STARTING_AT_LABEL = 'Starting at';

export type DealConfig = {
  websitePromoPercent: number;
  websitePromoLabel: string;
  websitePromoActive: boolean;
  multiCarSecondVehicleDiscountPercent: number;
  /** When false, sitewide % promo does not stack with multi-car discount (multi-car wins). */
  promoStacksWithMultiCar: boolean;
};

export const defaultServicePackages: ServicePackage[] = [
  {
    id: "exterior-wash",
    title: "Exterior Wash",
    subtitle: "Fast, show-ready exterior refresh",
    sedanPrice: 60,
    suvPrice: 80,
    truckPrice: 100,
    suvTruckPrice: 80,
    includes: [
      "Foam pre-soak",
      "Hand wash",
      "Wheel cleaning",
      "Tire shine",
      "Exterior dry",
    ],
  },
  {
    id: "exterior-detail",
    title: "Exterior Detail",
    subtitle: "Decontaminate, polish prep, and protect",
    sedanPrice: 100,
    suvPrice: 125,
    truckPrice: 150,
    suvTruckPrice: 125,
    includes: [
      "Foam wash",
      "Clay treatment",
      "Wheel deep clean",
      "Paint gloss enhancement",
      "Wax or sealant protection",
    ],
  },
  {
    id: "interior-detail",
    title: "Interior Detail",
    subtitle: "Deep clean cabin reset",
    sedanPrice: 90,
    suvPrice: 115,
    truckPrice: 130,
    suvTruckPrice: 115,
    includes: ["Vacuum", "Wipe down plastics/trim", "Stain treatment", "Glass cleaning", "Odor refresh"],
  },
  {
    id: "full-detail",
    title: "Full Detail",
    subtitle: "Complete inside + outside transformation",
    sedanPrice: 175,
    suvPrice: 225,
    truckPrice: 250,
    suvTruckPrice: 225,
    includes: [
      "Interior detail",
      "Exterior detail",
      "Clay treatment",
      "Protection finish",
      "Full reset",
    ],
  },
  {
    id: "ceramic-coating",
    title: "Ceramic Coating",
    subtitle: "Long-term gloss and hydrophobic protection — quote by condition",
    sedanPrice: null,
    suvTruckPrice: null,
    includes: [
      "Paint prep",
      "Surface decontamination",
      "Gloss enhancement",
      "Ceramic protection",
      "Quote based on condition",
    ],
  },
];

export const defaultDealConfig: DealConfig = {
  websitePromoPercent: 15,
  websitePromoLabel: "Limited Time Website Booking Offer",
  websitePromoActive: true,
  multiCarSecondVehicleDiscountPercent: 10,
  promoStacksWithMultiCar: true,
};

export function formatStartingPrice(value: number | null): string {
  if (value == null || value <= 0) return 'Quote';
  return `${PRICING_STARTING_AT_LABEL} $${value}`;
}

export function formatVehiclePrice(value: number | null): string {
  return formatStartingPrice(value);
}

/** Public marketing copy for optional add-ons (booking catalog may override cents). */
export const PUBLIC_ADDON_PRICING: Array<{ label: string; detail: string }> = [
  { label: 'Engine bay', detail: 'Starting at $40' },
  { label: 'Pet hair', detail: 'Starting at $35' },
  { label: 'Heavy pet hair', detail: '$60–$75' },
  { label: 'Clay bar', detail: 'Sedan starting at $30 · SUV $40 · Truck $50' },
  { label: 'Upholstery shampoo / extraction', detail: 'Sedan starting at $65 · SUV $85 · Truck $100' },
  { label: 'Heavy stains', detail: 'Quote required' },
  { label: 'Odor treatment', detail: 'Coming soon' },
];

export const PRICING_DISCOUNT_RULES =
  '15% online booking discount applies to base services only. Multi-car discount applies only to eligible base services. Add-ons are not discounted unless an admin manually applies a discount.';
