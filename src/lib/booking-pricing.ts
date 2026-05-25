import type { DealConfig } from '@/lib/site-config';

export type BookingPricingBreakdown = {
  vehicleSubtotalCents: number;
  addOnSubtotalCents: number;
  /** Multi-car discount applied only to second vehicle line */
  multiCarDiscountCents: number;
  /** After vehicle discounts, before add-ons */
  afterMultiCarVehicleCents: number;
  /** Services + add-ons after multi-car */
  prePromoCents: number;
  websitePromoDiscountCents: number;
  offerDiscountCents: number;
  /** Scoped promo code discount (may apply to base only or specific add-on per rules). */
  promoDiscountCents: number;
  finalTotalCents: number;
  depositCents: number;
  depositPercent: number;
};

type OfferSnap = {
  percent: number;
  fixedCents: number;
  stackableWithSitePromo: boolean;
} | null;

function offerSnapApplies(o: NonNullable<OfferSnap>): boolean {
  return o.percent > 0 || o.fixedCents > 0;
}

/**
 * Single source of truth for booking totals (UI + /api/bookings).
 * Percent discounts use standard rounding on integer cents.
 */
export function computeBookingPricing(params: {
  vehicleLineCents: number[];
  addOnCentsSum: number;
  deals: DealConfig;
  /** Active CMS offer from ?offer= */
  claimedOffer: OfferSnap;
  depositPercent?: number;
}): BookingPricingBreakdown | { kind: 'invalid' } {
  const lines = params.vehicleLineCents;
  if (lines.length === 0 || lines.some((c) => c < 0 || !Number.isFinite(c))) {
    return { kind: 'invalid' };
  }

  const depositPercent = params.depositPercent ?? 30;
  const vehicleSubtotalCents = lines.reduce((a, b) => a + b, 0);
  const mcPct = params.deals.multiCarSecondVehicleDiscountPercent;
  const stacks = params.deals.promoStacksWithMultiCar !== false;

  let multiCarDiscountCents = 0;
  if (lines.length >= 2 && mcPct > 0) {
    for (let i = 1; i < lines.length; i++) {
      multiCarDiscountCents += Math.round(lines[i]! * (mcPct / 100));
    }
  }

  const afterMultiCarVehicleCents = Math.max(0, vehicleSubtotalCents - multiCarDiscountCents);
  const addOnSubtotalCents = Math.max(0, params.addOnCentsSum);
  const prePromoCents = afterMultiCarVehicleCents + addOnSubtotalCents;

  const sitePct = params.deals.websitePromoActive ? params.deals.websitePromoPercent : 0;
  const offer = params.claimedOffer;
  let offerDiscountCents = 0;
  let websitePromoDiscountCents = 0;

  const baseServicesCents = afterMultiCarVehicleCents;

  if (offer && offerSnapApplies(offer)) {
    if (offer.fixedCents > 0) {
      offerDiscountCents = Math.min(baseServicesCents, offer.fixedCents);
    } else if (offer.percent > 0) {
      offerDiscountCents = Math.round(baseServicesCents * (offer.percent / 100));
    }
    const afterOffer = baseServicesCents - offerDiscountCents;
    if (offer.stackableWithSitePromo && sitePct > 0) {
      websitePromoDiscountCents = Math.round(afterOffer * (sitePct / 100));
    }
  } else if (sitePct > 0) {
    const siteBlockedByMultiCar = lines.length >= 2 && mcPct > 0 && multiCarDiscountCents > 0 && !stacks;
    if (!siteBlockedByMultiCar) {
      websitePromoDiscountCents = Math.round(baseServicesCents * (sitePct / 100));
    }
  }

  const finalTotalCents = Math.max(0, prePromoCents - offerDiscountCents - websitePromoDiscountCents);
  const depositCents = Math.round((finalTotalCents * depositPercent) / 100);

  return {
    vehicleSubtotalCents,
    addOnSubtotalCents,
    multiCarDiscountCents,
    afterMultiCarVehicleCents,
    prePromoCents,
    websitePromoDiscountCents,
    offerDiscountCents,
    promoDiscountCents: 0,
    finalTotalCents,
    depositCents,
    depositPercent,
  };
}
