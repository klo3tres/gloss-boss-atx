import type { SupabaseClient } from '@supabase/supabase-js';
import { buildAppointmentScheduleFields } from '@/lib/booking-slot-blocking';
import { loadDurationCatalog } from '@/lib/booking-duration-catalog';
import { totalBookingDurationMinutes } from '@/lib/booking-service-duration';
import { upsertAppointmentAvailabilityBlock } from '@/lib/booking-availability-block';
import { insertAppointmentResilient, type VehicleLineInput } from '@/lib/booking-server-shared';
import { runGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { notifyBookingConfirmationQueued, notifyBusinessNewBookingQueued } from '@/lib/notifications-placeholder';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';
import { syncVehiclesToCustomer } from '@/lib/crm-vehicle-sync';
import { normalizeUsPhone10Digits } from '@/lib/us-phone';
import { normalizeVehicleClass } from '@/lib/vehicle-pricing';
import { ensureCustomerReferralCode } from '@/lib/referral/referral-codes';
import {
  computeAdminJobQuote,
  type AdminManualDiscount,
} from '@/lib/admin/admin-job-quote';

export type AdminJobStatus = 'scheduled' | 'completed' | 'canceled' | 'quote_only';
export type AdminPaymentStatus = 'unpaid' | 'deposit_paid' | 'paid' | 'comped';

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

function mapPaymentStatus(paymentStatus: AdminPaymentStatus, totalCents: number, depositCents: number): string {
  if (paymentStatus === 'comped') return 'test_comped';
  if (paymentStatus === 'paid') return 'paid';
  if (paymentStatus === 'deposit_paid') return 'deposit_paid';
  if (depositCents >= totalCents && totalCents > 0) return 'paid';
  return 'awaiting_deposit';
}

async function upsertCustomer(admin: SupabaseClient, input: CreateAdminJobInput): Promise<string | null> {
  const email = str(input.email).toLowerCase();
  const phoneNorm = normalizeUsPhone10Digits(input.phone);
  const phone = phoneNorm.ok ? phoneNorm.digits10 : str(input.phone);

  if (email) {
    const existing = await admin.from('customers').select('id').eq('email', email).maybeSingle();
    if (existing.data?.id) {
      await admin
        .from('customers')
        .update({
          full_name: input.customerName,
          phone,
          service_address: input.address,
          address_line1: input.address,
          city: input.city ?? 'Austin',
          state: input.state ?? 'TX',
          postal_code: input.zip ?? '',
        })
        .eq('id', existing.data.id);
      return String(existing.data.id);
    }
  }

  const insertRow = {
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
  const { data, error } = await admin.from('customers').insert(insertRow).select('id').single();
  if (error || !data?.id) return null;
  return String(data.id);
}

function buildVehicleDescription(input: CreateAdminJobInput): string {
  const ymm = [input.vehicleYear, input.vehicleMake, input.vehicleModel].filter(Boolean).join(' ').trim();
  return str(input.vehicleDescription) || ymm || `${normalizeVehicleClass(input.vehicleClass)} vehicle`;
}

export async function createAdminJob(
  admin: SupabaseClient,
  input: CreateAdminJobInput,
): Promise<
  | {
      ok: true;
      appointmentId: string;
      warnings: string[];
      googleCalendar?: { ok: boolean; skipped?: boolean; error?: string };
    }
  | { ok: false; error: string }
> {
  const warnings: string[] = [];
  const vehicleDescription = buildVehicleDescription(input);
  const vehicleClass = normalizeVehicleClass(input.vehicleClass);

  const lines: VehicleLineInput[] = [
    {
      serviceSlug: input.serviceSlug,
      vehicleClass,
      vehicleDescription,
      vehicleColor: 'Admin entry',
      addOnSlugs: input.addOnSlugs,
    },
  ];

  const customerId = await upsertCustomer(admin, input);
  if (customerId) {
    try {
      await ensureCustomerReferralCode(admin, customerId);
    } catch {
      warnings.push('Referral code not created');
    }
  }

  const quote = await computeAdminJobQuote(admin, {
    lines,
    addOns: input.addOnSlugs,
    promoCode: input.promoCode,
    customerId,
    manualDiscount: input.manualDiscount,
    priceOverrideCents: input.priceOverrideCents,
    paymentChoice: input.paymentStatus === 'paid' || input.paymentStatus === 'comped' ? 'full' : 'deposit',
  });

  if (!quote.ok) return { ok: false, error: quote.error };

  const { breakdown, resolved } = quote;
  const primary = resolved[0]!;
  const scheduledStart = new Date(`${input.serviceDate}T${input.startTime || '09:00'}`).toISOString();

  const durationCatalog = await loadDurationCatalog(admin);
  const durationLines = resolved.map((r) => ({
    serviceSlug: r.serviceSlug,
    vehicleClass: r.vehicleClass,
    addOnSlugs: r.addOnSlugs ?? [],
  }));
  const computedDuration = totalBookingDurationMinutes(durationLines, durationCatalog);
  const durationMinutes = input.durationMinutes && input.durationMinutes > 0 ? input.durationMinutes : computedDuration;

  const scheduleFields = buildAppointmentScheduleFields(scheduledStart, durationLines, durationCatalog);
  if (input.durationMinutes && input.durationMinutes > 0) {
    scheduleFields.estimated_duration_minutes = durationMinutes;
    scheduleFields.estimated_end = new Date(new Date(scheduledStart).getTime() + durationMinutes * 60_000).toISOString();
  }

  const totalCents = breakdown.finalTotalCents;
  const depositCents = input.paymentStatus === 'paid' || input.paymentStatus === 'comped' ? totalCents : breakdown.depositCents;
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
    payment_status: mapPaymentStatus(input.paymentStatus, totalCents, depositCents),
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

  if (input.jobStatus === 'completed') {
    insertPayload.job_completed_at = scheduledStart;
  }

  const { data: appointment, error: apptErr } = await insertAppointmentResilient(admin, insertPayload);
  if (apptErr || !appointment) {
    return { ok: false, error: apptErr ?? 'Could not create appointment' };
  }

  const appointmentId = String(appointment.id);
  let googleCalendar: { ok: boolean; skipped?: boolean; error?: string } | undefined;

  if (amountPaidCents > 0) {
    await admin.from('payments').insert({
      appointment_id: appointmentId,
      customer_id: customerId,
      amount_cents: amountPaidCents,
      status: input.paymentStatus === 'comped' ? 'comped' : 'succeeded',
      payment_method: input.paymentMethod ?? (input.paymentStatus === 'comped' ? 'comped' : 'cash'),
      payment_kind: 'admin_manual',
      paid_at: new Date().toISOString(),
      metadata: { source: 'admin_add_job' },
    });
  }

  if (customerId) {
    void syncVehiclesToCustomer(admin, {
      customerId,
      bookingVehicles,
      vehicleDescription,
      serviceSlug: primary.serviceSlug,
      vehicleClass,
    });
  }

  if (input.jobStatus === 'scheduled') {
    try {
      await upsertAppointmentAvailabilityBlock(admin, appointmentId);
    } catch (e) {
      warnings.push('Calendar block failed');
      await emitOwnerNotification(admin, {
        eventType: 'calendar_sync_failed',
        title: 'Calendar block failed',
        body: `Admin job ${appointmentId} could not block availability.`,
        source: 'calendar',
        relatedType: 'appointment',
        relatedId: appointmentId,
        relatedUrl: `/admin/work-orders/${appointmentId}?shell=admin`,
        bypassQuietHours: true,
      });
    }

    try {
      googleCalendar = await runGoogleCalendarSync(admin, appointmentId, 'upsert');
      if (!googleCalendar.ok && !googleCalendar.skipped) {
        warnings.push('Google Calendar push failed');
      }
    } catch {
      warnings.push('Google Calendar sync failed');
      googleCalendar = { ok: false, error: 'Google Calendar sync failed' };
    }
  }

  await emitOwnerNotification(admin, {
    eventType: 'new_booking',
    title: 'Job created (admin)',
    body: `${input.customerName} — ${primary.serviceSlug.replace(/-/g, ' ')} on ${new Date(scheduledStart).toLocaleString()} · ${quote.labels.total}`,
    source: 'admin_add_job',
    relatedType: 'appointment',
    relatedId: appointmentId,
    relatedUrl: `/admin/work-orders/${appointmentId}?shell=admin`,
  });

  if (customerId) {
    await emitOwnerNotification(admin, {
      eventType: 'new_booking',
      title: 'Customer matched',
      body: `${input.customerName} linked to CRM profile.`,
      source: 'admin_add_job',
      relatedType: 'customer',
      relatedId: customerId,
      relatedUrl: `/admin/customers/${customerId}`,
    });
  }

  if (input.sendCustomerConfirmation && str(input.email)) {
    try {
      await notifyBookingConfirmationQueued({
        toEmail: str(input.email).toLowerCase(),
        toPhone: str(input.phone),
        guestName: input.customerName,
        whenIso: scheduledStart,
        totalCents,
        depositCents,
        vehicles: vehicleDescription,
        appointmentId,
      });
      await emitOwnerNotification(admin, {
        eventType: 'new_booking',
        title: 'Customer confirmation sent',
        body: `Confirmation queued for ${input.customerName}.`,
        source: 'admin_add_job',
        relatedType: 'appointment',
        relatedId: appointmentId,
      });
    } catch {
      warnings.push('Customer confirmation skipped');
      await emitOwnerNotification(admin, {
        eventType: 'new_booking',
        title: 'Customer confirmation skipped',
        body: `Could not queue confirmation for ${input.customerName}.`,
        source: 'admin_add_job',
        relatedType: 'appointment',
        relatedId: appointmentId,
      });
    }
  }

  try {
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
  } catch {
    warnings.push('Owner notification queue skipped');
  }

  return { ok: true, appointmentId, warnings, googleCalendar };
}
