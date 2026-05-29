/**
 * Apply online / multi-car discounts via the same pricing engine as the work-order UI.
 * Used by QA scripts — not a server action.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  computeQuoteFromInputs,
  loadDealConfigForBooking,
  resolveVehicleLinesPricing,
} from '@/lib/booking-server-shared';
import { computeBookingPricing } from '@/lib/booking-pricing';
import type { DealConfig } from '@/lib/site-config';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { mergePricingBreakdownWithLineItems, readCustomLineItems } from '@/lib/work-order-line-items';
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

export type ApplyDiscountResult =
  | { ok: true; job: Row; message: string }
  | { ok: false; error: string };

export async function applyWorkOrderDiscountViaPricingEngine(
  admin: SupabaseClient,
  appointmentId: string,
  kind: 'online' | 'multi_car',
  enable: boolean,
): Promise<ApplyDiscountResult> {
  const { data } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (!data) return { ok: false, error: 'Appointment not found' };

  const job = data as Row;
  const vehicles = vehiclesFromRow(job);
  if (kind === 'multi_car' && enable && vehicles.length < 2) {
    return { ok: false, error: 'Multi-car discount requires at least two vehicles.' };
  }

  const lines = vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || str(job.service_slug),
    vehicleClass: str(v.vehicle_class) || 'sedan',
    vehicleDescription: str(v.vehicle_description) || 'Vehicle',
    addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
  }));

  const deals = await loadDealConfigForBooking(admin);
  let dealsOverride: DealConfig = { ...deals };

  if (kind === 'online') {
    if (!enable && deals.websitePromoPercent <= 0) {
      return { ok: false, error: 'No active website promo in deal settings.' };
    }
    dealsOverride = { ...deals, websitePromoActive: enable };
  } else if (kind === 'multi_car') {
    if (!enable) {
      dealsOverride = { ...deals, multiCarSecondVehicleDiscountPercent: 0 };
    } else if (deals.multiCarSecondVehicleDiscountPercent <= 0) {
      return { ok: false, error: 'Multi-car discount is not configured.' };
    }
  }

  const pricedLines = await resolveVehicleLinesPricing(admin, lines);
  if (!pricedLines.ok) return { ok: false, error: pricedLines.error };

  const prevB = obj(job.booking_pricing_breakdown);
  const quoteBreakdown = computeBookingPricing({
    vehicleLineCents: pricedLines.vehicleLineCents,
    addOnCentsSum: num(prevB.addOnSubtotalCents),
    deals: dealsOverride,
    claimedOffer: null,
  });
  if ('kind' in quoteBreakdown) {
    return { ok: false, error: 'Could not compute pricing.' };
  }

  if (kind === 'online' && enable && quoteBreakdown.websitePromoDiscountCents <= 0) {
    return { ok: false, error: 'Online discount did not apply — check deal settings.' };
  }
  if (kind === 'multi_car' && enable && quoteBreakdown.multiCarDiscountCents <= 0) {
    return { ok: false, error: 'Multi-car discount did not apply.' };
  }

  const pricedVehicles: Row[] = vehicles.map((v, i) => ({
    ...(v as Row),
    price_cents: pricedLines.resolved[i]?.priceCents ?? v.price_cents,
  }));

  const b: Record<string, unknown> = {
    ...prevB,
    ...quoteBreakdown,
    promoDiscountCents: num(prevB.promoDiscountCents),
    offerDiscountCents: num(prevB.offerDiscountCents),
    onlineDiscountDisabled: kind === 'online' ? !enable : prevB.onlineDiscountDisabled,
    multiCarDisabled: kind === 'multi_car' ? !enable : prevB.multiCarDisabled,
    repricedAt: new Date().toISOString(),
  };
  const promoTotal = num(prevB.promoDiscountCents) + num(prevB.offerDiscountCents);
  if (promoTotal > 0) {
    b.finalTotalCents = Math.max(0, num(b.prePromoCents) - num(b.websitePromoDiscountCents) - promoTotal);
  }
  delete b.adminOverrideFinalTotalCents;
  delete b.adminOverrideReason;

  const customItems = readCustomLineItems({ ...job, booking_pricing_breakdown: b });
  const breakdownWithLines = { ...b, customLineItems: customItems };
  const payments = await fetchPaymentsForJob(admin, job, { appointmentId, isFallback: false });
  const jobWithLines = { ...job, booking_pricing_breakdown: breakdownWithLines, booking_vehicles: pricedVehicles };
  const pricing = resolveJobPricing(jobWithLines, payments);
  const merged = mergePricingBreakdownWithLineItems(jobWithLines, customItems, {
    finalTotalCents: pricing.finalTotalCents,
    vehicleSubtotalCents: pricing.vehicleSubtotalCents,
    customLineItemsCents: pricing.customLineItemsCents,
  });

  const { data: updated, error: upErr } = await admin
    .from('appointments')
    .update({
      booking_pricing_breakdown: merged,
      booking_vehicles: pricedVehicles,
      base_price_cents: pricing.finalTotalCents,
      balance_due_cents: pricing.remainingBalanceCents,
      vehicle_description: vehicles
        .map((v) => str(v.vehicle_description))
        .filter(Boolean)
        .join(' · '),
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId)
    .select('*')
    .maybeSingle();

  if (upErr) return { ok: false, error: upErr.message };
  if (!updated) return { ok: false, error: 'DB update matched 0 rows.' };

  await syncJobBalanceDue(admin, updated as Row, pricing, { appointmentId, isFallback: false });

  return {
    ok: true,
    job: updated as Row,
    message: `Final $${(pricing.finalTotalCents / 100).toFixed(2)} · online −$${(pricing.onlineDiscountCents / 100).toFixed(2)} · multi −$${(pricing.multiCarDiscountCents / 100).toFixed(2)}`,
  };
}
