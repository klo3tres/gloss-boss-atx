import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { notifyBusinessNewBookingFull } from '@/lib/business-booking-notify';
import { runGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { buildCustomerPortalAccessUrl } from '@/lib/customer-portal-access';
import {
  stageFromLegacyStatus,
  transitionWorkOrder,
  type WorkOrderStage,
} from '@/lib/work-order-lifecycle';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function appBase() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://glossbossatx.com').replace(/\/$/, '');
}

function whenChicago(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(d);
}

async function logOutbox(
  admin: SupabaseClient,
  row: {
    appointment_id: string;
    kind: string;
    channel: string;
    status: string;
    template_key: string;
    error_message?: string | null;
    payload?: Record<string, unknown>;
  },
) {
  try {
    const result = await admin.from('notification_outbox').insert({
      ...row,
      provider: row.channel === 'email' ? 'resend' : 'internal',
      created_at: new Date().toISOString(),
    });
    return result.error?.message ?? null;
  } catch (e) {
    console.warn('[lifecycle] outbox', e);
    return e instanceof Error ? e.message : 'Outbox write failed';
  }
}

async function emailCustomer(
  admin: SupabaseClient,
  to: string,
  subject: string,
  html: string,
  appointmentId: string,
  templateKey: string,
) {
  if (!to.includes('@')) return { status: 'skipped', error: 'No deliverable customer email.' };
  let status = 'skipped';
  let err: string | null = null;
  if (resendConfigured()) {
    const sent = await sendResendHtml({ to, subject, html });
    status = sent.ok ? 'sent' : 'failed';
    err = sent.ok ? null : sent.error ?? 'send failed';
  }
  const outboxError = await logOutbox(admin, {
    appointment_id: appointmentId,
    kind: templateKey,
    channel: 'email',
    status,
    template_key: templateKey,
    error_message: err,
    payload: { to },
  });
  return {
    status,
    error: err ?? (outboxError ? `Delivery record failed: ${outboxError}` : null),
  };
}

const CONFIRMED_OR_LATER_STAGES = new Set<WorkOrderStage>([
  'scheduled',
  'en_route',
  'in_progress',
  'quality_check',
  'payment_due',
  'completed',
]);

async function ensureConfirmationTransitionEvent(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    fromStage: WorkOrderStage;
    actorId?: string | null;
    reason?: string;
    adminOverride?: boolean;
  },
) {
  const existing = await admin
    .from('work_order_transition_events')
    .select('id')
    .eq('appointment_id', input.appointmentId)
    .eq('to_stage', 'scheduled')
    .limit(1)
    .maybeSingle();
  if (existing.error && /relation|does not exist|schema cache/i.test(existing.error.message)) return null;
  if (existing.error) return existing.error.message;
  if (existing.data) return null;
  const inserted = await admin.from('work_order_transition_events').insert({
    appointment_id: input.appointmentId,
    from_stage: input.fromStage,
    to_stage: 'scheduled',
    actor_id: input.actorId ?? null,
    reason: str(input.reason) || 'Appointment confirmed',
    admin_override: input.adminOverride === true,
  });
  if (inserted.error && !/relation|does not exist|schema cache/i.test(inserted.error.message)) {
    return inserted.error.message;
  }
  return null;
}

/**
 * Canonical appointment confirmation transition.
 * Payment state stays separate; confirmation changes only the appointment/work-order lifecycle.
 */
