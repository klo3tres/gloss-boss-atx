import type { Row } from '@/lib/work-order-resolve';
import { vehiclesFromRow } from '@/lib/work-order-resolve';

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Single pricing snapshot for work order, receipt HTML/PDF, and email. */
export type JobPricingDisplay = {
  vehicleLines: Array<{ name: string; service: string; color: string; priceCents: number }>;
  vehicleSubtotalCents: number;
  multiCarDiscountCents: number;
  onlineDiscountCents: number;
  promoDiscountCents: number;
  prePromoCents: number;
  finalTotalCents: number;
  depositCents: number;
  totalPaidCents: number;
  cashPaidCents: number;
  remainingBalanceCents: number;
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

  let prePromoCents = pick('prePromoCents') || pick('vehicleSubtotalCents') || sumVehicleCents;
  if (prePromoCents <= 0 && sumVehicleCents > 0) prePromoCents = sumVehicleCents;

  const multiCarDiscountCents = pick('multiCarDiscountCents');
  const onlineDiscountCents =
    pick('websitePromoDiscountCents') || pick('onlineDiscountCents') || pick('sitewideDiscountCents');
  const promoDiscountCents = pick('offerDiscountCents') || pick('promoDiscountCents');

  let finalTotalCents = pick('finalTotalCents');
  if (finalTotalCents <= 0 && prePromoCents > 0) {
    finalTotalCents = Math.max(0, prePromoCents - multiCarDiscountCents - onlineDiscountCents - promoDiscountCents);
  }
  if (finalTotalCents <= 0) {
    finalTotalCents = num(job.base_price_cents);
  }

  const depositCents = num(job.deposit_amount_cents) || pick('depositCents');

  const succeeded = payments.filter((p) => {
    const st = String(p.status ?? '').toLowerCase();
    return st === 'succeeded' || st === 'paid' || st === 'comped' || st === 'manual_comped';
  });
  const totalPaidCents = succeeded.reduce((s, p) => s + num(p.amount_cents), 0);
  const cashPaidCents = succeeded
    .filter((p) => String(p.payment_method ?? p.payment_kind ?? '').toLowerCase().includes('cash'))
    .reduce((s, p) => s + num(p.amount_cents), 0);

  let remainingBalanceCents = num(job.balance_due_cents);
  if (remainingBalanceCents <= 0 && finalTotalCents > 0) {
    remainingBalanceCents = Math.max(0, finalTotalCents - totalPaidCents);
  }

  return {
    vehicleLines,
    vehicleSubtotalCents: prePromoCents,
    multiCarDiscountCents,
    onlineDiscountCents,
    promoDiscountCents,
    prePromoCents,
    finalTotalCents,
    depositCents,
    totalPaidCents,
    cashPaidCents,
    remainingBalanceCents,
  };
}
