/**
 * Canonical order ledger — single source of truth for pricing, discounts, payments, and receipts.
 * All surfaces must read via resolveOrderLedger() or buildReceiptFromLedger().
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { displayChicago, displayLabel, displayMoney } from '@/lib/display-format';
import { hasHistoricalPricingSnapshot } from '@/lib/historical-pricing';
import { resolveJobPricing, type JobPricingDisplay } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { isPricingDuplicateOrPaymentLine } from '@/lib/pricing-custom-lines';
import { readCustomLineItems } from '@/lib/work-order-line-items';
import { resolveWorkOrder, vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { isTestLikeJob } from '@/lib/tech-job-filters';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';
import {
  isManualFieldPayment,
  isRealStripeDeposit,
  isRealStripePayment,
} from '@/lib/payment-classification';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export type LedgerTotals = OrderLedger['totals'];

export type OrderLedgerQuery = {
  orderId?: string;
  workOrderId?: string;
  appointmentId?: string;
  fallbackBookingId?: string;
  paymentId?: string;
  receiptId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  customerId?: string;
  email?: string;
  sourceHint?: string;
};

export type LedgerVehicle = {
  vehicleId: string;
  index: number;
  year: string;
  make: string;
  model: string;
  description: string;
  color: string;
  vehicleClass: string;
  serviceSlug: string;
  serviceTitle: string;
  basePriceCents: number;
  bookedPriceCents: number;
  addOns: Array<{ slug: string; label: string; priceCents: number }>;
};

export type DiscountSource = 'automatic' | 'manual' | 'promo' | 'override';
export type LedgerDiscount = {
  id: string;
  kind: 'online' | 'multi_car' | 'promo' | 'manual' | 'offer';
  label: string;
  amountCents: number;
  source: DiscountSource;
  appliedBy?: string;
  reason?: string;
  stackable: boolean;
  promoCode?: string;
};

export type PaymentBucket =
  | 'stripe_deposit'
  | 'stripe_paid_full'
  | 'stripe_balance'
  | 'stripe_other'
  | 'cash'
  | 'zelle'
  | 'venmo'
  | 'check'
  | 'manual_card'
  | 'comp_free'
  | 'customer_credit'
  | 'other';

export type LedgerPayment = {
  id: string;
  bucket: PaymentBucket;
  label: string;
  amountCents: number;
  status: string;
  method: string;
  paymentKind: string;
  paidAt: string;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  voided: boolean;
  isTest: boolean;
};

export type OrderLedger = {
  refs: {
    workOrderId: string;
    appointmentId: string;
    fallbackBookingId: string;
    customerId: string;
    source: 'appointment' | 'fallback';
    isTest: boolean;
  };
  customer: { name: string; email: string; phone: string; address: string };
  schedule: {
    appointmentAt: string;
    appointmentAtDisplay: string;
    endAt: string;
    jobStatus: string;
    paymentStatus: string;
    completedAt: string;
  };
  vehicles: LedgerVehicle[];
  discounts: LedgerDiscount[];
  payments: LedgerPayment[];
  totals: {
    serviceSubtotalCents: number;
    addOnSubtotalCents: number;
    grossSubtotalCents: number;
    totalDiscountCents: number;
    finalTotalCents: number;
    totalPaidCents: number;
    rawTotalPaidCents: number;
    balanceDueCents: number;
    overpaymentCents: number;
    depositPaidCents: number;
    stripePaidCents: number;
    cashPaidCents: number;
    zellePaidCents: number;
    manualPaidCents: number;
    creditPaidCents: number;
  };
  /** Payments counted toward customer-facing totals (excludes voided; test flagged separately). */
  customerPayments: LedgerPayment[];
  warnings: string[];
  audit: {
    orderSource: 'online_booking' | 'admin_work_order' | 'walk_in';
    bookingSource: string;
    pricingLocked: boolean;
    pricingVersion: string;
    lastRecalculatedAt: string;
    lastReceiptRebuiltAt: string;
    promoCode: string;
    stripeCheckoutSessionId: string;
    stripePaymentIntentId: string;
  };
  /** Raw row + pricing engine output for persistence actions */
  _job: Row;
  _pricing: JobPricingDisplay;
};