export async function confirmAppointmentLifecycle(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    actorId?: string | null;
    reason?: string;
    allowAdminOverride?: boolean;
    overrideEligibility?: boolean;
  },
): Promise<{
  ok: boolean;
  error?: string;
  code?: 'ACKNOWLEDGEMENT_REQUIRED' | 'PAYMENT_REQUIRED';
  alreadyConfirmed?: boolean;
  previousStage?: WorkOrderStage;
}> {
  const appointmentId = str(input.appointmentId);
  if (!appointmentId) return { ok: false, error: 'Missing appointment.' };

  const { data, error } = await admin
    .from('appointments')
    .select('id, status, lifecycle_stage, payment_choice, archived_at, deleted_at, is_test')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Appointment not found.' };

  const row = data as Record<string, unknown>;
  const rawStatus = str(row.status).toLowerCase();
  const previousStage = stageFromLegacyStatus(row.lifecycle_stage || rawStatus);
  if (
    previousStage === 'cancelled' ||
    row.archived_at ||
    row.deleted_at ||
    ['cancelled', 'canceled', 'voided', 'deleted', 'archived'].includes(rawStatus)
  ) {
    return { ok: false, error: 'An inactive appointment cannot be confirmed.', previousStage };
  }

  if (CONFIRMED_OR_LATER_STAGES.has(previousStage) && rawStatus !== 'deposit_paid') {
    if (previousStage === 'scheduled' && rawStatus === 'scheduled') {
      const normalized = await admin
        .from('appointments')
        .update({
          status: 'confirmed',
          lifecycle_stage: 'scheduled',
          lifecycle_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', appointmentId)
        .in('status', ['deposit_paid', 'scheduled']);
      if (normalized.error) return { ok: false, error: normalized.error.message, previousStage };
    }
    const eventError = await ensureConfirmationTransitionEvent(admin, {
      appointmentId,
      fromStage: previousStage,
      actorId: input.actorId,
      reason: input.reason,
      adminOverride: input.allowAdminOverride,
    });
    if (eventError) {
      return {
        ok: false,
        error: `Appointment is confirmed, but its audit event could not be recorded: ${eventError}`,
        previousStage,
      };
    }
    return { ok: true, alreadyConfirmed: true, previousStage };
  }

  if (!input.overrideEligibility) {
    const [{ data: agreement }, { data: intake }, snapshot] = await Promise.all([
      admin.from('signed_agreements').select('id').eq('appointment_id', appointmentId).limit(1).maybeSingle(),
      admin.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).limit(1).maybeSingle(),
      import('@/lib/order-snapshot-engine').then(({ loadOrderSnapshot }) =>
        loadOrderSnapshot(admin, { appointmentId }),
      ),
    ]);
    const intakeForm =
      intake?.form_data && typeof intake.form_data === 'object'
        ? (intake.form_data as Record<string, unknown>)
        : null;
    if (!agreement && !intakeForm?.deposit_legal_ack) {
      return {
        ok: false,
        error: 'The service acknowledgement must be completed before confirmation.',
        code: 'ACKNOWLEDGEMENT_REQUIRED',
        previousStage,
      };
    }
    if (!snapshot) {
      return { ok: false, error: 'The canonical work order could not be loaded.', previousStage };
    }
    const paymentChoice = str(row.payment_choice).toLowerCase();
    const explicitlyNoDeposit =
      snapshot.pricing.finalTotalCents <= 0 ||
      ['comped', 'no_payment_required'].includes(snapshot.paymentStatus) ||
      ['pay_later', 'pay_on_arrival', 'no_deposit', 'none'].includes(paymentChoice);
    const paymentEligible =
      explicitlyNoDeposit ||
      (snapshot.pricing.depositCents > 0 &&
        snapshot.pricing.depositPaidCents >= snapshot.pricing.depositCents) ||
      snapshot.pricing.totalPaidCents >= snapshot.pricing.finalTotalCents ||
      ['paid', 'deposit_paid'].includes(snapshot.paymentStatus);
    if (!paymentEligible) {
      return {
        ok: false,
        error: 'The required deposit or approved pay-on-arrival choice is missing.',
        code: 'PAYMENT_REQUIRED',
        previousStage,
      };
    }
  }

  if (previousStage === 'scheduled' && rawStatus === 'deposit_paid') {
    const normalized = await admin
      .from('appointments')
      .update({
        status: 'confirmed',
        lifecycle_stage: 'scheduled',
        lifecycle_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId)
      .eq('status', 'deposit_paid');
    if (normalized.error) return { ok: false, error: normalized.error.message, previousStage };
    const eventError = await ensureConfirmationTransitionEvent(admin, {
      appointmentId,
      fromStage: previousStage,
      actorId: input.actorId,
      reason: input.reason,
      adminOverride: input.allowAdminOverride,
    });
    if (eventError) {
      return {
        ok: false,
        error: `Appointment is confirmed, but its audit event could not be recorded: ${eventError}`,
        previousStage,
      };
    }
    return { ok: true, alreadyConfirmed: false, previousStage };
  }

  const transition = await transitionWorkOrder(admin, {
    appointmentId,
    to: 'scheduled',
    legacyStatus: 'confirmed',
    actorId: input.actorId ?? null,
    reason: str(input.reason) || 'Appointment confirmed',
    allowAdminOverride: input.allowAdminOverride === true,
  });
  if (!transition.ok) {
    return {
      ok: false,
      error: transition.error ?? 'Appointment confirmation failed.',
      previousStage,
    };
  }
  const eventError = await ensureConfirmationTransitionEvent(admin, {
    appointmentId,
    fromStage: transition.from ?? previousStage,
    actorId: input.actorId,
    reason: input.reason,
    adminOverride: input.allowAdminOverride,
  });
  if (eventError) {
    return {
      ok: false,
      error: `Appointment is confirmed, but its audit event could not be recorded: ${eventError}`,
      previousStage,
    };
  }
  return { ok: true, alreadyConfirmed: false, previousStage };
}

export async function cancelAppointmentLifecycle(
  admin: SupabaseClient,
  input: { appointmentId: string; reason?: string; notifyCustomer?: boolean; actorId?: string | null; refundDecision?: string },
): Promise<{
  ok: boolean;
  error?: string;
  alreadyCancelled?: boolean;
  warnings?: string[];
  googleCalendar?: { ok: boolean; skipped?: boolean; error?: string };
}> {
  const id = str(input.appointmentId);
  if (!id) return { ok: false, error: 'Missing appointment' };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (!appt) return { ok: false, error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  const warnings: string[] = [];
  const alreadyCancelled =
    stageFromLegacyStatus(row.lifecycle_stage || row.status) === 'cancelled' ||
    ['cancelled', 'canceled'].includes(str(row.status).toLowerCase());
  if (alreadyCancelled) {
    try {
      const { removeAppointmentAvailabilityBlock } = await import('@/lib/booking-availability-block');
      await removeAppointmentAvailabilityBlock(admin, id);
    } catch (error) {
      warnings.push(
        `Availability release needs attention: ${error instanceof Error ? error.message : 'release failed'}`,
      );
    }
    return { ok: true, alreadyCancelled: true, warnings };
  }
  // Production historically allowed "cancelled" while the original RPC wrote
  // "canceled". Close pending reminders first so legacy functions cannot roll
  // back an otherwise valid cancellation on that spelling mismatch.
  const reminderCancellation = await admin
    .from('scheduled_messages')
    .update({
      status: 'cancelled',
      skipped_reason: 'appointment_cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('appointment_id', id)
    .in('status', ['queued', 'scheduled', 'pending']);
  if (reminderCancellation.error) {
    return {
      ok: false,
      error: `Cancellation could not safely stop pending reminders: ${reminderCancellation.error.message}`,
    };
  }
  const { error } = await admin.rpc('cancel_appointment_atomic', {
    p_appointment_id: id,
    p_reason: str(input.reason) || 'Cancelled',
    p_actor_id: input.actorId ?? null,
    p_refund_decision: str(input.refundDecision) || '',
    p_notify_customer: input.notifyCustomer !== false,
  });
  if (error) return { ok: false, error: `Cancellation transaction failed: ${error.message}` };
  const { error: normalizationError } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      lifecycle_stage: 'cancelled',
      balance_due_cents: 0,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (normalizationError) {
    return { ok: false, error: `Appointment cancelled, but final status normalization failed: ${normalizationError.message}` };
  }

  try {
    const { cancelAgreementRemindersForAppointment } = await import('@/lib/agreements/reminders');
    await cancelAgreementRemindersForAppointment(admin, id);
  } catch (e) {
    console.warn('[lifecycle] cancel agreement reminders', e);
    warnings.push(
      `Agreement reminders need attention: ${e instanceof Error ? e.message : 'cancellation failed'}`,
    );
  }

  const guest = str(row.guest_name) || 'Customer';
  const email = str(row.guest_email);
  const phone = str(row.guest_phone);
  const when = whenChicago(str(row.scheduled_start));
  const reason = str(input.reason) || 'schedule change';
  const suppressNotifications =
    row.is_test === true ||
    row.exclude_from_automations === true ||
    row.exclude_from_customer_communications === true;

  if (!suppressNotifications && input.notifyCustomer !== false && email) {
    const html = `<p>Hi ${guest},</p><p>Your Gloss Boss ATX appointment on <strong>${when}</strong> has been cancelled.</p><p>Reason: ${reason}</p><p>Rebook anytime at <a href="${appBase()}/book">${appBase()}/book</a>.</p>`;
    try {
      const emailResult = await emailCustomer(
        admin,
        email,
        'Gloss Boss ATX — Appointment cancelled',
        html,
        id,
        'booking_cancelled',
      );
      if (emailResult.status === 'failed' || emailResult.error) {
        warnings.push(`Customer email needs attention: ${emailResult.error ?? 'send failed'}`);
      }
    } catch (error) {
      warnings.push(`Customer email needs attention: ${error instanceof Error ? error.message : 'send failed'}`);
    }
  }

  if (!suppressNotifications && input.notifyCustomer !== false && phone) {
    const { sendCustomerSms } = await import('@/lib/sms-send');
    const smsResult = await sendCustomerSms({
      db: admin,
      kind: 'booking_cancelled',
      template_key: 'reschedule_cancel',
      to: phone,
      body: `Gloss Boss ATX: Your appointment for ${when} has been cancelled. Rebook anytime: ${appBase()}/book`,
      appointment_id: id,
      customer_id: row.customer_id ? str(row.customer_id) : null,
      requireConsent: false,
    });
    if (!smsResult.ok && !smsResult.skipped) {
      warnings.push(`Customer SMS needs attention: ${smsResult.error ?? 'send failed'}`);
    }
  }
  if (!suppressNotifications && input.notifyCustomer !== false && !email && !phone) {
    warnings.push('Customer notification skipped: no email or phone on file.');
  }

  if (!suppressNotifications) try {
    const addr = [row.service_address, row.service_city, row.service_state, row.service_zip].filter(Boolean).join(', ');
    const total = typeof row.base_price_cents === 'number' ? row.base_price_cents : 0;
    await notifyBusinessNewBookingFull({
      eventKind: 'cancelled',
      appointmentId: id,
      guestName: guest,
      guestEmail: email,
      guestPhone: str(row.guest_phone),
      whenIso: str(row.scheduled_start),
      totalCents: total,
      depositCents: typeof row.deposit_amount_cents === 'number' ? row.deposit_amount_cents : 0,
      vehicles: str(row.vehicle_description) || '—',
      serviceAddress: addr || null,
      extraNote: `Cancelled: ${reason}`,
    });
    const techId = str(row.assigned_technician_id);
    if (techId) {
      const { notifyTechnicianJobCancelled } = await import('@/lib/staff-notification-router');
      await notifyTechnicianJobCancelled(admin, { technicianId: techId, appointmentId: id, extraNote: reason });
    }
  } catch (e) {
    console.warn('[lifecycle] owner cancel notify', e);
    warnings.push(
      `Internal cancellation notification needs attention: ${e instanceof Error ? e.message : 'send failed'}`,
    );
  }

  let googleCalendar: { ok: boolean; skipped?: boolean; error?: string };
  if (suppressNotifications) {
    googleCalendar = { ok: false, skipped: true, error: 'This appointment is excluded from Google Calendar.' };
  } else {
    try {
      googleCalendar = await runGoogleCalendarSync(admin, id, 'delete');
    } catch (error) {
      googleCalendar = {
        ok: false,
        error: error instanceof Error ? error.message : 'Calendar removal failed',
      };
    }
  }
  if (!googleCalendar.ok && !googleCalendar.skipped) {
    warnings.push(`Google Calendar will retry: ${googleCalendar.error ?? 'delete failed'}`);
  }
  try {
    const { removeAppointmentAvailabilityBlock } = await import('@/lib/booking-availability-block');
    await removeAppointmentAvailabilityBlock(admin, id);
  } catch (error) {
    console.warn('[lifecycle] availability block verification', error);
    warnings.push(
      `Availability release needs attention: ${error instanceof Error ? error.message : 'release failed'}`,
    );
  }

  return { ok: true, googleCalendar, warnings };
}

export async function cancelFallbackBookingLifecycle(
  admin: SupabaseClient,
  input: { fallbackBookingId: string; reason?: string },
): Promise<{ ok: boolean; error?: string; alreadyCancelled?: boolean }> {
  const id = str(input.fallbackBookingId);
  if (!id) return { ok: false, error: 'Missing fallback work order.' };
  const { data, error } = await admin
    .from('booking_fallbacks')
    .select('id, status, payment_status, notes')
    .eq('id', id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: 'Fallback work order not found.' };
  if (['cancelled', 'canceled'].includes(str(data.status).toLowerCase())) {
    return { ok: true, alreadyCancelled: true };
  }
  const reason = str(input.reason) || 'Cancelled';
  const now = new Date().toISOString();
  const updated = await admin
    .from('booking_fallbacks')
    .update({
      status: 'cancelled',
      balance_due_cents: 0,
      notes: [str(data.notes), `Cancelled: ${reason}`].filter(Boolean).join('\n'),
      updated_at: now,
    })
    .eq('id', id)
    .not('status', 'in', '("cancelled","canceled")')
    .select('id')
    .maybeSingle();
  if (updated.error) return { ok: false, error: updated.error.message };
  if (!updated.data?.id) return { ok: true, alreadyCancelled: true };
  return { ok: true };
}

export async function rescheduleAppointmentLifecycle(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    newScheduledStart: string;
    reason?: string;
    notifyCustomer?: boolean;
    customEmailBody?: string;
    customEmailSubject?: string;
    customSmsBody?: string;
  },
): Promise<{
  ok: boolean;
  error?: string;
  alreadyRescheduled?: boolean;
  warnings?: string[];
  googleCalendar?: { ok: boolean; skipped?: boolean; error?: string };
}> {
  const id = str(input.appointmentId);
  const newStart = str(input.newScheduledStart);
  if (!id || !newStart) return { ok: false, error: 'Missing appointment or new time' };
  if (Number.isNaN(new Date(newStart).getTime())) return { ok: false, error: 'Invalid date/time' };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (!appt) return { ok: false, error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  const oldStart = str(row.scheduled_start);
  const currentStage = stageFromLegacyStatus(row.lifecycle_stage || row.status);
  if (
    currentStage === 'cancelled' ||
    ['in_progress', 'quality_check', 'payment_due', 'completed'].includes(currentStage) ||
    row.job_started_at ||
    row.job_completed_at ||
    row.archived_at ||
    row.deleted_at
  ) {
    return { ok: false, error: 'This appointment can no longer be rescheduled online.' };
  }
  if (new Date(newStart).getTime() <= Date.now()) {
    return { ok: false, error: 'Choose a future appointment time.' };
  }
  if (oldStart && new Date(oldStart).getTime() === new Date(newStart).getTime()) {
    return { ok: true, alreadyRescheduled: true };
  }
  const now = new Date().toISOString();

  const vehicles = Array.isArray(row.booking_vehicles) ? row.booking_vehicles : [];
  const durationLines =
    vehicles.length > 0
      ? (vehicles as Record<string, unknown>[]).map((v) => ({
          serviceSlug: str(v.service_slug) || str(row.service_slug) || 'exterior-wash',
          vehicleClass: str(v.vehicle_class) || str(row.vehicle_class) || 'sedan',
          addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
        }))
      : [{ serviceSlug: str(row.service_slug) || 'exterior-wash', vehicleClass: str(row.vehicle_class) || 'sedan' }];
  const [
    { buildAppointmentScheduleFields },
    { isBookingInstantAllowedInChicago, bookingInstantFitsInChicagoWindow },
    { loadDurationCatalog },
    { reserveBookingSlot, releaseBookingSlot, convertBookingSlotHold },
    { loadBookingAvailabilityRules },
  ] = await Promise.all([
    import('@/lib/booking-slot-blocking'),
    import('@/lib/booking-availability'),
    import('@/lib/booking-duration-catalog'),
    import('@/lib/booking-slot-holds'),
    import('@/lib/booking-server-shared'),
  ]);
  const availabilityRules = await loadBookingAvailabilityRules(admin);
  if (!isBookingInstantAllowedInChicago(new Date(newStart), availabilityRules)) {
    return {
      ok: false,
      error: 'That time is outside current online booking hours. Choose another available time.',
    };
  }
  const durationCatalog = await loadDurationCatalog(admin);
  const scheduleFields = buildAppointmentScheduleFields(newStart, durationLines, durationCatalog);
  if (
    !bookingInstantFitsInChicagoWindow(
      new Date(newStart),
      scheduleFields.estimated_duration_minutes,
      availabilityRules,
    )
  ) {
    return {
      ok: false,
      error: 'That start time does not leave enough business hours for this service. Choose an earlier time.',
    };
  }
  const rescheduleSessionId = `reschedule_${id.replace(/-/g, '')}`;
  const hold = await reserveBookingSlot(admin, {
    bookingSessionId: rescheduleSessionId,
    scheduledStartIso: newStart,
    durationMinutes: scheduleFields.estimated_duration_minutes,
    excludeAppointmentId: id,
    isTest: row.is_test === true,
  });
  if (!hold.ok) {
    return {
      ok: false,
      error: hold.error ?? 'That appointment time is no longer available. Choose another time.',
    };
  }

  const update = await admin
    .from('appointments')
    .update({
      scheduled_start: newStart,
      ...scheduleFields,
      rescheduled_from: oldStart || null,
      status: str(row.status) === 'cancelled' ? 'scheduled' : row.status,
      cancelled_at: null,
      updated_at: now,
    })
    .eq('id', id)
    .eq('scheduled_start', oldStart)
    .select('id')
    .maybeSingle();
  if (update.error || !update.data?.id) {
    await releaseBookingSlot(admin, rescheduleSessionId);
    return {
      ok: false,
      error: update.error?.message ?? 'The appointment changed while you were rescheduling. Refresh and try again.',
    };
  }
  await convertBookingSlotHold(admin, {
    bookingSessionId: rescheduleSessionId,
    holdId: hold.holdId,
    appointmentId: id,
  });
  const warnings: string[] = [];

  if (
    row.is_test !== true &&
    row.exclude_from_automations !== true &&
    row.exclude_from_customer_communications !== true
  ) try {
    const { rescheduleAgreementReminders } = await import('@/lib/agreements/reminders');
    await rescheduleAgreementReminders(admin, {
      appointmentId: id,
      scheduledStart: newStart,
      customerId: row.customer_id ? str(row.customer_id) : null,
      accessToken: str(row.access_token) || null,
    });
  } catch (e) {
    console.warn('[lifecycle] reschedule agreement reminders', e);
  }

  const guest = str(row.guest_name) || 'Customer';
  const email = str(row.guest_email);
  const phone = str(row.guest_phone);
  const token = str(row.access_token);
  const suppressNotifications =
    row.is_test === true ||
    row.exclude_from_automations === true ||
    row.exclude_from_customer_communications === true;
  const calUrl = `${appBase()}/api/calendar/appointment/${id}`;
  const confirmUrl =
    token ? buildCustomerPortalAccessUrl(id, token) : `${appBase()}/book`;

  if (!suppressNotifications && input.notifyCustomer !== false && (email || phone)) {
    const { buildRescheduleEmailBody, buildRescheduleSmsBody } = await import('@/lib/outbound-message-builders');
    const plainBody =
      input.customEmailBody ??
      buildRescheduleEmailBody({ guestName: guest, oldStart, newStart, confirmUrl, calUrl });
    const smsBody =
      input.customSmsBody ?? buildRescheduleSmsBody({ oldStart, newStart, confirmUrl });
    const subject = input.customEmailSubject ?? 'Gloss Boss ATX — Appointment rescheduled';
    if (email) {
      const html = input.customEmailBody
        ? `<p style="color:#e4e4e7;font-size:15px;line-height:1.6;white-space:pre-wrap">${plainBody.replace(/</g, '&lt;')}</p>`
        : `<p>Hi ${guest},</p><p>Your appointment has been rescheduled.</p><p><strong>Was:</strong> ${whenChicago(oldStart)}<br/><strong>Now:</strong> ${whenChicago(newStart)}</p><p><a href="${confirmUrl}">View confirmation</a> · <a href="${calUrl}">Add to calendar (.ics)</a></p>`;
      const emailResult = await emailCustomer(admin, email, subject, html, id, 'booking_rescheduled');
      if (!['queued', 'sent', 'delivered'].includes(emailResult.status)) {
        warnings.push(`Customer email needs attention: ${emailResult.error ?? emailResult.status}`);
      }
    }
    if (phone) {
      const { twilioConfigured } = await import('@/lib/email-send');
      const { sendCustomerSms } = await import('@/lib/sms-send');
      if (twilioConfigured()) {
        const smsResult = await sendCustomerSms({
          db: admin,
          kind: 'booking_rescheduled',
          template_key: 'reschedule_cancel',
          to: phone,
          body: smsBody,
          appointment_id: id,
          customer_id: row.customer_id ? str(row.customer_id) : null,
          requireConsent: false,
        });
        if (!smsResult.ok && !smsResult.skipped) {
          warnings.push(`Customer SMS needs attention: ${smsResult.error ?? 'send failed'}`);
        }
      }
    }
  }

  if (!suppressNotifications) try {
    const addr = [row.service_address, row.service_city, row.service_state, row.service_zip].filter(Boolean).join(', ');
    const total = typeof row.base_price_cents === 'number' ? row.base_price_cents : 0;
    await notifyBusinessNewBookingFull({
      eventKind: 'rescheduled',
      appointmentId: id,
      guestName: guest,
      guestEmail: email,
      guestPhone: str(row.guest_phone),
      whenIso: newStart,
      totalCents: total,
      depositCents: typeof row.deposit_amount_cents === 'number' ? row.deposit_amount_cents : 0,
      vehicles: str(row.vehicle_description) || '—',
      serviceAddress: addr || null,
      extraNote: `Was ${whenChicago(oldStart)} — ${str(input.reason) || 'rescheduled'}`,
    });
    const techId = str(row.assigned_technician_id);
    if (techId) {
      const { notifyTechnicianJobRescheduled } = await import('@/lib/staff-notification-router');
      await notifyTechnicianJobRescheduled(admin, {
        technicianId: techId,
        appointmentId: id,
        extraNote: `Was ${whenChicago(oldStart)}`,
      });
    }
  } catch (e) {
    console.warn('[lifecycle] owner reschedule notify', e);
  }

  const googleCalendar =
    row.is_test === true
      ? { ok: false, skipped: true, error: 'QA appointment is excluded from Google Calendar.' }
      : await runGoogleCalendarSync(admin, id, 'upsert');
  if (!googleCalendar.ok && !googleCalendar.skipped) {
    warnings.push(`Google Calendar will retry: ${googleCalendar.error ?? 'sync failed'}`);
  }
  try {
    const { upsertAppointmentAvailabilityBlock } = await import('@/lib/booking-availability-block');
    await upsertAppointmentAvailabilityBlock(admin, id);
  } catch (error) {
    warnings.push(
      `Availability block needs attention: ${error instanceof Error ? error.message : 'update failed'}`,
    );
  }

  return { ok: true, googleCalendar, warnings };
}

export async function verifyAppointmentAccessToken(appointmentId: string, token: string): Promise<boolean> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return false;
  const { data } = await admin.from('appointments').select('access_token').eq('id', appointmentId).maybeSingle();
  return str((data as { access_token?: string } | null)?.access_token) === str(token);
}
