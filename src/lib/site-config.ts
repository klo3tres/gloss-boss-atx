export type ServicePackage = {
  id: string;
  title: string;
  subtitle: string;
  sedanPrice: number | null;
  /** SUV / Truck combined price (merged from suv_truck, suv, or truck DB rows). */
  suvTruckPrice: number | null;
  includes: string[];
};

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
    suvTruckPrice: 75,
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
    sedanPrice: 90,
    suvTruckPrice: 110,
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
    sedanPrice: 80,
    suvTruckPrice: 100,
    includes: ["Vacuum", "Wipe down plastics/trim", "Stain treatment", "Glass cleaning", "Odor refresh"],
  },
  {
    id: "full-detail",
    title: "Full Detail",
    subtitle: "Complete inside + outside transformation",
    sedanPrice: 150,
    suvTruckPrice: 175,
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
  return `$${value}+`;
}

export function formatVehiclePrice(value: number | null): string {
  if (value == null || value <= 0) return 'Quote';
  return `$${value}`;
}
