import type { SupabaseClient } from '@supabase/supabase-js';
import { computeBookingPricing } from '@/lib/booking-pricing';
import { loadDealConfigForBooking, resolveVehicleLinesPricing } from '@/lib/booking-server-shared';
import type { DealConfig } from '@/lib/site-config';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Recompute online (15%) + multi-car (10% on 2nd+ vehicles) from deal config when breakdown is stale.
 */
export async function recomputeEngineDiscounts(
  admin: SupabaseClient,
  job: Row,
  opts?: { forceOnline?: boolean },
): Promise<{
  vehicleSubtotalCents: number;
  multiCarDiscountCents: number;
  onlineDiscountCents: number;
  prePromoCents: number;
  finalTotalCents: number;
  depositCents: number;
  breakdownPatch: Record<string, unknown>;
} | null> {
  const vehicles = vehiclesFromRow(job);
  if (vehicles.length === 0) return null;

  const lines = vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || str(job.service_slug),
    vehicleClass: str(v.vehicle_class) || 'sedan',
    vehicleDescription: str(v.vehicle_description) || 'Vehicle',
    addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
  }));

  const pricedLines = await resolveVehicleLinesPricing(admin, lines);
  if (!pricedLines.ok) return null;

  const deals = await loadDealConfigForBooking(admin);
  const b = obj(job.booking_pricing_breakdown);
  const bookingOnline = str(job.booking_source).toLowerCase() === 'online';
  const dealsOverride: DealConfig = {
    ...deals,
    websitePromoActive: opts?.forceOnline ?? bookingOnline ? true : deals.websitePromoActive,
  };

  if (b.multiCarDisabled === true) {
    dealsOverride.multiCarSecondVehicleDiscountPercent = 0;
  }
  if (b.onlineDiscountDisabled === true) {
    dealsOverride.websitePromoActive = false;
  }

  const quote = computeBookingPricing({
    vehicleLineCents: pricedLines.vehicleLineCents,
    addOnCentsSum: num(b.addOnSubtotalCents),
    deals: dealsOverride,
    claimedOffer: null,
    depositPercent: num(b.depositPercent) || 30,
  });

  if ('kind' in quote) return null;

  return {
    vehicleSubtotalCents: quote.vehicleSubtotalCents,
    multiCarDiscountCents: quote.multiCarDiscountCents,
    onlineDiscountCents: quote.websitePromoDiscountCents,
    prePromoCents: quote.prePromoCents,
    finalTotalCents: quote.finalTotalCents,
    depositCents: quote.depositCents,
    breakdownPatch: { ...quote, repricedAt: new Date().toISOString() },
  };
}
