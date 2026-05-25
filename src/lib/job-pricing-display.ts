import type { SupabaseClient } from '@supabase/supabase-js';
import type { Row } from '@/lib/work-order-resolve';
import { vehiclesFromRow } from '@/lib/work-order-resolve';
import { findDepositPayment } from '@/lib/payments-resolve';
import { customLineItemsTotalCents, readCustomLineItems } from '@/lib/work-order-line-items';

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
  const st = str(p.status).toLowerCase();
  return st === 'succeeded' || st === 'paid' || st === 'comped' || st === 'manual_comped';
}

function isCash(p: Row) {
  return str(p.payment_method ?? p.payment_kind).toLowerCase().includes('cash');
}

function isStripe(p: Row) {
  if (isCash(p)) return false;
  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  if (method.includes('zelle') || method.includes('venmo') || method.includes('manual') || method.includes('check')) return false;
  return method.includes('stripe') || method.includes('card') || Boolean(p.stripe_checkout_session_id || p.stripe_payment_intent_id);
}

function isZelle(p: Row) {
  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  return method.includes('zelle') || method.includes('venmo');
}

function isManual(p: Row) {
  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  return method.includes('manual') || method.includes('check') || method.includes('transfer');
}

function isVoided(p: Row) {
  return Boolean(p.voided_at || p.voided === true) || str(p.status).toLowerCase() === 'voided';
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

  const pick = (key: string) => num(b[key] ?? payloadPricing[key]);

  const vehicleSubtotalCents = pick('vehicleSubtotalCents') || sumVehicleCents;
  const addOnSubtotalCents = pick('addOnSubtotalCents');
  const multiCarDiscountCents = pick('multiCarDiscountCents');
  const onlineDiscountCents =
    pick('websitePromoDiscountCents') || pick('onlineDiscountCents') || pick('sitewideDiscountCents');
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
  const customLineItemsCents = customLineItemsTotalCents(customLineItems);
  const manualDiscountCents = customLineItems
    .filter((i) => i.kind === 'discount_adjustment' || i.amountCents < 0)
    .reduce((s, i) => s + Math.abs(i.amountCents), 0);

  const adminOverrideFinal = pick('adminOverrideFinalTotalCents');
  let serviceFinalCents = adminOverrideFinal > 0 ? adminOverrideFinal : pick('finalTotalCents');
  if (serviceFinalCents <= 0 && prePromoCents > 0) {
    serviceFinalCents = Math.max(0, prePromoCents - onlineDiscountCents - offerDiscountCents - promoCodeDiscountCents);
  }
  if (serviceFinalCents <= 0) {
    const baseStored = num(job.base_price_cents);
    serviceFinalCents = baseStored > customLineItemsCents ? baseStored - customLineItemsCents : baseStored;
  }
  const finalTotalCents = Math.max(0, serviceFinalCents + customLineItemsCents);

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

  // Deposit recorded on appointment but payment row missing — credit deposit when Stripe session / status indicates paid
  if (totalPaidCents < depositOnFile && depositOnFile > 0) {
    const payStatus = str(job.payment_status).toLowerCase();
    const hasStripeSession = Boolean(str(job.stripe_checkout_session_id));
    const depositLikelyPaid =
      hasStripeSession ||
      payStatus.includes('deposit') ||
      payStatus === 'confirmed' ||
      payStatus === 'deposit_paid' ||
      payStatus.includes('paid');
    if (depositLikelyPaid) {
      const inferred = depositOnFile - totalPaidCents;
      totalPaidCents += inferred;
      stripePaidCents += inferred;
    }
  }

  const depositPayment = findDepositPayment(succeeded);
  let depositPaidCents = 0;
  if (depositPayment) {
    depositPaidCents = num(depositPayment.amount_cents);
  } else if (depositOnFile > 0 && stripePaidCents >= depositOnFile) {
    depositPaidCents = depositOnFile;
  } else if (depositOnFile > 0 && totalPaidCents > 0) {
    depositPaidCents = Math.min(depositOnFile, totalPaidCents);
  }

  const rawTotalPaidCents = totalPaidCents;
  const allocatedTotalPaidCents = Math.min(totalPaidCents, finalTotalCents);
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
    totalPaidCents: allocatedTotalPaidCents,
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
