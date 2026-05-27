'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import {
  computeQuoteFromInputs,
  loadDealConfigForBooking,
  resolveVehicleLinesPricing,
} from '@/lib/booking-server-shared';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { readCustomLineItems, mergePricingBreakdownWithLineItems } from '@/lib/work-order-line-items';
import { vehiclesFromRow, type Row } from '@/lib/work-order-resolve';
import type { DealConfig } from '@/lib/site-config';
import { computeBookingPricing } from '@/lib/booking-pricing';

function str(v: FormDataEntryValue | unknown | null) {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function parseCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.abs(n) * 100);
}

async function requireAdmin() {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) return null;
  const admin = tryCreateAdminSupabase();
  if (!admin) return null;
  return { admin, userId: session.user.id };
}

async function loadJob(admin: Awaited<ReturnType<typeof tryCreateAdminSupabase>>, formData: FormData) {
  if (!admin) return null;
  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const source = str(formData.get('source'));
  const table = source === 'fallback' || fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  if (!jobId) return null;
  const { data } = await admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!data) return null;
  return { table, jobId, job: data as Row, isFallback: table === 'booking_fallbacks' };
}

async function persistPricing(
  ctx: NonNullable<Awaited<ReturnType<typeof loadJob>>>,
  admin: NonNullable<Awaited<ReturnType<typeof tryCreateAdminSupabase>>>,
  breakdown: Record<string, unknown>,
  vehicles?: Array<Record<string, unknown>>,
) {
  const customItems = readCustomLineItems({ ...ctx.job, booking_pricing_breakdown: breakdown });
  const breakdownWithLines = {
    ...breakdown,
    customLineItems: customItems,
  };
  const payments = await fetchPaymentsForJob(admin, ctx.job, {
    appointmentId: ctx.isFallback ? undefined : ctx.jobId,
    fallbackBookingId: ctx.isFallback ? ctx.jobId : undefined,
    isFallback: ctx.isFallback,
  });
  const jobWithLines = {
    ...ctx.job,
    booking_pricing_breakdown: breakdownWithLines,
    booking_vehicles: vehicles ?? ctx.job.booking_vehicles,
  };
  const pricing = resolveJobPricing(jobWithLines, payments);
  const merged = mergePricingBreakdownWithLineItems(jobWithLines, customItems, {
    finalTotalCents: pricing.finalTotalCents,
    vehicleSubtotalCents: pricing.vehicleSubtotalCents,
    customLineItemsCents: pricing.customLineItemsCents,
  });

  const patch: Record<string, unknown> = {
    booking_pricing_breakdown: merged,
    base_price_cents: pricing.finalTotalCents,
    balance_due_cents: pricing.remainingBalanceCents,
    updated_at: new Date().toISOString(),
  };
  if (vehicles) {
    patch.booking_vehicles = vehicles;
    patch.vehicle_description = vehicles
      .map((v) => str(v.vehicle_description))
      .filter(Boolean)
      .join(' · ');
  }

  await admin.from(ctx.table).update(patch).eq('id', ctx.jobId);
  await syncJobBalanceDue(admin, ctx.job, pricing, {
    appointmentId: ctx.isFallback ? undefined : ctx.jobId,
    fallbackBookingId: ctx.isFallback ? ctx.jobId : undefined,
    isFallback: ctx.isFallback,
  });

  revalidatePath(`/tech/work-orders/${ctx.jobId}`);
  revalidatePath('/admin/work-orders');
  revalidatePath('/dashboard');
  revalidatePath(`/admin/receipts`);

  const { generateWorkOrderReceiptActionState } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
  const rebuildFd = new FormData();
  if (ctx.isFallback) rebuildFd.set('fallbackBookingId', ctx.jobId);
  else rebuildFd.set('appointmentId', ctx.jobId);
  await generateWorkOrderReceiptActionState(null, rebuildFd);
}

export async function updateWorkOrderVehiclePriceAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return { ok: false, error: 'Unauthorized' };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx) return { ok: false, error: 'Job not found' };

  const vehicleIndex = Math.max(0, parseInt(str(formData.get('vehicleIndex')) || '0', 10));
  const priceCents = parseCents(str(formData.get('priceDollars')));
  if (priceCents == null) return { ok: false, error: 'Invalid price' };

  const vehicles = vehiclesFromRow(ctx.job).map((v, i) => {
    const row = { ...(v as Row) };
    if (i === vehicleIndex) row.price_cents = priceCents;
    return row;
  });

  const b = { ...(ctx.job.booking_pricing_breakdown as Record<string, unknown>) };
  const vehicleSubtotalCents = vehicles.reduce((s, v) => s + (typeof v.price_cents === 'number' ? v.price_cents : 0), 0);
  b.vehicleSubtotalCents = vehicleSubtotalCents;
  b.adminPriceEditAt = new Date().toISOString();
  b.adminPriceEditBy = gate.userId;

  await persistPricing(ctx, gate.admin, b, vehicles);
  return { ok: true };
}