function parseAddOns(job: Row, vehicleIndex: number): LedgerVehicle['addOns'] {
  const b = obj(job.booking_pricing_breakdown);
  const lines = Array.isArray(b.addOnLines) ? (b.addOnLines as Row[]) : [];
  const out: LedgerVehicle['addOns'] = [];
  for (const line of lines) {
    const vi = num(line.vehicleIndex ?? line.vehicle_index);
    if (lines.length > 1 && vi !== vehicleIndex) continue;
    out.push({
      slug: str(line.slug || line.addon_slug),
      label: str(line.label || line.slug || 'Add-on'),
      priceCents: num(line.priceCents ?? line.price_cents),
    });
  }
  const vehicles = vehiclesFromRow(job);
  const v = vehicles[vehicleIndex] as Row | undefined;
  if (out.length === 0 && v) {
    const slugs = Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [];
    for (const slug of slugs) {
      out.push({ slug, label: slug.replace(/-/g, ' '), priceCents: 0 });
    }
  }
  return out;
}

function mapVehicles(job: Row): LedgerVehicle[] {
  return vehiclesFromRow(job).map((v, index) => {
    const year = str(v.year);
    const make = str(v.make);
    const model = str(v.model);
    const desc = str(v.vehicle_description || v.description) || [year, make, model].filter(Boolean).join(' ') || `Vehicle ${index + 1}`;
    const booked = num(v.price_cents);
    return {
      vehicleId: str(v.id) || `v-${index}`,
      index,
      year,
      make,
      model,
      description: desc,
      color: str(v.vehicle_color || v.color),
      vehicleClass: normalizeVehicleClass(str(v.vehicle_class) || str(job.vehicle_class)),
      serviceSlug: str(v.service_slug || job.service_slug),
      serviceTitle: displayLabel(str(v.service_slug || job.service_slug)),
      basePriceCents: booked,
      bookedPriceCents: booked,
      addOns: parseAddOns(job, index),
    };
  });
}

function classifyPayment(p: Row): PaymentBucket {
  const kind = str(p.payment_kind).toLowerCase();
  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  const amt = num(p.amount_cents);
  if (amt === 0 || kind.includes('comp') || kind.includes('free') || method.includes('comp')) return 'comp_free';
  if (kind.includes('credit') || method.includes('credit')) return 'customer_credit';
  if (isManualFieldPayment(p)) {
    if (method.includes('cash')) return 'cash';
    if (method.includes('zelle')) return 'zelle';
    if (method.includes('venmo')) return 'venmo';
    if (method.includes('check')) return 'check';
    return 'other';
  }
  if (isRealStripeDeposit(p)) return 'stripe_deposit';
  if (isRealStripePayment(p)) {
    if (kind.includes('booking_full') || kind.includes('paid_full') || kind === 'field_full') return 'stripe_paid_full';
    if (kind.includes('final_balance') || kind.includes('remaining')) return 'stripe_balance';
    return 'stripe_other';
  }
  return 'other';
}

function paymentLabel(bucket: PaymentBucket, p: Row): string {
  const map: Record<PaymentBucket, string> = {
    stripe_deposit: 'Stripe deposit paid',
    stripe_paid_full: 'Stripe paid in full',
    stripe_balance: 'Stripe balance payment',
    stripe_other: 'Stripe payment',
    cash: 'Cash paid',
    zelle: 'Zelle paid',
    venmo: 'Venmo paid',
    check: 'Check / manual paid',
    manual_card: 'Manual card paid',
    comp_free: 'Comp / FREE',
    customer_credit: 'Customer credit applied',
    other: 'Payment',
  };
  return map[bucket] ?? 'Payment';
}

