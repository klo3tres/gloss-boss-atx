import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { notifyBusinessNewBookingFull } from '@/lib/business-booking-notify';
import { runGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
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
    await admin.from('notification_outbox').insert({
      ...row,
      provider: row.channel === 'email' ? 'resend' : 'internal',
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[lifecycle] outbox', e);
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
  if (!to.includes('@')) return;
  let status = 'skipped';
  let err: string | null = null;
  if (resendConfigured()) {
    const sent = await sendResendHtml({ to, subject, html });
    status = sent.ok ? 'sent' : 'failed';
    err = sent.ok ? null : sent.error ?? 'send failed';
  }
  await logOutbox(admin, {
    appointment_id: appointmentId,
    kind: templateKey,
    channel: 'email',
    status,
    template_key: templateKey,
    error_message: err,
    payload: { to },
  });
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
): Promise<{ ok: boolean; error?: string; googleCalendar?: { ok: boolean; skipped?: boolean; error?: string } }> {
  const id = str(input.appointmentId);
  if (!id) return { ok: false, error: 'Missing appointment' };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (!appt) return { ok: false, error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  const { error } = await admin.rpc('cancel_appointment_atomic', {
    p_appointment_id: id,
    p_reason: str(input.reason) || 'Cancelled',
    p_actor_id: input.actorId ?? null,
    p_refund_decision: str(input.refundDecision) || '',
    p_notify_customer: input.notifyCustomer !== false,
  });
  if (error) return { ok: false, error: `Cancellation transaction failed: ${error.message}` };
  const currentPaymentStatus = str(row.payment_status).toLowerCase();
  const closedPaymentStatus = ['paid', 'paid_in_full', 'refunded', 'partially_refunded'].includes(currentPaymentStatus)
    ? currentPaymentStatus
    : 'cancelled';
  const { error: normalizationError } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      lifecycle_stage: 'cancelled',
      balance_due_cents: 0,
      payment_status: closedPaymentStatus,
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
  }

  const guest = str(row.guest_name) || 'Customer';
  const email = str(row.guest_email);
  const when = whenChicago(str(row.scheduled_start));
  const reason = str(input.reason) || 'schedule change';

  if (input.notifyCustomer !== false && email) {
    const html = `<p>Hi ${guest},</p><p>Your Gloss Boss ATX appointment on <strong>${when}</strong> has been cancelled.</p><p>Reason: ${reason}</p><p>Rebook anytime at <a href="${appBase()}/book">${appBase()}/book</a>.</p>`;
    await emailCustomer(admin, email, 'Gloss Boss ATX — Appointment cancelled', html, id, 'booking_cancelled');
  }

  try {
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
  }

  const googleCalendar = await runGoogleCalendarSync(admin, id, 'delete');
  try {
    const { removeAppointmentAvailabilityBlock } = await import('@/lib/booking-availability-block');
    await removeAppointmentAvailabilityBlock(admin, id);
  } catch (e) {
    console.warn('[lifecycle] availability block verification', e);
  }

  return { ok: true, googleCalendar };
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
): Promise<{ ok: boolean; error?: string; googleCalendar?: { ok: boolean; skipped?: boolean; error?: string } }> {
  const id = str(input.appointmentId);
  const newStart = str(input.newScheduledStart);
  if (!id || !newStart) return { ok: false, error: 'Missing appointment or new time' };
  if (Number.isNaN(new Date(newStart).getTime())) return { ok: false, error: 'Invalid date/time' };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (!appt) return { ok: false, error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  const oldStart = str(row.scheduled_start);
  const now = new Date().toISOString();

  const scheduleFields = await import('@/lib/booking-slot-blocking').then((m) => {
    const vehicles = Array.isArray(row.booking_vehicles) ? row.booking_vehicles : [];
    const durationLines =
      vehicles.length > 0
        ? (vehicles as Record<string, unknown>[]).map((v) => ({
            serviceSlug: str(v.service_slug) || str(row.service_slug) || 'exterior-wash',
            vehicleClass: str(v.vehicle_class) || str(row.vehicle_class) || 'sedan',
            addOnSlugs: Array.isArray(v.add_on_slugs) ? (v.add_on_slugs as string[]) : [],
          }))
        : [{ serviceSlug: str(row.service_slug) || 'exterior-wash', vehicleClass: str(row.vehicle_class) || 'sedan' }];
    return m.buildAppointmentScheduleFields(newStart, durationLines);
  });

  const { error } = await admin
    .from('appointments')
    .update({
      scheduled_start: newStart,
      ...scheduleFields,
      rescheduled_from: oldStart || null,
      status: str(row.status) === 'cancelled' ? 'scheduled' : row.status,
      cancelled_at: null,
      updated_at: now,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

  try {
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
  const calUrl = `${appBase()}/api/calendar/appointment/${id}`;
  const confirmUrl =
    token ? `${appBase()}/book/confirmation?appointment_id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}` : `${appBase()}/book`;

  if (input.notifyCustomer !== false && (email || phone)) {
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
      await emailCustomer(admin, email, subject, html, id, 'booking_rescheduled');
    }
    if (phone) {
      const { twilioConfigured } = await import('@/lib/email-send');
      const { sendCustomerSms } = await import('@/lib/sms-send');
      if (twilioConfigured()) {
        await sendCustomerSms({
          db: admin,
          kind: 'booking_rescheduled',
          template_key: 'reschedule_cancel',
          to: phone,
          body: smsBody,
          appointment_id: id,
          customer_id: row.customer_id ? str(row.customer_id) : null,
          requireConsent: false,
        });
      }
    }
  }

  try {
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

  const googleCalendar = await runGoogleCalendarSync(admin, id, 'upsert');
  void import('@/lib/booking-availability-block').then(({ upsertAppointmentAvailabilityBlock }) =>
    upsertAppointmentAvailabilityBlock(admin, id).catch((e) => console.warn('[lifecycle] availability block', e)),
  );

  return { ok: true, googleCalendar };
}

export async function verifyAppointmentAccessToken(appointmentId: string, token: string): Promise<boolean> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return false;
  const { data } = await admin.from('appointments').select('access_token').eq('id', appointmentId).maybeSingle();
  return str((data as { access_token?: string } | null)?.access_token) === str(token);
}
