import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { notifyBusinessNewBookingFull } from '@/lib/business-booking-notify';
import { runGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

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

export async function cancelAppointmentLifecycle(
  admin: SupabaseClient,
  input: { appointmentId: string; reason?: string; notifyCustomer?: boolean },
): Promise<{ ok: boolean; error?: string; googleCalendar?: { ok: boolean; skipped?: boolean; error?: string } }> {
  const id = str(input.appointmentId);
  if (!id) return { ok: false, error: 'Missing appointment' };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', id).maybeSingle();
  if (!appt) return { ok: false, error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  if (str(row.status) === 'cancelled') return { ok: true };

  const now = new Date().toISOString();
  const { error } = await admin
    .from('appointments')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      cancel_reason: str(input.reason) || 'Cancelled',
      updated_at: now,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };

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
  void import('@/lib/booking-availability-block').then(({ removeAppointmentAvailabilityBlock }) =>
    removeAppointmentAvailabilityBlock(admin, id).catch((e) => console.warn('[lifecycle] availability block', e)),
  );

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
