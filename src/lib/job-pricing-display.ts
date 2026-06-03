import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from '@/lib/work-order-resolve';
import { vehiclesFromRow } from '@/lib/work-order-resolve';
import { findDepositPayment } from '@/lib/payments-resolve';
import {
  isManualFieldPayment,
  isPaymentSucceeded,
  isPaymentVoided,
  isRealStripeDeposit,
  isRealStripePayment,
} from '@/lib/payment-classification';
import {
  customLineAdjustmentCents,
  manualOnlyDiscountCents,
} from '@/lib/pricing-custom-lines';
import { readCustomLineItems } from '@/lib/work-order-line-items';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function isSucceeded(p: Row) {
  return isPaymentSucceeded(p);
}

function isCash(p: Row) {
  return isManualFieldPayment(p) && str(p.payment_method ?? p.payment_kind).toLowerCase().includes('cash');
}

function isStripe(p: Row) {
  return isRealStripePayment(p);
}

function isZelle(p: Row) {
  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  return method.includes('zelle') || method.includes('venmo') || method.includes('cash_app');
}

function isManual(p: Row) {
  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  return method.includes('check') || (method.includes('manual') && !method.includes('stripe'));
}

function isVoided(p: Row) {
  return isPaymentVoided(p);
}

/** Single pricing snapshot for work order, receipt HTML/PDF, and email. */
export type JobPricingDisplay = {
  vehicleLines: Array<{ name: string; service: string; color: string; priceCents: number }>;
  vehicleSubtotalCents: number;
  addOnSubtotalCents: number;
  multiCarDiscountCents: number;
  onlineDiscountCents: number;
  promoDiscountCents: number;
  manualDiscountCents: number;
  prePromoCents: number;
  serviceFinalCents: number;
  finalTotalCents: number;
  depositCents: number;
  depositPaidCents: number;
  stripePaidCents: number;
  cashPaidCents: number;
  zellePaidCents: number;
  manualPaidCents: number;
  totalPaidCents: number;
  /** Sum of all succeeded non-voided payments (may exceed job total from test/duplicate rows). */
  rawTotalPaidCents: number;
  /** Amount counted toward this job total (capped at final total for receipts). */
  allocatedTotalPaidCents: number;
  overpaymentCents: number;
  hasOverpayment: boolean;
  remainingBalanceCents: number;
  customLineItemsCents: number;
  promoCode: string;
};