function mapPayments(rows: Row[], isTest: boolean): LedgerPayment[] {
  return rows.map((p) => {
    const bucket = classifyPayment(p);
    return {
      id: str(p.id),
      bucket,
      label: paymentLabel(bucket, p),
      amountCents: num(p.amount_cents),
      status: str(p.status),
      method: str(p.payment_method || p.payment_kind),
      paymentKind: str(p.payment_kind),
      paidAt: str(p.paid_at || p.created_at),
      stripeSessionId: str(p.stripe_checkout_session_id),
      stripePaymentIntentId: str(p.stripe_payment_intent_id),
      voided: Boolean(p.voided_at || p.voided === true) || str(p.status).toLowerCase() === 'voided',
      isTest,
    };
  });
}

function buildDiscounts(job: Row, pricing: JobPricingDisplay): LedgerDiscount[] {
  const out: LedgerDiscount[] = [];
  const b = obj(job.booking_pricing_breakdown);
  if (pricing.onlineDiscountCents > 0) {
    out.push({
      id: 'disc-online',
      kind: 'online',
      label: 'Online booking discount',
      amountCents: pricing.onlineDiscountCents,
      source: b.onlineDiscountDisabled === true ? 'override' : 'automatic',
      stackable: true,
    });
  }
  if (pricing.multiCarDiscountCents > 0) {
    out.push({
      id: 'disc-multicar',
      kind: 'multi_car',
      label: 'Multi-car discount',
      amountCents: pricing.multiCarDiscountCents,
      source: b.multiCarDisabled === true ? 'override' : 'automatic',
      stackable: true,
    });
  }
  const promoTotal = pricing.promoDiscountCents;
  if (promoTotal > 0) {
    out.push({
      id: 'disc-promo',
      kind: 'promo',
      label: pricing.promoCode ? `Promo ${pricing.promoCode}` : 'Promo discount',
      amountCents: promoTotal,
      source: 'promo',
      promoCode: pricing.promoCode,
      stackable: true,
    });
  } else if (pricing.promoCode) {
    out.push({
      id: 'disc-promo-code',
      kind: 'promo',
      label: `Promo code: ${pricing.promoCode}`,
      amountCents: 0,
      source: 'promo',
      promoCode: pricing.promoCode,
      stackable: true,
    });
  }
  const manualFromLines = pricing.manualDiscountCents;
  const items = readCustomLineItems(job);
  for (const item of items) {
    if (isPricingDuplicateOrPaymentLine(item)) continue;
    if (item.kind === 'discount_adjustment' || item.amountCents < 0) {
      const cents = Math.abs(item.amountCents);
      out.push({
        id: `disc-manual-${item.id}`,
        kind: 'manual',
        label: item.label || 'Manual adjustment',
        amountCents: cents,
        source: 'manual',
        reason: item.notes,
        appliedBy: item.createdBy,
        stackable: false,
      });
    }
  }
  if (manualFromLines > 0 && !out.some((d) => d.kind === 'manual')) {
    out.push({
      id: 'disc-manual-total',
      kind: 'manual',
      label: 'Manual discount',
      amountCents: manualFromLines,
      source: 'manual',
      stackable: false,
    });
  }
  return out;
}

function orderSourceFromJob(job: Row): OrderLedger['audit']['orderSource'] {
  const src = str(job.booking_source).toLowerCase();
  if (src.includes('tech_workflow') || src.includes('walk')) return 'walk_in';
  if (src.includes('admin')) return 'admin_work_order';
  return 'online_booking';
}

/** Resolve refs from any business identifier (same logic as order-snapshot-engine). */
export async function resolveOrderLedgerRefs(
  admin: SupabaseClient,
  query: OrderLedgerQuery,
): Promise<{ workOrderId: string; source: 'appointment' | 'fallback'; appointmentId: string; fallbackBookingId: string } | null> {
  const { resolveOrderSnapshotQuery } = await import('@/lib/order-snapshot-engine');
  return resolveOrderSnapshotQuery(admin, query);
}

