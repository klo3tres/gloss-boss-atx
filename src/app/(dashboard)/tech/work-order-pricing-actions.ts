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
import { actionFailure, actionSuccess, type ActionResponse } from '@/lib/action-response';
import { reloadWorkOrderPricingSnapshot, type WorkOrderPricingSnapshot } from '@/lib/work-order-pricing-snapshot';
import { parseChicagoLocalToIso } from '@/lib/chicago-time';
import { displayChicago } from '@/lib/display-format';

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

const SERVICE_ROLE_MSG = 'SUPABASE_SERVICE_ROLE_KEY missing. Cannot persist work order pricing.';

async function requireAdmin(): Promise<{ admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>; userId: string } | { error: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return { error: 'Unauthorized' };
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return { error: SERVICE_ROLE_MSG };
  }
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

export type PersistPricingResult = {
  before: WorkOrderPricingSnapshot;
  after: WorkOrderPricingSnapshot;
  receiptMessage: string;
};

export type WorkOrderPricingActionResult = {
  ok: boolean;
  error?: string;
  message?: string;
  snapshot?: WorkOrderPricingSnapshot;
  debug?: Record<string, unknown>;
};

function formatSnapshotMsg(s: WorkOrderPricingSnapshot) {
  return `Final $${(s.finalTotalCents / 100).toFixed(2)} · Paid $${(s.totalPaidCents / 100).toFixed(2)} · Balance $${(s.remainingBalanceCents / 100).toFixed(2)} · Online -$${(s.onlineDiscountCents / 100).toFixed(2)} · Multi -$${(s.multiCarDiscountCents / 100).toFixed(2)}`;
}

function fromPersist(res: ActionResponse<PersistPricingResult>): WorkOrderPricingActionResult {
  if (!res.ok) return { ok: false, error: res.error, debug: res.debug };
  return {
    ok: true,
    message: `${formatSnapshotMsg(res.data.after)}. ${res.data.receiptMessage}`,
    snapshot: res.data.after,
    debug: { before: res.data.before, after: res.data.after },
  };
}

async function persistPricing(
  ctx: NonNullable<Awaited<ReturnType<typeof loadJob>>>,
  admin: NonNullable<Awaited<ReturnType<typeof tryCreateAdminSupabase>>>,
  breakdown: Record<string, unknown>,
  vehicles?: Array<Record<string, unknown>>,
): Promise<ActionResponse<PersistPricingResult>> {
  const beforeReload = await reloadWorkOrderPricingSnapshot(admin, ctx.table, ctx.jobId, ctx.isFallback);
  const before = beforeReload?.snapshot;

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

  const { data: updated, error: upErr } = await admin.from(ctx.table).update(patch).eq('id', ctx.jobId).select('*').maybeSingle();
  if (upErr) return actionFailure(upErr.message, { jobId: ctx.jobId, table: ctx.table });
  if (!updated) {
    return actionFailure(`DB update matched 0 rows for work order ${ctx.jobId}.`, { table: ctx.table });
  }

  await syncJobBalanceDue(admin, updated as Row, pricing, {
    appointmentId: ctx.isFallback ? undefined : ctx.jobId,
    fallbackBookingId: ctx.isFallback ? ctx.jobId : undefined,
    isFallback: ctx.isFallback,
  });

  const afterReload = await reloadWorkOrderPricingSnapshot(admin, ctx.table, ctx.jobId, ctx.isFallback);
  if (!afterReload) {
    return actionFailure('Pricing wrote but re-read failed.', { jobId: ctx.jobId });
  }

  const { generateWorkOrderReceiptActionState } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
  const rebuildFd = new FormData();
  if (ctx.isFallback) rebuildFd.set('fallbackBookingId', ctx.jobId);
  else rebuildFd.set('appointmentId', ctx.jobId);
  const receiptResult = await generateWorkOrderReceiptActionState(null, rebuildFd);
  if (!receiptResult.ok) {
    return actionFailure(`Pricing saved but receipt rebuild failed: ${receiptResult.error ?? 'unknown'}`, {
      after: afterReload.snapshot,
    });
  }

  revalidatePath(`/tech/work-orders/${ctx.jobId}`);
  revalidatePath('/admin/work-orders');
  revalidatePath('/dashboard');
  revalidatePath(`/admin/receipts`);

  return actionSuccess(
    {
      before: before ?? afterReload.snapshot,
      after: afterReload.snapshot,
      receiptMessage: receiptResult.message ?? 'Receipt rebuilt',
    },
    { jobId: ctx.jobId, finalTotal: afterReload.snapshot.finalTotalCents },
  );
}

