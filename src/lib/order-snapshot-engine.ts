import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveJobPricing, type JobPricingDisplay } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { hasHistoricalPricingSnapshot } from '@/lib/historical-pricing';
import { readCustomLineItems } from '@/lib/work-order-line-items';
import { resolveWorkOrder, vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import { buildReceiptBreakdown, type ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export type OrderSnapshotQuery = {
  workOrderId?: string;
  appointmentId?: string;
  fallbackBookingId?: string;
  customerId?: string;
  paymentId?: string;
  receiptId?: string;
  stripeCheckoutSessionId?: string;
  stripePaymentIntentId?: string;
  email?: string;
  phone?: string;
  sourceHint?: string;
};

export type SnapshotVehicle = {
  index: number;
  year: string;
  make: string;
  model: string;
  description: string;
  color: string;
  vehicleClass: string;
  serviceSlug: string;
  priceCents: number;
  addOns: Array<{ slug: string; label: string; priceCents: number }>;
  status: string;
};

export type SnapshotPaymentRow = {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  paidAt: string;
  stripeSessionId: string;
  voided: boolean;
};

export type OrderSnapshot = {
  refs: {
    workOrderId: string;
    appointmentId: string;
    fallbackBookingId: string;
    customerId: string;
    source: 'appointment' | 'fallback';
    receiptId: string;
    paymentId: string;
  };
  customer: {
    name: string;
    email: string;
    phone: string;
  };
  serviceAddress: string;
  scheduledStart: string;
  scheduledEnd: string;
  vehicles: SnapshotVehicle[];
  customLineItems: ReturnType<typeof readCustomLineItems>;
  originalBookingBreakdown: Record<string, unknown>;
  currentBreakdown: Record<string, unknown>;
  pricing: JobPricingDisplay;
  pricingLocked: boolean;
  payments: {
    all: SnapshotPaymentRow[];
    stripeCents: number;
    cashCents: number;
    zelleCents: number;
    manualCents: number;
  };
  agreement: { signed: boolean; agreementId: string; signedAt: string };
  receiptLines: ReceiptBreakdownLine[];
  promoCode: string;
  notes: string;
  jobStatus: string;
  paymentStatus: string;
};

function paymentBucket(method: string): 'stripe' | 'cash' | 'zelle' | 'manual' {
  const m = method.toLowerCase();
  if (m.includes('cash')) return 'cash';
  if (m.includes('zelle') || m.includes('venmo')) return 'zelle';
  if (m.includes('manual') || m.includes('check') || m.includes('transfer')) return 'manual';
  if (m.includes('stripe') || m.includes('card')) return 'stripe';
  return 'manual';
}

function parseAddOnsForVehicle(job: Row, vehicleIndex: number): SnapshotVehicle['addOns'] {
  const b = obj(job.booking_pricing_breakdown);
  const lines = Array.isArray(b.addOnLines) ? (b.addOnLines as Row[]) : [];
  const out: SnapshotVehicle['addOns'] = [];
  for (const line of lines) {
    const vi = num(line.vehicleIndex ?? line.vehicle_index);
    if (lines.length > 1 && vi !== vehicleIndex) continue;
    out.push({
      slug: str(line.slug || line.addon_slug),
      label: str(line.label || line.slug || 'Add-on'),
      priceCents: num(line.priceCents ?? line.price_cents),
    });
  }
  const slugs = Array.isArray(b.addOnSlugs) ? (b.addOnSlugs as string[]) : [];
  if (out.length === 0 && slugs.length > 0 && vehicleIndex === 0) {
    const total = num(b.addOnSubtotalCents);
    const each = slugs.length ? Math.round(total / slugs.length) : 0;
    for (const slug of slugs) {
      out.push({ slug, label: slug.replace(/-/g, ' '), priceCents: each });
    }
  }
  return out;
}

function mapVehicles(job: Row): SnapshotVehicle[] {
  const raw = vehiclesFromRow(job);
  return raw.map((v, index) => {
    const year = str(v.year);
    const make = str(v.make);
    const model = str(v.model);
    const description = str(v.vehicle_description || v.description) || [year, make, model].filter(Boolean).join(' ') || `Vehicle ${index + 1}`;
    return {
      index,
      year,
      make,
      model,
      description,
      color: str(v.vehicle_color || v.color),
      vehicleClass: normalizeVehicleClass(str(v.vehicle_class || job.vehicle_class) || 'sedan'),
      serviceSlug: str(v.service_slug || job.service_slug),
      priceCents: num(v.price_cents),
      addOns: parseAddOnsForVehicle(job, index),
      status: str(v.status || 'scheduled'),
    };
  });
}

function mapPayments(rows: Row[]): OrderSnapshot['payments'] {
  const seen = new Set<string>();
  const all: SnapshotPaymentRow[] = [];
  let stripeCents = 0;
  let cashCents = 0;
  let zelleCents = 0;
  let manualCents = 0;

  for (const p of rows) {
    const id = str(p.id);
    if (!id || seen.has(id)) continue;
    if (p.voided_at || p.voided === true || str(p.status).toLowerCase() === 'voided') continue;
    seen.add(id);
    const amountCents = num(p.amount_cents);
    const method = str(p.payment_method || p.payment_kind || 'payment');
    const bucket = paymentBucket(method);
    if (bucket === 'stripe') stripeCents += amountCents;
    else if (bucket === 'cash') cashCents += amountCents;
    else if (bucket === 'zelle') zelleCents += amountCents;
    else manualCents += amountCents;
    all.push({
      id,
      amountCents,
      method,
      status: str(p.status),
      paidAt: str(p.paid_at || p.created_at),
      stripeSessionId: str(p.stripe_checkout_session_id),
      voided: false,
    });
  }

  return { all, stripeCents, cashCents, zelleCents, manualCents };
}

/** Resolve any business reference to a work order row. */
export async function resolveOrderSnapshotQuery(
  admin: SupabaseClient,
  query: OrderSnapshotQuery,
): Promise<{ workOrderId: string; source: 'appointment' | 'fallback'; appointmentId: string; fallbackBookingId: string } | null> {
  let appointmentId = str(query.appointmentId);
  let fallbackBookingId = str(query.fallbackBookingId);
  let workOrderId = str(query.workOrderId);

  if (str(query.receiptId)) {
    const { data } = await admin.from('receipts').select('appointment_id, fallback_booking_id').eq('id', query.receiptId).maybeSingle();
    if (data) {
      appointmentId = appointmentId || str((data as Row).appointment_id);
      fallbackBookingId = fallbackBookingId || str((data as Row).fallback_booking_id);
    }
  }

  if (str(query.paymentId)) {
    const { data } = await admin.from('payments').select('appointment_id, fallback_booking_id').eq('id', query.paymentId).maybeSingle();
    if (data) {
      appointmentId = appointmentId || str((data as Row).appointment_id);
      fallbackBookingId = fallbackBookingId || str((data as Row).fallback_booking_id);
      workOrderId = workOrderId || appointmentId || fallbackBookingId;
    }
  }

  const sessionId = str(query.stripeCheckoutSessionId);
  if (sessionId) {
    const { data } = await admin.from('payments').select('appointment_id, fallback_booking_id').eq('stripe_checkout_session_id', sessionId).limit(1).maybeSingle();
    if (data) {
      appointmentId = appointmentId || str((data as Row).appointment_id);
      fallbackBookingId = fallbackBookingId || str((data as Row).fallback_booking_id);
    }
    if (!appointmentId && !fallbackBookingId) {
      const { data: appt } = await admin.from('appointments').select('id').eq('stripe_checkout_session_id', sessionId).maybeSingle();
      appointmentId = str((appt as Row | null)?.id);
    }
  }

  const intentId = str(query.stripePaymentIntentId);
  if (intentId) {
    const { data } = await admin.from('payments').select('appointment_id, fallback_booking_id').eq('stripe_payment_intent_id', intentId).limit(1).maybeSingle();
    if (data) {
      appointmentId = appointmentId || str((data as Row).appointment_id);
      fallbackBookingId = fallbackBookingId || str((data as Row).fallback_booking_id);
    }
  }

  if (str(query.customerId) && !workOrderId && !appointmentId && !fallbackBookingId) {
    const { data } = await admin
      .from('appointments')
      .select('id')
      .eq('customer_id', query.customerId)
      .order('scheduled_start', { ascending: false })
      .limit(1)
      .maybeSingle();
    appointmentId = str((data as Row | null)?.id);
  }

  const email = str(query.email).toLowerCase();
  if (email && !workOrderId && !appointmentId && !fallbackBookingId) {
    const { data } = await admin.from('appointments').select('id').eq('guest_email', email).order('created_at', { ascending: false }).limit(1).maybeSingle();
    appointmentId = str((data as Row | null)?.id);
  }

  workOrderId = workOrderId || appointmentId || fallbackBookingId;
  if (!workOrderId) return null;

  const source: 'appointment' | 'fallback' = fallbackBookingId && !appointmentId ? 'fallback' : 'appointment';
  return {
    workOrderId,
    source: appointmentId ? 'appointment' : source,
    appointmentId: appointmentId || (source === 'appointment' ? workOrderId : ''),
    fallbackBookingId: fallbackBookingId || (source === 'fallback' ? workOrderId : ''),
  };
}

/** Canonical order snapshot — single source of truth for pricing, vehicles, payments. */
export async function loadOrderSnapshot(
  admin: SupabaseClient,
  query: OrderSnapshotQuery,
): Promise<OrderSnapshot | null> {
  const refs = await resolveOrderSnapshotQuery(admin, query);
  if (!refs) return null;

  const resolved = await resolveWorkOrder(admin, refs.workOrderId, query.sourceHint ?? refs.source);
  if (!resolved) return null;

  const job = resolved.row;
  const isFallback = resolved.isFallback;
  const appointmentId = isFallback ? '' : resolved.canonicalId;
  const fallbackBookingId = isFallback ? resolved.canonicalId : '';

  const paymentRows = await fetchPaymentsForJob(admin, job, {
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
    isFallback,
  });

  const pricing = resolveJobPricing(job, paymentRows);
  const originalBookingBreakdown = obj(job.booking_pricing_breakdown);
  const currentBreakdown = { ...originalBookingBreakdown };

  let agreementSigned = false;
  let agreementId = '';
  let signedAt = '';
  if (!isFallback) {
    const { data: ag } = await admin
      .from('signed_agreements')
      .select('id, signed_at')
      .eq('appointment_id', resolved.canonicalId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ag) {
      agreementSigned = true;
      agreementId = str((ag as Row).id);
      signedAt = str((ag as Row).signed_at);
    }
  } else {
    const { data: ag } = await admin
      .from('signed_agreements')
      .select('id, signed_at')
      .eq('fallback_booking_id', resolved.canonicalId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ag) {
      agreementSigned = true;
      agreementId = str((ag as Row).id);
      signedAt = str((ag as Row).signed_at);
    }
  }

  const serviceAddress = [job.service_address, job.service_city, job.service_state, job.service_zip]
    .map(str)
    .filter(Boolean)
    .join(', ');

  return {
    refs: {
      workOrderId: resolved.canonicalId,
      appointmentId,
      fallbackBookingId,
      customerId: str(job.customer_id),
      source: isFallback ? 'fallback' : 'appointment',
      receiptId: str(query.receiptId),
      paymentId: str(query.paymentId),
    },
    customer: {
      name: str(job.guest_name),
      email: str(job.guest_email),
      phone: str(job.guest_phone),
    },
    serviceAddress,
    scheduledStart: str(job.scheduled_start),
    scheduledEnd: str(job.estimated_end),
    vehicles: mapVehicles(job),
    customLineItems: readCustomLineItems(job),
    originalBookingBreakdown,
    currentBreakdown,
    pricing,
    pricingLocked: hasHistoricalPricingSnapshot(job),
    payments: mapPayments(paymentRows),
    agreement: { signed: agreementSigned, agreementId, signedAt },
    receiptLines: buildReceiptBreakdown(job, pricing),
    promoCode: str(job.promo_code),
    notes: str(job.notes),
    jobStatus: str(job.status),
    paymentStatus: str(job.payment_status),
  };
}