export async function setWorkOrderPromoAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return { ok: false, error: 'Unauthorized' };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx) return { ok: false, error: 'Job not found' };

  const promoCode = str(formData.get('promoCode')).toUpperCase();
  const remove = str(formData.get('remove')) === 'true';

  if (remove) {
    const b = { ...(ctx.job.booking_pricing_breakdown as Record<string, unknown>) };
    b.promoDiscountCents = 0;
    b.offerDiscountCents = 0;
    await gate.admin.from(ctx.table).update({ promo_code: null, updated_at: new Date().toISOString() }).eq('id', ctx.jobId);
    await persistPricing(ctx, gate.admin, b);
    return { ok: true };
  }

  const vehicles = vehiclesFromRow(ctx.job);
  const lines = vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || str(ctx.job.service_slug),
    vehicleClass: str(v.vehicle_class) || 'sedan',
    vehicleDescription: str(v.vehicle_description) || 'Vehicle',
    addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
  }));
  const addOns = lines.flatMap((l) => l.addOnSlugs ?? []);

  const quote = await computeQuoteFromInputs(gate.admin, {
    lines,
    addOns,
    promoCode,
    paymentChoice: 'deposit',
  });
  if (!quote.ok) return { ok: false, error: quote.error };

  await gate.admin.from(ctx.table).update({ promo_code: promoCode || null }).eq('id', ctx.jobId);
  const customItems = readCustomLineItems(ctx.job);
  const b = {
    ...(ctx.job.booking_pricing_breakdown as Record<string, unknown>),
    ...quote.breakdown,
    customLineItems: customItems,
    promoDiscountCents: quote.breakdown.promoDiscountCents,
    offerDiscountCents: quote.breakdown.offerDiscountCents,
    websitePromoDiscountCents: quote.breakdown.websitePromoDiscountCents,
    multiCarDiscountCents: quote.breakdown.multiCarDiscountCents,
    finalTotalCents: quote.breakdown.finalTotalCents,
    prePromoCents: quote.breakdown.prePromoCents,
    vehicleSubtotalCents: quote.breakdown.vehicleSubtotalCents,
    addOnSubtotalCents: quote.breakdown.addOnSubtotalCents,
  };
  await persistPricing(ctx, gate.admin, b, vehicles as Row[]);
  return { ok: true };
}

export async function toggleWorkOrderDiscountAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return { ok: false, error: 'Unauthorized' };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx) return { ok: false, error: 'Job not found' };

  const kind = str(formData.get('discountKind'));
  const enable = str(formData.get('enable')) === 'true';
  const vehicles = vehiclesFromRow(ctx.job);
  if (kind === 'multi_car' && enable && vehicles.length < 2) {
    return { ok: false, error: 'Multi-car discount requires at least two vehicles on this work order.' };
  }

  const lines = vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || str(ctx.job.service_slug),
    vehicleClass: str(v.vehicle_class) || 'sedan',
    vehicleDescription: str(v.vehicle_description) || 'Vehicle',
    addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
  }));
  const deals = await loadDealConfigForBooking(gate.admin);
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
      return { ok: false, error: 'Multi-car discount is not configured in deal settings.' };
    }
  } else {
    return { ok: false, error: 'Unknown discount type' };
  }

  const pricedLines = await resolveVehicleLinesPricing(gate.admin, lines);
  if (!pricedLines.ok) return { ok: false, error: pricedLines.error };

  const prevB = obj(ctx.job.booking_pricing_breakdown);
  const addOnSum = num(prevB.addOnSubtotalCents);
  const quoteBreakdown = computeBookingPricing({
    vehicleLineCents: pricedLines.vehicleLineCents,
    addOnCentsSum: addOnSum,
    deals: dealsOverride,
    claimedOffer: null,
  });
  if ('kind' in quoteBreakdown) {
    return { ok: false, error: 'Could not compute pricing for this work order.' };
  }

  if (kind === 'online' && enable && quoteBreakdown.websitePromoDiscountCents <= 0) {
    return {
      ok: false,
      error: 'Online discount did not apply — check website promo is active or stacking rules in deal settings.',
    };
  }
  if (kind === 'multi_car' && enable && quoteBreakdown.multiCarDiscountCents <= 0) {
    return { ok: false, error: 'Multi-car discount did not apply — confirm two+ vehicles and deal settings.' };
  }

  const pricedVehicles = vehicles.map((v, i) => ({
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

  await persistPricing(ctx, gate.admin, b, pricedVehicles as Row[]);
  return { ok: true };
}

/** Super admin: align final total to paid amount and clear balance (Eugene-style fixes). */
export async function markWorkOrderBalancedAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return { ok: false, error: 'Unauthorized' };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx) return { ok: false, error: 'Job not found' };

  const reason = str(formData.get('reason'));
  if (!reason) return { ok: false, error: 'Reason required' };

  const payments = await fetchPaymentsForJob(gate.admin, ctx.job, {
    appointmentId: ctx.isFallback ? undefined : ctx.jobId,
    fallbackBookingId: ctx.isFallback ? ctx.jobId : undefined,
    isFallback: ctx.isFallback,
  });
  const pricing = resolveJobPricing(ctx.job, payments);
  const paidCents = pricing.rawTotalPaidCents;
  if (paidCents <= 0) return { ok: false, error: 'No succeeded payments to balance against' };

  const b = { ...(ctx.job.booking_pricing_breakdown as Record<string, unknown>) };
  b.adminOverrideFinalTotalCents = paidCents;
  b.finalTotalCents = paidCents;
  b.adminOverrideReason = reason;
  b.balanceClearedAt = new Date().toISOString();
  b.balanceClearedBy = gate.userId;
  b.balanceClearedReason = reason;

  await persistPricing(ctx, gate.admin, b);
  await gate.admin
    .from(ctx.table)
    .update({
      balance_due_cents: 0,
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.jobId);

  return { ok: true };
}

export async function overrideWorkOrderFinalTotalAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return { ok: false, error: 'Unauthorized' };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx) return { ok: false, error: 'Job not found' };

  const cents = parseCents(str(formData.get('finalTotalDollars')));
  const reason = str(formData.get('reason'));
  if (cents == null || cents < 0) return { ok: false, error: 'Invalid total' };
  if (!reason) return { ok: false, error: 'Reason required for override' };

  const b = { ...(ctx.job.booking_pricing_breakdown as Record<string, unknown>) };
  b.adminOverrideFinalTotalCents = cents;
  b.adminOverrideReason = reason;
  b.adminOverrideAt = new Date().toISOString();
  b.adminOverrideBy = gate.userId;
  b.finalTotalCents = cents;

  await persistPricing(ctx, gate.admin, b);
  return { ok: true };
}

export async function recalculateWorkOrderPricingAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return { ok: false, error: 'Unauthorized' };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx) return { ok: false, error: 'Job not found' };

  const vehicles = vehiclesFromRow(ctx.job);
  const lines = vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || str(ctx.job.service_slug),
    vehicleClass: str(v.vehicle_class) || 'sedan',
    vehicleDescription: str(v.vehicle_description) || 'Vehicle',
    addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
  }));
  const addOns = lines.flatMap((l) => l.addOnSlugs ?? []);
  const promo = str(ctx.job.promo_code);

  const quote = await computeQuoteFromInputs(gate.admin, {
    lines,
    addOns,
    promoCode: promo || undefined,
    paymentChoice: 'deposit',
  });
  if (!quote.ok) return { ok: false, error: quote.error };

  const pricedVehicles = vehicles.map((v, i) => ({
    ...(v as Row),
    price_cents: quote.resolved[i]?.priceCents ?? v.price_cents,
  }));

  const customItems = readCustomLineItems(ctx.job);
  const b: Record<string, unknown> = {
    ...(ctx.job.booking_pricing_breakdown as Record<string, unknown>),
    ...quote.breakdown,
    customLineItems: customItems,
    repricedAt: new Date().toISOString(),
  };
  delete b.adminOverrideFinalTotalCents;
  delete b.adminOverrideReason;

  await persistPricing(ctx, gate.admin, b, pricedVehicles as Row[]);
  return { ok: true };
}

export async function updateWorkOrderScheduleAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return { ok: false, error: 'Unauthorized' };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx || ctx.isFallback) return { ok: false, error: 'Appointments only' };

  const scheduledRaw = str(formData.get('scheduledStart'));
  const allowConflict = str(formData.get('allowScheduleConflict')) === 'true';
  const overrideReason = str(formData.get('overrideReason'));
  const scheduled = new Date(scheduledRaw);
  if (Number.isNaN(scheduled.getTime())) return { ok: false, error: 'Invalid date/time' };

  const vehicles = vehiclesFromRow(ctx.job);
  const { fetchBookedBlocks, slotConflictsWithBlocks, buildAppointmentScheduleFields } = await import(
    '@/lib/booking-slot-blocking'
  );
  const { totalBookingDurationMinutes } = await import('@/lib/booking-service-duration');

  const durationLines = vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || 'exterior-wash',
    vehicleClass: str(v.vehicle_class) || 'sedan',
    addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
  }));
  const durationMinutes = totalBookingDurationMinutes(durationLines);
  const rangeStart = new Date(scheduled.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(scheduled.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const blocks = await fetchBookedBlocks(gate.admin, rangeStart, rangeEnd);
  const conflict = slotConflictsWithBlocks(scheduled.toISOString(), durationMinutes, blocks, ctx.jobId);

  if (conflict && !allowConflict) {
    return {
      ok: false,
      error: 'Schedule conflict — check "Override conflict" and provide a reason to save anyway.',
      conflict: true,
    };
  }

  const scheduleFields = buildAppointmentScheduleFields(scheduled.toISOString(), durationLines);
  await gate.admin
    .from('appointments')
    .update({
      scheduled_start: scheduled.toISOString(),
      ...scheduleFields,
      schedule_override: conflict && allowConflict ? true : false,
      schedule_override_reason: conflict && allowConflict ? overrideReason || 'Admin override' : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.jobId);

  revalidatePath(`/tech/work-orders/${ctx.jobId}`);
  revalidatePath('/admin/dispatch');
  return { ok: true, conflict: conflict && allowConflict };
}
