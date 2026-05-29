import type { Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export type VehicleSaveLine = {
  year: string | null;
  make: string | null;
  model: string | null;
  vehicle_description: string;
  vehicle_color: string | null;
  service_slug: string | null;
  vehicle_class: string | null;
  price_cents: number | null;
};

/** True when job has a captured booking pricing snapshot — do not silently reprice. */
export function hasHistoricalPricingSnapshot(job: Row): boolean {
  const b = job.booking_pricing_breakdown;
  if (!b || typeof b !== 'object') return false;
  const o = b as Record<string, unknown>;
  if (o.orderSnapshot && typeof o.orderSnapshot === 'object') return true;
  if (typeof o.finalTotalCents === 'number' && o.finalTotalCents > 0) return true;
  if (typeof o.vehicleSubtotalCents === 'number' && o.vehicleSubtotalCents > 0) return true;
  if (o.pricingLockedAt || o.capturedAt) return true;
  return false;
}

/**
 * Merge vehicle edits without overwriting historical per-vehicle prices unless recalculate requested.
 */
export function mergeVehiclePricingOnSave(params: {
  vehicles: VehicleSaveLine[];
  prevBreakdown: Record<string, unknown>;
  prevVehicles: Row[];
  recalculateFromCatalog: boolean;
  catalogPrices?: Record<string, number>;
}): {
  vehicles: VehicleSaveLine[];
  vehicleSubtotalCents: number;
  breakdownPatch: Record<string, unknown>;
} {
  const { vehicles, prevBreakdown, prevVehicles, recalculateFromCatalog, catalogPrices } = params;
  const prevByIndex = prevVehicles.map((v, i) => ({
    price: num(v.price_cents),
    index: i,
  }));

  const firstPriced = vehicles.find((v) => typeof v.price_cents === 'number' && v.price_cents > 0)?.price_cents
    ?? prevByIndex.find((p) => p.price > 0)?.price
    ?? 0;

  const merged = vehicles.map((v, index) => {
    if (recalculateFromCatalog && catalogPrices) {
      const key = `${str(v.service_slug)}:${str(v.vehicle_class) || 'sedan'}`;
      const cents = catalogPrices[key];
      if (typeof cents === 'number' && cents > 0) {
        return { ...v, price_cents: cents };
      }
    }
    if (!recalculateFromCatalog) {
      const prevPrice = prevByIndex[index]?.price;
      if (prevPrice > 0) return { ...v, price_cents: prevPrice };
      if (typeof v.price_cents === 'number' && v.price_cents > 0) return v;
      const hist = num(prevBreakdown.vehicleSubtotalCents);
      if (hist > 0 && vehicles.length === 1 && !v.price_cents) {
        return { ...v, price_cents: hist };
      }
      if (index > 0 && firstPriced > 0 && (!v.price_cents || v.price_cents <= 0)) {
        return { ...v, price_cents: firstPriced };
      }
    }
    return v;
  });

  const vehicleSubtotalCents = merged.reduce((s, v) => s + (typeof v.price_cents === 'number' ? v.price_cents : 0), 0);

  let multiCarDiscountCents = num(prevBreakdown.multiCarDiscountCents);
  let onlineDiscountCents =
    num(prevBreakdown.websitePromoDiscountCents) || num(prevBreakdown.onlineDiscountCents);
  const promoDiscountCents = num(prevBreakdown.offerDiscountCents) || num(prevBreakdown.promoDiscountCents);
  const addOnSubtotalCents = num(prevBreakdown.addOnSubtotalCents);

  if (vehicleSubtotalCents > 0 && multiCarDiscountCents <= 0 && vehicles.length >= 2) {
    const mcPct = num(prevBreakdown.multiCarSecondVehicleDiscountPercent) || 10;
    for (let i = 1; i < vehicles.length; i++) {
      const pc = typeof vehicles[i]?.price_cents === 'number' ? vehicles[i]!.price_cents! : 0;
      multiCarDiscountCents += Math.round(pc * (mcPct / 100));
    }
  }
  const afterMc = Math.max(0, vehicleSubtotalCents - multiCarDiscountCents);
  let prePromoCents = afterMc + addOnSubtotalCents;
  if (onlineDiscountCents <= 0 && prePromoCents > 0) {
    const sitePct = num(prevBreakdown.websitePromoPercent) || 15;
    onlineDiscountCents = Math.round(afterMc * (sitePct / 100));
  }
  const serviceFinalCents = Math.max(0, prePromoCents - onlineDiscountCents - promoDiscountCents);

  return {
    vehicles: merged,
    vehicleSubtotalCents,
    breakdownPatch: {
      ...prevBreakdown,
      vehicleSubtotalCents,
      addOnSubtotalCents,
      prePromoCents,
      afterMultiCarVehicleCents: afterMc,
      finalTotalCents: serviceFinalCents,
      multiCarDiscountCents,
      websitePromoDiscountCents: onlineDiscountCents,
      offerDiscountCents: promoDiscountCents,
      pricingLockedAt: recalculateFromCatalog ? new Date().toISOString() : prevBreakdown.pricingLockedAt ?? prevBreakdown.capturedAt,
      repricedFromCatalog: recalculateFromCatalog ? new Date().toISOString() : undefined,
    },
  };
}
