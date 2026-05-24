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
  return method.includes('stripe') || Boolean(p.stripe_checkout_session_id || p.stripe_payment_intent_id);
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
  totalPaidCents: number;
  remainingBalanceCents: number;
  customLineItemsCents: number;
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
  const promoDiscountCents = pick('offerDiscountCents') || pick('promoDiscountCents');

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

  let serviceFinalCents = pick('finalTotalCents');
  if (serviceFinalCents <= 0 && prePromoCents > 0) {
    serviceFinalCents = Math.max(0, prePromoCents - onlineDiscountCents - promoDiscountCents);
  }
  if (serviceFinalCents <= 0) {
    const baseStored = num(job.base_price_cents);
    serviceFinalCents = baseStored > customLineItemsCents ? baseStored - customLineItemsCents : baseStored;
  }
  const finalTotalCents = Math.max(0, serviceFinalCents + customLineItemsCents);

  const depositOnFile = num(job.deposit_amount_cents) || pick('depositCents');

  const succeeded = payments.filter(isSucceeded);

  let cashPaidCents = succeeded.filter(isCash).reduce((s, p) => s + num(p.amount_cents), 0);
  let stripePaidCents = succeeded.filter(isStripe).reduce((s, p) => s + num(p.amount_cents), 0);
  let totalPaidCents = succeeded.reduce((s, p) => s + num(p.amount_cents), 0);

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

  const remainingBalanceCents = Math.max(0, finalTotalCents - totalPaidCents);

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
    totalPaidCents,
    remainingBalanceCents,
    customLineItemsCents,
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