export async function updateWorkOrderVehiclePriceAction(formData: FormData) {
  const gate = await requireAdmin();
  if ('error' in gate) return { ok: false, error: gate.error };
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

  const lines = vehicles.map((v) => ({
    serviceSlug: str(v.service_slug) || str(ctx.job.service_slug),
    vehicleClass: str(v.vehicle_class) || 'sedan',
    vehicleDescription: str(v.vehicle_description) || 'Vehicle',
    addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
  }));
  const pricedLines = await resolveVehicleLinesPricing(gate.admin, lines);
  if (!pricedLines.ok) return { ok: false, error: pricedLines.error };

  const prevB = obj(ctx.job.booking_pricing_breakdown);
  const deals = await loadDealConfigForBooking(gate.admin);
  if (prevB.onlineDiscountDisabled === true) deals.websitePromoActive = false;
  if (prevB.multiCarDisabled === true) deals.multiCarSecondVehicleDiscountPercent = 0;

  const quote = computeBookingPricing({
    vehicleLineCents: vehicles.map((v, i) =>
      typeof v.price_cents === 'number' ? v.price_cents : pricedLines.resolved[i]?.priceCents ?? 0,
    ),
    addOnCentsSum: num(prevB.addOnSubtotalCents),
    deals,
    claimedOffer: null,
  });
  if ('kind' in quote) return { ok: false, error: 'Could not compute pricing' };

  const b: Record<string, unknown> = {
    ...prevB,
    ...quote,
    promoDiscountCents: num(prevB.promoDiscountCents),
    offerDiscountCents: num(prevB.offerDiscountCents),
    adminPriceEditAt: new Date().toISOString(),
    adminPriceEditBy: gate.userId,
  };

  return fromPersist(await persistPricing(ctx, gate.admin, b, vehicles));
}

export async function setWorkOrderPromoAction(formData: FormData) {
  const gate = await requireAdmin();
  if ('error' in gate) return { ok: false, error: gate.error };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx) return { ok: false, error: 'Job not found' };

  const promoCode = str(formData.get('promoCode')).toUpperCase();
  const remove = str(formData.get('remove')) === 'true';

  if (remove) {
    const b = { ...(ctx.job.booking_pricing_breakdown as Record<string, unknown>) };
    b.promoDiscountCents = 0;
    b.offerDiscountCents = 0;
    await gate.admin.from(ctx.table).update({ promo_code: null, updated_at: new Date().toISOString() }).eq('id', ctx.jobId);
    return fromPersist(await persistPricing(ctx, gate.admin, b));
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
  return fromPersist(await persistPricing(ctx, gate.admin, b, vehicles as Row[]));
}

export async function toggleWorkOrderDiscountAction(formData: FormData) {
  const gate = await requireAdmin();
  if ('error' in gate) return { ok: false, error: gate.error };
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

  return fromPersist(await persistPricing(ctx, gate.admin, b, pricedVehicles as Row[]));
}

