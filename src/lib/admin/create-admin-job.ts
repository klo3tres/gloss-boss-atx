import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAppointmentScheduleFields } from '@/lib/booking-slot-blocking';
import { loadDurationCatalog } from '@/lib/booking-duration-catalog';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
import { upsertAppointmentAvailabilityBlock } from '@/lib/booking-availability-block';
import { insertAppointmentResilient, type VehicleLineInput } from '@/lib/booking-server-shared';
import { runGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { notifyBusinessNewBookingQueued } from '@/lib/notifications-placeholder';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';
import { syncVehiclesToCustomer } from '@/lib/crm-vehicle-sync';
import { normalizeUsPhone10Digits } from '@/lib/us-phone';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';
import { ensureCustomerReferralCode } from '@/lib/referral/referral-codes';
import { buildCustomerPortalAccessUrl } from '@/lib/customer-portal-access';
import { parseChicagoLocalToIso } from '@/lib/chicago-time';
import { computeAdminJobQuote, type AdminManualDiscount } from '@/lib/admin/admin-job-quote';
import {
  type CreateAdminJobResult,
  failedAdminJobResult,
} from '@/lib/admin/create-admin-job-result';

export type { CreateAdminJobResult } from '@/lib/admin/create-admin-job-result';
export type AdminJobStatus = 'scheduled' | 'completed' | 'canceled' | 'quote_only';
export type AdminPaymentStatus =
  | 'pay_later'
  | 'deposit_paid'
  | 'deposit_required'
  | 'paid'
  | 'comped'
  | 'custom_manual';

export type CreateAdminJobInput = {
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  vehicleClass: string;
  vehicleYear?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleDescription?: string;
  serviceSlug: string;
  addOnSlugs: string[];
  serviceDate: string;
  startTime: string;
  durationMinutes?: number;
  jobStatus: AdminJobStatus;
  paymentStatus: AdminPaymentStatus;
  promoCode?: string;
  manualDiscount?: AdminManualDiscount;
  priceOverrideCents?: number | null;
  notes?: string;
  technicianId?: string | null;
  sendCustomerConfirmation?: boolean;
  amountPaidCents?: number;
  depositAmountCents?: number;
  paymentMethod?: string;
  createdByUserId: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function mapAppointmentStatus(jobStatus: AdminJobStatus): string {
  if (jobStatus === 'completed') return 'completed';
  if (jobStatus === 'canceled') return 'cancelled';
  if (jobStatus === 'quote_only') return 'awaiting_payment';
  return 'confirmed';
}

function mapPaymentStatus(paymentStatus: AdminPaymentStatus, totalCents: number, depositCents: number, amountPaid: number): string {
  if (paymentStatus === 'comped') return 'test_comped';
  if (paymentStatus === 'paid' || (amountPaid >= totalCents && totalCents > 0)) return 'paid';
  if (paymentStatus === 'deposit_paid') return 'deposit_paid';
  if (paymentStatus === 'custom_manual' && amountPaid > 0 && amountPaid < totalCents) return 'deposit_paid';
  if (paymentStatus === 'deposit_required') return 'awaiting_deposit';
  if (paymentStatus === 'pay_later' || paymentStatus === 'custom_manual') return 'awaiting_payment';
  return 'awaiting_payment';
}

function paymentChoiceForMode(mode: AdminPaymentStatus): 'deposit' | 'full' | 'none' {
  if (mode === 'paid' || mode === 'comped') return 'full';
  if (mode === 'pay_later' || mode === 'custom_manual') return 'none';
  return 'deposit';
}

function vehicleClassCandidates(vehicleClass: string): string[] {
  const normalized = normalizeVehicleClass(vehicleClass);
  const base: Record<string, string[]> = {
    sedan: ['sedan'],
    coupe: ['coupe', 'sedan'],
    suv: ['suv', 'suv_truck', 'sedan'],
    truck: ['truck', 'suv_truck', 'suv', 'sedan'],
    van: ['van', 'suv_truck', 'suv', 'sedan'],
    other: ['other', 'suv_truck', 'sedan'],
  };
  return [...new Set(base[normalized] ?? [normalized, 'suv_truck', 'sedan'])];
}

async function insertWithFallback(
  admin: SupabaseClient,
  table: string,
  row: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Promise<{ id: string | null; error: string | null }> {
  const first = await admin.from(table).insert(row).select('id').maybeSingle();
  if (!first.error && first.data?.id) return { id: String(first.data.id), error: null };
  const second = await admin.from(table).insert(fallback).select('id').maybeSingle();
  if (!second.error && second.data?.id) return { id: String(second.data.id), error: null };
  return { id: null, error: second.error?.message ?? first.error?.message ?? `Could not insert into ${table}` };
}

async function upsertCustomer(
  admin: SupabaseClient,
  input: CreateAdminJobInput,
): Promise<{ customerId: string | null; status: 'created' | 'matched' | 'failed' | 'skipped'; error?: string }> {
  const email = str(input.email).toLowerCase();
  const phoneNorm = normalizeUsPhone10Digits(input.phone);
  const phone = phoneNorm.ok ? phoneNorm.digits10 : str(input.phone);

  if (!email && !phone) {
    return { customerId: null, status: 'skipped', error: 'No email or phone' };
  }

  if (email) {
    const existing = await admin.from('customers').select('id').ilike('email', email).maybeSingle();
    if (existing.data?.id) {
      const patch: Record<string, unknown> = {
        full_name: input.customerName,
        phone,
        service_address: input.address,
        updated_at: new Date().toISOString(),
      };
      const fullPatch = { ...patch, address_line1: input.address, city: input.city ?? 'Austin', state: input.state ?? 'TX', postal_code: input.zip ?? '' };
      const up = await admin.from('customers').update(fullPatch).eq('id', existing.data.id);
      if (up.error && /column|schema cache/i.test(up.error.message)) {
        await admin.from('customers').update(patch).eq('id', existing.data.id);
      }
      return { customerId: String(existing.data.id), status: 'matched' };
    }
  }

  const fullRow = {
    email: email || `admin-job-${Date.now()}@local.invalid`,
    full_name: input.customerName,
    phone,
    service_address: input.address,
    address_line1: input.address,
    city: input.city ?? 'Austin',
    state: input.state ?? 'TX',
    postal_code: input.zip ?? '',
    archived: false,
  };
  const leanRow = { email: fullRow.email, full_name: input.customerName, phone, service_address: input.address };
  const ins = await insertWithFallback(admin, 'customers', fullRow, leanRow);
  if (!ins.id) {
    console.error('[createAdminJob] customer insert failed', ins.error);
    return { customerId: null, status: 'failed', error: ins.error ?? 'Customer insert failed' };
  }
  return { customerId: ins.id, status: 'created' };
}

function buildVehicleDescription(input: CreateAdminJobInput): string {
  const ymm = [input.vehicleYear, input.vehicleMake, input.vehicleModel].filter(Boolean).join(' ').trim();
  return str(input.vehicleDescription) || ymm || `${normalizeVehicleClass(input.vehicleClass)} vehicle`;
}

async function insertAdminAppointment(
  admin: SupabaseClient,
  payload: Record<string, unknown>,
  vehicleClass: string,
): Promise<{ data: { id: string; access_token: string } | null; error: string | null; usedClass: string }> {
  const candidates = vehicleClassCandidates(vehicleClass);
  let lastError: string | null = null;
  for (const vc of candidates) {
    const result = await insertAppointmentResilient(admin, { ...payload, vehicle_class: vc });
    if (result.data) return { ...result, usedClass: vc };
    lastError = result.error;
    if (lastError && !/vehicle_class|check constraint|invalid input value/i.test(lastError)) break;
  }
  return { data: null, error: lastError, usedClass: candidates[0] ?? vehicleClass };
}

export async function createAdminJob(admin: SupabaseClient, input: CreateAdminJobInput): Promise<CreateAdminJobResult> {
  const warnings: string[] = [];
  const vehicleDescription = buildVehicleDescription(input);
  const vehicleClass = normalizeVehicleClass(input.vehicleClass);

  const lines: VehicleLineInput[] = [{
    serviceSlug: input.serviceSlug,
    vehicleClass,
    vehicleDescription,
    vehicleColor: 'Admin entry',
    addOnSlugs: input.addOnSlugs,
  }];

  const customerResult = await upsertCustomer(admin, input);
  const customerId = customerResult.customerId;
  if (customerResult.status === 'failed') warnings.push(customerResult.error ?? 'Customer record failed');

  if (customerId) {
    try {
      await ensureCustomerReferralCode(admin, customerId);
    } catch (e) {
      warnings.push('Referral code not created');
      console.warn('[createAdminJob] referral code', e);
    }
  }

  const quote = await computeAdminJobQuote(admin, {
    lines,
    addOns: input.addOnSlugs,
    promoCode: input.promoCode,
    customerId,
    manualDiscount: input.manualDiscount,
    priceOverrideCents: input.priceOverrideCents,
    paymentChoice: paymentChoiceForMode(input.paymentStatus),
  });

  if (!quote.ok) {
    console.error('[createAdminJob] quote failed', quote.error);
    return failedAdminJobResult(quote.error, { warnings, customerId, customerStatus: customerResult.status });
  }

  const { breakdown, resolved } = quote;
  const primary = resolved[0]!;
  const scheduledStart = parseChicagoLocalToIso(input.serviceDate, input.startTime || '09:00');
  if (!scheduledStart) {
    return failedAdminJobResult('Invalid service date or start time.', { warnings, customerId });
  }

  const durationCatalog = await loadDurationCatalog(admin);
  const durationLines = resolved.map((r) => ({ serviceSlug: r.serviceSlug, vehicleClass: r.vehicleClass, addOnSlugs: r.addOnSlugs ?? [] }));
  const computedDuration = totalBookingDurationMinutes(durationLines, durationCatalog);
  const durationMinutes = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : computedDuration;
  const scheduleFields = buildAppointmentScheduleFields(scheduledStart, durationLines, durationCatalog);
  if (input.durationMinutes && input.durationMinutes > 0) {
    scheduleFields.estimated_duration_minutes = durationMinutes;
    scheduleFields.estimated_end = new Date(new Date(scheduledStart).getTime() + durationMinutes * 60_000).toISOString();
  }

  const totalCents = breakdown.finalTotalCents;
  const suggestedDeposit = breakdown.depositCents;
  let depositRequiredCents = 0;
  let depositCents = 0;

  if (input.paymentStatus === 'paid' || input.paymentStatus === 'comped') {
    depositCents = totalCents;
  } else if (input.paymentStatus === 'deposit_paid') {
    depositCents =
      input.depositAmountCents != null && input.depositAmountCents > 0
        ? Math.min(totalCents, input.depositAmountCents)
        : suggestedDeposit;
  } else if (input.paymentStatus === 'deposit_required') {
    depositRequiredCents =
      input.depositAmountCents != null && input.depositAmountCents > 0
        ? Math.min(totalCents, input.depositAmountCents)
        : suggestedDeposit;
    depositCents = depositRequiredCents;
  } else if (input.paymentStatus === 'custom_manual' && input.depositAmountCents != null && input.depositAmountCents > 0) {
    depositRequiredCents = Math.min(totalCents, input.depositAmountCents);
  }

  const amountPaidCents =
    input.paymentStatus === 'paid' || input.paymentStatus === 'comped'
      ? totalCents
      : input.paymentStatus === 'deposit_paid'
        ? depositCents
        : Math.max(0, input.amountPaidCents ?? 0);

  const bookingVehicles = resolved.map((r) => ({
    service_slug: r.serviceSlug,
    vehicle_class: r.vehicleClass,
    vehicle_description: r.vehicleDescription,
    price_cents: r.priceCents,
    add_on_slugs: r.addOnSlugs ?? [],
  }));

  const insertPayload: Record<string, unknown> = {
    customer_id: customerId,
    status: mapAppointmentStatus(input.jobStatus),
    payment_status: mapPaymentStatus(input.paymentStatus, totalCents, depositCents, amountPaidCents),
    scheduled_start: scheduledStart,
    ...scheduleFields,
    guest_name: input.customerName,
    guest_email: str(input.email).toLowerCase() || null,
    guest_phone: str(input.phone),
    service_slug: primary.serviceSlug,
    vehicle_class: vehicleClass,
    vehicle_description: vehicleDescription,
    booking_vehicles: bookingVehicles,
    booking_add_ons: input.addOnSlugs,
    booking_pricing_breakdown: {
      ...breakdown,
      adminManualDiscountReason: input.manualDiscount?.reason ?? null,
      source: 'admin_manual',
      depositRequiredCents,
      depositPaidCents: amountPaidCents > 0 && input.paymentStatus === 'deposit_paid' ? amountPaidCents : 0,
    },
    service_address: input.address,
    service_city: input.city ?? 'Austin',
    service_state: input.state ?? 'TX',
    service_zip: input.zip ?? '',
    base_price_cents: totalCents,
    deposit_amount_cents: depositCents,
    balance_due_cents: Math.max(0, totalCents - amountPaidCents),
    assigned_technician_id: input.technicianId || null,
    notes: input.notes || 'Job created from admin Add Job flow.',
    booking_source: input.jobStatus === 'completed' ? 'admin_past_job' : 'admin_manual',
    created_by: input.createdByUserId,
    updated_at: new Date().toISOString(),
  };
  if (input.jobStatus === 'completed') insertPayload.job_completed_at = scheduledStart;

  const apptInsert = await insertAdminAppointment(admin, insertPayload, vehicleClass);
  if (!apptInsert.data) {
    const msg = apptInsert.error ?? 'Could not create appointment';
    console.error('[createAdminJob] appointment insert failed', msg);
    return failedAdminJobResult(msg, { warnings, customerId, customerStatus: customerResult.status, errors: [msg] });
  }

  const appointmentId = String(apptInsert.data.id);
  let portalUrl: string | undefined;
  if (apptInsert.data.access_token) portalUrl = buildCustomerPortalAccessUrl(appointmentId, apptInsert.data.access_token);

  let paymentStatus: CreateAdminJobResult['paymentStatus'] = 'skipped';
  if (amountPaidCents > 0) {
    const pay = await insertWithFallback(admin, 'payments', {
      appointment_id: appointmentId,
      customer_id: customerId,
      amount_cents: amountPaidCents,
      status: 'succeeded',
      payment_method: input.paymentMethod ?? (input.paymentStatus === 'comped' ? 'comped' : 'cash'),
      payment_kind: 'admin_manual',
      paid_at: new Date().toISOString(),
      metadata: { source: 'admin_add_job', comped: input.paymentStatus === 'comped' },
    }, { appointment_id: appointmentId, amount_cents: amountPaidCents, status: 'succeeded' });
    paymentStatus = pay.error ? 'failed' : 'ok';
    if (pay.error) warnings.push(`Payment record failed: ${pay.error}`);
  }

  let vehicleStatus: CreateAdminJobResult['vehicleStatus'] = 'skipped';
  if (customerId) {
    try {
      await syncVehiclesToCustomer(admin, { customerId, bookingVehicles, vehicleDescription, serviceSlug: primary.serviceSlug, vehicleClass: apptInsert.usedClass });
      vehicleStatus = 'synced';
    } catch {
      warnings.push('Vehicle sync failed');
      vehicleStatus = 'failed';
    }
  }

  let calendarBlockStatus: CreateAdminJobResult['calendarBlockStatus'] = 'skipped';
  let googleCalendarStatus: CreateAdminJobResult['googleCalendarStatus'] = 'skipped';

  if (input.jobStatus === 'scheduled') {
    try {
      await upsertAppointmentAvailabilityBlock(admin, appointmentId);
      calendarBlockStatus = 'ok';
    } catch (e) {
      calendarBlockStatus = 'failed';
      warnings.push('Calendar block failed');
      console.error('[createAdminJob] calendar block', e);
    }
    try {
      const gcal = await runGoogleCalendarSync(admin, appointmentId, 'upsert');
      googleCalendarStatus = gcal.skipped ? 'skipped' : gcal.ok ? 'ok' : 'failed';
      if (googleCalendarStatus === 'failed') warnings.push(gcal.error ?? 'Google Calendar failed');
    } catch {
      googleCalendarStatus = 'failed';
      warnings.push('Google Calendar sync failed');
    }
  }

  let ownerNotificationStatus: CreateAdminJobResult['ownerNotificationStatus'] = 'skipped';
  try {
    await emitOwnerNotification(admin, {
      eventType: 'new_booking',
      title: 'Job created (admin)',
      body: `${input.customerName} — ${primary.serviceSlug.replace(/-/g, ' ')} on ${new Date(scheduledStart).toLocaleString()} · ${quote.labels.total}`,
      source: 'admin_add_job',
      relatedType: 'appointment',
      relatedId: appointmentId,
      relatedUrl: `/admin/work-orders/${appointmentId}?shell=admin`,
    });
    await notifyBusinessNewBookingQueued({
      appointmentId,
      guestName: input.customerName,
      guestEmail: str(input.email),
      guestPhone: str(input.phone),
      whenIso: scheduledStart,
      totalCents,
      depositCents,
      vehicles: vehicleDescription,
      eventKind: input.jobStatus === 'completed' ? 'job_completed' : 'new_booking',
      comped: input.paymentStatus === 'comped',
    });
    ownerNotificationStatus = 'sent';
  } catch {
    ownerNotificationStatus = 'failed';
    warnings.push('Owner notification failed');
  }

  let customerConfirmation: CreateAdminJobResult['customerConfirmation'];
  if (input.sendCustomerConfirmation && (str(input.email) || str(input.phone))) {
    customerConfirmation = { email: 'skipped', sms: 'skipped', portalUrl };
    try {
      const { sendBookingConfirmation } = await import('@/lib/booking-confirmation-send');
      const confirmResult = await sendBookingConfirmation(admin, { appointmentId, skipOwnerNotify: true });
      customerConfirmation = {
        email: confirmResult.email?.status ?? 'skipped',
        sms: confirmResult.sms?.status ?? 'skipped',
        portalUrl,
        error: confirmResult.email?.error ?? confirmResult.sms?.error,
      };
      if (confirmResult.email?.status === 'failed' || confirmResult.sms?.status === 'failed') {
        warnings.push('Customer confirmation delivery errors');
      }
    } catch (e) {
      customerConfirmation = { email: 'failed', sms: 'failed', portalUrl, error: e instanceof Error ? e.message : 'Send failed' };
      warnings.push('Customer confirmation failed');
    }
  }

  return {
    success: true,
    workOrderId: appointmentId,
    appointmentId,
    customerId,
    errors: [],
    warnings,
    customerStatus: customerResult.status,
    vehicleStatus,
    calendarBlockStatus,
    googleCalendarStatus,
    ownerNotificationStatus,
    customerConfirmation,
    portalUrl,
    paymentStatus,
  };
}