export function resolveJobPricing(job: Row, payments: Row[] = []): JobPricingDisplay {
  const vehicles = vehiclesFromRow(job);
  const vehicleLines = vehicles.map((v, i) => ({
    name: String(v.vehicle_description || v.description || `Vehicle ${i + 1}`),
    service: String(v.service_slug || job.service_slug || 'service'),
    color: String(v.vehicle_color || v.color || ''),
    priceCents: num(v.price_cents),
  }));
  const sumVehicleCents = vehicleLines.reduce((s, v) => s + v.priceCents, 0);

  const b = obj(job.booking_pricing_breakdown);
  const payload = obj(job.payload);
  const payloadPricing = obj(payload.booking_pricing_breakdown ?? payload.pricing);
  const snapshotPricing = obj(obj(b.orderSnapshot).pricing);

  const pick = (key: string) => num(b[key] ?? payloadPricing[key] ?? snapshotPricing[key]);

  const onlineDisabled = b.onlineDiscountDisabled === true;
  const multiDisabled = b.multiCarDisabled === true;

  const vehicleSubtotalCents = pick('vehicleSubtotalCents') || sumVehicleCents;
  const addOnSubtotalCents = pick('addOnSubtotalCents');
  let multiCarDiscountCents = pick('multiCarDiscountCents');
  let onlineDiscountCents =
    pick('websitePromoDiscountCents') || pick('onlineDiscountCents') || pick('sitewideDiscountCents');
  if (multiDisabled) multiCarDiscountCents = 0;
  if (onlineDisabled) onlineDiscountCents = 0;

  if (!multiDisabled && multiCarDiscountCents <= 0 && vehicleLines.length >= 2) {
    const mcPct = num(b.multiCarSecondVehicleDiscountPercent) || num(snapshotPricing.multiCarSecondVehicleDiscountPercent) || 10;
    for (let i = 1; i < vehicleLines.length; i++) {
      multiCarDiscountCents += Math.round(vehicleLines[i]!.priceCents * (mcPct / 100));
    }
  }
  if (!onlineDisabled && onlineDiscountCents <= 0 && str(job.booking_source).toLowerCase() === 'online') {
    const sitePct = num(b.websitePromoPercent) || 15;
    const afterMc = Math.max(0, vehicleSubtotalCents - multiCarDiscountCents);
    onlineDiscountCents = Math.round(afterMc * (sitePct / 100));
  }

  const offerDiscountCents = pick('offerDiscountCents');
  const promoCodeDiscountCents = pick('promoDiscountCents');
  const promoDiscountCents = offerDiscountCents + promoCodeDiscountCents;

  let prePromoCents = pick('prePromoCents');
  if (prePromoCents <= 0) {
    const afterMc = pick('afterMultiCarVehicleCents') || Math.max(0, vehicleSubtotalCents - multiCarDiscountCents);
    prePromoCents = afterMc + addOnSubtotalCents;
  }
  if (prePromoCents <= 0 && sumVehicleCents > 0) prePromoCents = sumVehicleCents + addOnSubtotalCents;

  const customLineItems = readCustomLineItems(job);
  const customLineItemsCents = customLineAdjustmentCents(customLineItems);
  const manualDiscountCents = manualOnlyDiscountCents(customLineItems);

  const engineServiceFinalCents = Math.max(
    0,
    prePromoCents - onlineDiscountCents - offerDiscountCents - promoCodeDiscountCents,
  );

  const adminOverrideFinal = pick('adminOverrideFinalTotalCents');
  let serviceFinalCents = adminOverrideFinal > 0 ? adminOverrideFinal : 0;
  if (serviceFinalCents <= 0 && engineServiceFinalCents > 0) serviceFinalCents = engineServiceFinalCents;
  if (serviceFinalCents <= 0) serviceFinalCents = pick('finalTotalCents');
  if (serviceFinalCents <= 0 && prePromoCents > 0) serviceFinalCents = engineServiceFinalCents;
  if (serviceFinalCents <= 0) {
    const baseStored = num(job.base_price_cents);
    if (baseStored > 0 && Math.abs(baseStored - customLineItemsCents) > 100) {
      serviceFinalCents = baseStored - customLineItemsCents;
    } else if (baseStored > 0) {
      serviceFinalCents = baseStored;
    }
  }

  let finalTotalCents = Math.max(0, serviceFinalCents + customLineItemsCents);
  if (finalTotalCents < engineServiceFinalCents * 0.25 && engineServiceFinalCents > 0) {
    finalTotalCents = Math.max(0, engineServiceFinalCents + customLineItemsCents);
  }
  if (finalTotalCents <= 0 && engineServiceFinalCents > 0) finalTotalCents = engineServiceFinalCents;
  if (finalTotalCents <= 0 && num(job.deposit_amount_cents) > 0) {
    const dep = num(job.deposit_amount_cents);
    finalTotalCents = Math.round(dep / 0.3);
  }

  const depositOnFile = num(job.deposit_amount_cents) || pick('depositCents');

  const succeeded = payments.filter((p) => isSucceeded(p) && !isVoided(p));
  const seenPayIds = new Set<string>();

  let cashPaidCents = 0;
  let stripePaidCents = 0;
  let zellePaidCents = 0;
  let manualPaidCents = 0;
  let totalPaidCents = 0;
  for (const p of succeeded) {
    const pid = str(p.id);
    if (pid && seenPayIds.has(pid)) continue;
    if (pid) seenPayIds.add(pid);
    const amt = num(p.amount_cents);
    totalPaidCents += amt;
    if (isCash(p)) cashPaidCents += amt;
    else if (isZelle(p)) zellePaidCents += amt;
    else if (isManual(p)) manualPaidCents += amt;
    else if (isStripe(p)) stripePaidCents += amt;
    else manualPaidCents += amt;
  }

  let depositPaidCents = 0;
  for (const p of succeeded) {
    if (isRealStripeDeposit(p)) depositPaidCents += num(p.amount_cents);
  }
  const depositPayment = findDepositPayment(succeeded);
  if (depositPayment && isRealStripeDeposit(depositPayment)) {
    depositPaidCents = Math.max(depositPaidCents, num(depositPayment.amount_cents));
  }

  const rawTotalPaidCents = totalPaidCents;
  const allocatedTotalPaidCents =
    finalTotalCents > 0 ? Math.min(rawTotalPaidCents, finalTotalCents) : rawTotalPaidCents;
  const overpaymentCents = Math.max(0, rawTotalPaidCents - finalTotalCents);
  const remainingBalanceCents = Math.max(0, finalTotalCents - rawTotalPaidCents);

  const promoCode =
    str(job.promo_code) ||
    str(b.promoCode) ||
    str(payload.promo_code) ||
    str(payloadPricing.promoCode) ||
    '';

  return {
    vehicleLines,
    vehicleSubtotalCents,
    addOnSubtotalCents,
    multiCarDiscountCents,
    onlineDiscountCents,
    promoDiscountCents,
    manualDiscountCents,
    prePromoCents,
    serviceFinalCents,
    finalTotalCents,
    depositCents: depositOnFile,
    depositPaidCents,
    stripePaidCents,
    cashPaidCents,
    zellePaidCents,
    manualPaidCents,
    totalPaidCents: rawTotalPaidCents > 0 ? rawTotalPaidCents : allocatedTotalPaidCents,
    rawTotalPaidCents,
    allocatedTotalPaidCents,
    overpaymentCents,
    hasOverpayment: overpaymentCents > 0,
    remainingBalanceCents,
    customLineItemsCents,
    promoCode,
  };
}

/** Persist computed balance on appointment/fallback for Stripe checkout helpers. */
export async function syncJobBalanceDue(
  admin: SupabaseClient,
  job: Row,
  pricing: JobPricingDisplay,
  opts: { appointmentId?: string; fallbackBookingId?: string; isFallback?: boolean },
) {
  const table = opts.isFallback ? 'booking_fallbacks' : 'appointments';
  const id = str(opts.fallbackBookingId || opts.appointmentId || job.id);
  if (!id) return;
  const paymentStatus =
    pricing.remainingBalanceCents <= 0
      ? pricing.totalPaidCents > 0
        ? 'paid'
        : str(job.payment_status)
      : pricing.totalPaidCents > 0
        ? 'balance_due'
        : str(job.payment_status);
  try {
    await admin
      .from(table)
      .update({
        balance_due_cents: pricing.remainingBalanceCents,
        payment_status: paymentStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  } catch {
    /* non-blocking */
  }
}