/** Canonical order ledger — the only pricing/payment truth for an order. */
function buildLedgerWarnings(
  job: Row,
  payments: LedgerPayment[],
  pricing: JobPricingDisplay,
  isTest: boolean,
): string[] {
  const warnings: string[] = [];
  const sessionId = str(job.stripe_checkout_session_id || job.final_payment_checkout_session_id);
  const hasStripeSession = Boolean(sessionId);
  const hasStripePayment = payments.some(
    (p) => !p.voided && (p.bucket.startsWith('stripe_') || p.stripeSessionId || p.stripePaymentIntentId),
  );
  if (hasStripeSession && !hasStripePayment && str(job.payment_status).includes('deposit')) {
    warnings.push('Stripe checkout session on file but no Stripe payment row — use Advanced repair → Sync Stripe if this is a legacy job.');
  }
  if (pricing.hasOverpayment) {
    warnings.push(`Overpayment: ${displayMoney(pricing.rawTotalPaidCents)} recorded vs ${displayMoney(pricing.finalTotalCents)} job total. Void duplicate payments under Advanced repair.`);
  }
  if (isTest) warnings.push('Test/sandbox job — excluded from default revenue unless include-test is enabled.');
  if (vehiclesFromRow(job).length === 0) warnings.push('No vehicles on this order — add vehicles before sending a customer receipt.');
  return warnings;
}

