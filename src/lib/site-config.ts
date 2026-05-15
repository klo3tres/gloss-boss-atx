export type ServicePackage = {
  id: string;
  title: string;
  subtitle: string;
  sedanPrice: number | null;
  /** Larger-vehicle pricing when DB only has a combined `suv_truck` row. */
  suvTruckPrice: number | null;
  /** Distinct SUV price when `service_prices` has a `suv` row (dollars, rounded from cents). */
  suvPrice?: number | null;
  /** Distinct truck price when `service_prices` has a `truck` row. */
  truckPrice?: number | null;
  includes: string[];
};

export type DealConfig = {
  websitePromoPercent: number;
  websitePromoLabel: string;
  websitePromoActive: boolean;
  multiCarSecondVehicleDiscountPercent: number;
};

export const defaultServicePackages: ServicePackage[] = [
  {
    id: "exterior-wash",
    title: "Wash",
    subtitle: "Premium maintenance wash package",
    sedanPrice: 60,
    suvTruckPrice: 75,
    suvPrice: null,
    truckPrice: null,
    includes: [
      "Full hand wash",
      "Tire shine",
      "Door jambs wiped",
      "Wheel and tire scrub",
      "Windows cleaned",
      "Exterior rinse and dry",
    ],
  },
  {
    id: "exterior-detail",
    title: "Exterior Detail",
    subtitle: "Clay, polish prep, wax or sealant protection",
    sedanPrice: 90,
    suvTruckPrice: 110,
    suvPrice: null,
    truckPrice: null,
    includes: [
      "Hand wash and decontamination",
      "Clay bar treatment",
      "Machine polish prep",
      "Spray wax or sealant",
      "Trim dressing",
      "Glass polished",
    ],
  },
  {
    id: "interior-detail",
    title: "Interior Detail",
    subtitle: "Deep interior reset package",
    sedanPrice: 80,
    suvTruckPrice: 100,
    suvPrice: null,
    truckPrice: null,
    includes: [
      "Full vacuum",
      "Cup holders cleaned",
      "Interior windows",
      "Dash and console wipe",
      "Door panels wiped",
      "Air vents dusted",
    ],
  },
  {
    id: "full-detail",
    title: "Full Detail",
    subtitle: "Complete inside and outside detail",
    sedanPrice: 150,
    suvTruckPrice: 175,
    suvPrice: null,
    truckPrice: null,
    includes: [
      "Everything in Exterior",
      "Everything in Interior",
      "Air blowout first",
      "Tire shine",
      "Dash and trim dressing",
      "Full top to bottom finish",
    ],
  },
  {
    id: "ceramic-coating",
    title: "Ceramic Coating",
    subtitle: "Long-term gloss and hydrophobic protection",
    sedanPrice: null,
    suvTruckPrice: null,
    suvPrice: null,
    truckPrice: null,
    includes: [
      "Consultation required",
      "Paint condition assessment",
      "Package pricing in progress",
    ],
  },
];

export const defaultDealConfig: DealConfig = {
  websitePromoPercent: 15,
  websitePromoLabel: "Limited Time Website Booking Offer",
  websitePromoActive: true,
  multiCarSecondVehicleDiscountPercent: 10,
};

export function formatStartingPrice(value: number | null): string {
  if (value === null) return 'Quote';
  return `$${value}+`;
}

export function formatVehiclePrice(value: number | null): string {
  if (value === null) return 'Quote';
  return `$${value}`;
}