/** Super admin: align final total to paid amount and clear balance (Eugene-style fixes). */
export async function markWorkOrderBalancedAction(formData: FormData) {
  const gate = await requireAdmin();
  if ('error' in gate) return { ok: false, error: gate.error };
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

  const persistRes = await persistPricing(ctx, gate.admin, b);
  if (!persistRes.ok) return fromPersist(persistRes);

  await gate.admin
    .from(ctx.table)
    .update({
      balance_due_cents: 0,
      payment_status: 'paid',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.jobId);

  return fromPersist(persistRes);
}

export async function overrideWorkOrderFinalTotalAction(formData: FormData) {
  const gate = await requireAdmin();
  if ('error' in gate) return { ok: false, error: gate.error };
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

  return fromPersist(await persistPricing(ctx, gate.admin, b));
}

export async function recalculateWorkOrderPricingAction(formData: FormData) {
  const gate = await requireAdmin();
  if ('error' in gate) return { ok: false, error: gate.error };
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

  return fromPersist(await persistPricing(ctx, gate.admin, b, pricedVehicles as Row[]));
}

export async function updateWorkOrderScheduleAction(formData: FormData) {
  const gate = await requireAdmin();
  if ('error' in gate) return { ok: false, error: gate.error };
  const ctx = await loadJob(gate.admin, formData);
  if (!ctx || ctx.isFallback) return { ok: false, error: 'Appointments only' };

  const scheduledRaw = str(formData.get('scheduledStart'));
  const allowConflict = str(formData.get('allowScheduleConflict')) === 'true';
  const overrideReason = str(formData.get('overrideReason'));
  const notifyCustomer = str(formData.get('notifyCustomer')) === 'true';
  const durationOverrideRaw = str(formData.get('durationMinutes'));
  const scheduledIso = parseChicagoLocalToIso(scheduledRaw);
  if (!scheduledIso) return { ok: false, error: 'Invalid date/time' };
  const scheduled = new Date(scheduledIso);

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
  const computedMinutes = totalBookingDurationMinutes(durationLines);
  const durationMinutes =
    durationOverrideRaw && Number.isFinite(Number(durationOverrideRaw)) && Number(durationOverrideRaw) > 0
      ? Math.round(Number(durationOverrideRaw))
      : computedMinutes;
  const rangeStart = new Date(scheduled.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const rangeEnd = new Date(scheduled.getTime() + 48 * 60 * 60 * 1000).toISOString();
  const blocks = await fetchBookedBlocks(gate.admin, rangeStart, rangeEnd);
  const conflict = slotConflictsWithBlocks(scheduledIso, durationMinutes, blocks, ctx.jobId);

  if (conflict && !allowConflict) {
    return {
      ok: false,
      error: 'Schedule conflict — check "Override conflict" and provide a reason to save anyway.',
      conflict: true,
    };
  }

  const scheduleFields =
    durationMinutes === computedMinutes
      ? buildAppointmentScheduleFields(scheduledIso, durationLines)
      : {
          estimated_duration_minutes: durationMinutes,
          estimated_end: new Date(scheduled.getTime() + durationMinutes * 60_000).toISOString(),
        };

  const oldStart = str((ctx.job as Record<string, unknown>).scheduled_start);
  const guestName = str((ctx.job as Record<string, unknown>).guest_name) || 'Customer';
  const serviceSlug = str((ctx.job as Record<string, unknown>).service_slug).replace(/-/g, ' ');

  const { error: updateError } = await gate.admin
    .from('appointments')
    .update({
      scheduled_start: scheduledIso,
      ...scheduleFields,
      schedule_override: conflict && allowConflict ? true : false,
      schedule_override_reason: conflict && allowConflict ? overrideReason || 'Admin override' : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ctx.jobId);

  if (updateError) return { ok: false, error: updateError.message };

  const { upsertAppointmentAvailabilityBlock } = await import('@/lib/booking-availability-block');
  await upsertAppointmentAvailabilityBlock(gate.admin, ctx.jobId);

  const { runGoogleCalendarSync } = await import('@/lib/google/google-calendar-sync');
  const googleResult = await runGoogleCalendarSync(gate.admin, ctx.jobId, 'upsert');

  if (oldStart && oldStart !== scheduledIso) {
    const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
    const endLabel = displayChicago(scheduleFields.estimated_end);
    void emitOwnerNotification(gate.admin, {
      eventType: 'work_order_created',
      title: `Schedule changed: ${guestName} — ${serviceSlug || 'detail'}`,
      body: `${displayChicago(oldStart)} → ${displayChicago(scheduledIso)}${endLabel ? ` (${endLabel} end)` : ''}`,
      relatedType: 'appointment',
      relatedId: ctx.jobId,
      relatedUrl: `${(process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '')}/admin/work-orders/${ctx.jobId}`,
      emailStatus: 'skipped',
      smsStatus: 'skipped',
    });
  }

  if (notifyCustomer && oldStart && oldStart !== scheduledIso) {
    const row = ctx.job as Record<string, unknown>;
    const email = str(row.guest_email);
    const phone = str(row.guest_phone);
    const guest = str(row.guest_name) || 'Customer';
    const token = str(row.access_token);
    const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
    const confirmUrl = token
      ? `${appBase}/book/confirmation?appointment_id=${encodeURIComponent(ctx.jobId)}&token=${encodeURIComponent(token)}`
      : `${appBase}/book`;
    const customEmailBody = str(formData.get('customNotifyEmailBody'));
    const customSmsBody = str(formData.get('customNotifySmsBody'));
    const { buildWorkOrderTimeChangeEmailBody, buildWorkOrderTimeChangeSmsBody } = await import(
      '@/lib/outbound-message-builders'
    );
    const plainEmail =
      customEmailBody ||
      buildWorkOrderTimeChangeEmailBody({ guestName: guest, oldStart, newStart: scheduledIso, confirmUrl });
    const smsBody =
      customSmsBody || buildWorkOrderTimeChangeSmsBody({ oldStart, newStart: scheduledIso, confirmUrl });
    const { logOutboundMessage } = await import('@/app/(dashboard)/admin/outbound-message-actions');
    if (email.includes('@')) {
      const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
      const { glossBossEmailLayout } = await import('@/lib/email/templates/layout');
      if (resendConfigured()) {
        const html = glossBossEmailLayout({
          title: 'Appointment time updated',
          bodyHtml: `<p style="color:#e4e4e7;font-size:15px;line-height:1.6;white-space:pre-wrap">${plainEmail.replace(/</g, '&lt;')}</p>`,
        });
        const sent = await sendResendHtml({
          to: email,
          subject: 'Gloss Boss ATX — Appointment time updated',
          html,
        });
        await logOutboundMessage(gate.admin, {
          kind: 'work_order_time_change',
          channel: 'email',
          status: sent.ok ? 'sent' : 'failed',
          body: plainEmail,
          subject: 'Gloss Boss ATX — Appointment time updated',
          recipient: email,
          provider_message_id: sent.emailId ?? null,
          error_message: sent.ok ? null : sent.error ?? null,
          appointment_id: ctx.jobId,
          customer_id: row.customer_id ? str(row.customer_id) : null,
          entity_type: 'appointment',
          entity_id: ctx.jobId,
        });
      }
    }
    if (phone) {
      const { twilioConfigured } = await import('@/lib/email-send');
      const { sendCustomerSms } = await import('@/lib/sms-send');
      if (twilioConfigured()) {
        const sent = await sendCustomerSms({
          db: gate.admin,
          kind: 'work_order_time_change',
          to: phone,
          body: smsBody,
          appointment_id: ctx.jobId,
          customer_id: row.customer_id ? str(row.customer_id) : null,
          requireConsent: false,
        });
        await logOutboundMessage(gate.admin, {
          kind: 'work_order_time_change',
          channel: 'sms',
          status: sent.ok ? 'sent' : sent.skipped ? 'skipped' : 'failed',
          body: smsBody,
          recipient: phone,
          provider_message_id: sent.sid ?? null,
          error_message: sent.error ?? null,
          appointment_id: ctx.jobId,
          customer_id: row.customer_id ? str(row.customer_id) : null,
          entity_type: 'appointment',
          entity_id: ctx.jobId,
        });
      }
    }
  }

  revalidatePath(`/tech/work-orders/${ctx.jobId}`);
  revalidatePath('/admin/dispatch');
  revalidatePath('/admin/calendar');
  revalidatePath('/admin/work-orders');
  return {
    ok: true,
    conflict: conflict && allowConflict,
    googleWarning:
      googleResult && !googleResult.ok && !googleResult.skipped ? googleResult.error : undefined,
  };
}

export async function previewWorkOrderScheduleNotifyAction(input: {
  appointmentId: string;
  scheduledStart: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  guestName?: string;
  email?: string;
  phone?: string;
  emailBody?: string;
  smsBody?: string;
}> {
  const gate = await requireAdmin();
  if ('error' in gate) return { error: gate.error };
  const { data: appt } = await gate.admin.from('appointments').select('*').eq('id', input.appointmentId).maybeSingle();
  if (!appt) return { error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  const oldStart = str(row.scheduled_start);
  const newStartIso = parseChicagoLocalToIso(input.scheduledStart);
  if (!newStartIso) return { error: 'Invalid date/time' };
  if (oldStart === newStartIso) return { error: 'Start time unchanged — no notification needed.' };
  const guest = str(row.guest_name) || 'Customer';
  const email = str(row.guest_email);
  const phone = str(row.guest_phone);
  const token = str(row.access_token);
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  const confirmUrl = token
    ? `${appBase}/book/confirmation?appointment_id=${encodeURIComponent(input.appointmentId)}&token=${encodeURIComponent(token)}`
    : `${appBase}/book`;
  const { buildWorkOrderTimeChangeEmailBody, buildWorkOrderTimeChangeSmsBody } = await import('@/lib/outbound-message-builders');
  return {
    ok: true,
    guestName: guest,
    email: email || undefined,
    phone: phone || undefined,
    emailBody: buildWorkOrderTimeChangeEmailBody({ guestName: guest, oldStart, newStart: newStartIso, confirmUrl }),
    smsBody: buildWorkOrderTimeChangeSmsBody({ oldStart, newStart: newStartIso, confirmUrl }),
  };
}