/** Resolve ledger or null — callers must show a hard error if null. */
export async function resolveOrderLedger(
  admin: SupabaseClient,
  query: OrderLedgerQuery,
): Promise<OrderLedger | null> {
  const normalized: OrderLedgerQuery = {
    ...query,
    workOrderId: query.workOrderId || query.orderId,
  };
  const refs = await resolveOrderLedgerRefs(admin, normalized);
  if (!refs) return null;

  const resolved = await resolveWorkOrder(admin, refs.workOrderId, query.sourceHint ?? refs.source);
  if (!resolved) return null;

  const isFallback = resolved.isFallback;
  let job = resolved.row;
  if (resolved.partial) {
    const table = isFallback ? 'booking_fallbacks' : 'appointments';
    const { data: full } = await admin.from(table).select('*').eq('id', resolved.canonicalId).maybeSingle();
    if (full) job = full as Row;
  }
  const appointmentId = isFallback ? '' : resolved.canonicalId;
  const fallbackBookingId = isFallback ? resolved.canonicalId : '';
  const isTest = isTestLikeJob(job);

  const paymentRows = await fetchPaymentsForJob(admin, job, {
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
    isFallback,
  });

  let pricing = resolveJobPricing(job, paymentRows);
  const bLedger = obj(job.booking_pricing_breakdown);
  const storedFinal = num(bLedger.finalTotalCents);
  const adminOverride = num(bLedger.adminOverrideFinalTotalCents);
  const baseStored = num(job.base_price_cents);
  const authoritativeFinal =
    adminOverride > 0 ? adminOverride : baseStored > 0 ? baseStored : storedFinal > 0 ? storedFinal : pricing.finalTotalCents;
  const storedOnline = num(bLedger.websitePromoDiscountCents) || num(bLedger.onlineDiscountCents);
  const storedMulti = num(bLedger.multiCarDiscountCents);
  if (authoritativeFinal > 0) {
    const online = storedOnline > 0 ? storedOnline : pricing.onlineDiscountCents;
    const multi = storedMulti > 0 ? storedMulti : pricing.multiCarDiscountCents;
    const needsHeal =
      pricing.finalTotalCents !== authoritativeFinal ||
      pricing.onlineDiscountCents !== online ||
      pricing.multiCarDiscountCents !== multi;
    if (needsHeal) {
      pricing = {
        ...pricing,
        onlineDiscountCents: online,
        multiCarDiscountCents: multi,
        serviceFinalCents: Math.max(0, authoritativeFinal - pricing.customLineItemsCents),
        finalTotalCents: authoritativeFinal,
        remainingBalanceCents: Math.max(0, authoritativeFinal - pricing.rawTotalPaidCents),
        overpaymentCents: Math.max(0, pricing.rawTotalPaidCents - authoritativeFinal),
        hasOverpayment: pricing.rawTotalPaidCents > authoritativeFinal,
        allocatedTotalPaidCents: Math.min(pricing.rawTotalPaidCents, authoritativeFinal),
        totalPaidCents: pricing.rawTotalPaidCents,
        priceSource:
          adminOverride > 0
            ? 'admin_override'
            : baseStored > 0
              ? 'saved_base_price'
              : storedFinal > 0
                ? 'breakdown_final'
                : pricing.priceSource,
      };
    }
  }

  const vehicles = mapVehicles(job);
  const discounts = buildDiscounts(job, pricing);
  const payments = mapPayments(paymentRows, isTest);

  const serviceSubtotalCents = pricing.vehicleSubtotalCents;
  const addOnSubtotalCents = pricing.addOnSubtotalCents;
  const grossSubtotalCents = serviceSubtotalCents + addOnSubtotalCents;
  const totalDiscountCents =
    pricing.onlineDiscountCents +
    pricing.multiCarDiscountCents +
    pricing.promoDiscountCents +
    pricing.manualDiscountCents;

  const address = [job.service_address, job.service_city, job.service_state, job.service_zip]
    .map(str)
    .filter(Boolean)
    .join(', ');

  const b = obj(job.booking_pricing_breakdown);
  const customerPayments = payments.filter((p) => !p.voided && (!isTest || !p.isTest));
  const warnings = buildLedgerWarnings(job, payments, pricing, isTest);

  let lastReceiptRebuiltAt = '';
  if (appointmentId || fallbackBookingId) {
    const rQ = appointmentId
      ? admin.from('receipts').select('updated_at, metadata').eq('appointment_id', appointmentId).order('updated_at', { ascending: false }).limit(1)
      : admin.from('receipts').select('updated_at, metadata').eq('fallback_booking_id', fallbackBookingId).order('updated_at', { ascending: false }).limit(1);
    const { data: rRows } = await rQ;
    const rRow = (rRows as Row[] | null)?.[0];
    if (rRow) {
      lastReceiptRebuiltAt = str(rRow.updated_at);
      const meta = obj(rRow.metadata);
      if (meta.rebuiltAt) lastReceiptRebuiltAt = str(meta.rebuiltAt);
    }
  }

  return {
    refs: {
      workOrderId: resolved.canonicalId,
      appointmentId,
      fallbackBookingId,
      customerId: str(job.customer_id),
      source: isFallback ? 'fallback' : 'appointment',
      isTest,
    },
    customer: {
      name: str(job.guest_name) || 'Customer',
      email: str(job.guest_email),
      phone: str(job.guest_phone),
      address,
    },
    schedule: {
      appointmentAt: str(job.scheduled_start),
      appointmentAtDisplay: displayChicago(job.scheduled_start),
      endAt: str(job.estimated_end),
      jobStatus: str(job.status),
      paymentStatus: str(job.payment_status),
      completedAt: str(job.job_completed_at || job.completed_at),
    },
    vehicles,
    discounts,
    payments,
    customerPayments,
    warnings,
    totals: {
      serviceSubtotalCents,
      addOnSubtotalCents,
      grossSubtotalCents,
      totalDiscountCents,
      finalTotalCents: pricing.finalTotalCents,
      totalPaidCents: pricing.totalPaidCents,
      rawTotalPaidCents: pricing.rawTotalPaidCents,
      balanceDueCents: pricing.remainingBalanceCents,
      overpaymentCents: pricing.overpaymentCents,
      depositPaidCents: pricing.depositPaidCents,
      stripePaidCents: pricing.stripePaidCents,
      cashPaidCents: pricing.cashPaidCents,
      zellePaidCents: pricing.zellePaidCents,
      manualPaidCents: pricing.manualPaidCents,
      creditPaidCents: pricing.creditPaidCents || 0,
    },
    audit: {
      orderSource: orderSourceFromJob(job),
      bookingSource: str(job.booking_source),
      pricingLocked: hasHistoricalPricingSnapshot(job),
      pricingVersion: str(b.repricedAt || b.pricingVersion || job.updated_at || ''),
      lastRecalculatedAt: str(b.repricedAt || ''),
      lastReceiptRebuiltAt,
      promoCode: str(job.promo_code) || pricing.promoCode,
      stripeCheckoutSessionId: str(job.stripe_checkout_session_id || job.final_payment_checkout_session_id),
      stripePaymentIntentId: str(job.stripe_payment_intent_id),
    },
    _job: job,
    _pricing: pricing,
  };
}
