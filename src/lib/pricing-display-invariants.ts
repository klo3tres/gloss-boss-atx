export type PricingDisplayInput = {
  vehicleSubtotalCents: number;
  addOnSubtotalCents: number;
  prePromoCents: number;
  finalTotalCents: number;
  onlineDiscountCents: number;
  multiCarDiscountCents: number;
  promoDiscountCents: number;
  manualDiscountCents: number;
};

function cents(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/**
 * Reconciles customer-facing price lines to the saved appointment total.
 * The adjustment is signed: negative is a custom discount, positive a charge.
 */
export function reconcilePricingDisplay(input: PricingDisplayInput) {
  const finalTotalCents = cents(input.finalTotalCents);
  const namedDiscountCents =
    cents(input.onlineDiscountCents) +
    cents(input.multiCarDiscountCents) +
    cents(input.promoDiscountCents) +
    cents(input.manualDiscountCents);
  const recordedSubtotal = cents(input.prePromoCents);
  const componentSubtotal = cents(input.vehicleSubtotalCents) + cents(input.addOnSubtotalCents);
  const serviceSubtotalCents = Math.max(recordedSubtotal, componentSubtotal, finalTotalCents + namedDiscountCents);
  const calculatedTotalCents = Math.max(0, serviceSubtotalCents - namedDiscountCents);
  const pricingAdjustmentCents = finalTotalCents - calculatedTotalCents;

  return {
    serviceSubtotalCents,
    namedDiscountCents,
    pricingAdjustmentCents,
    finalTotalCents,
    reconciledTotalCents: calculatedTotalCents + pricingAdjustmentCents,
  };
}
