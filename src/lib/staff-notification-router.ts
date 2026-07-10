import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { logNotificationOutbox } from '@/lib/notification-outbox-log';
import { sendPushoverNotification, pushoverConfigured } from '@/lib/pushover';
import { sendWebPushToUser } from '@/lib/web-push-send';
import {
  insertTitanNotificationEvent,
  updateNotificationChannelStatuses,
} from '@/lib/titan/notification-events';
import {
  isStaffInQuietHours,
  loadStaffNotificationPreferences,
  staffEventAllowed,
  type StaffNotificationEventType,
} from '@/lib/staff-notification-preferences';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function formatApptTime(iso?: string | null) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'TBD';
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function appBase() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
}

function jobUrl(appointmentId: string) {
  return `${appBase()}/tech/work-orders/${encodeURIComponent(appointmentId)}`;
}

export type EmitStaffNotificationInput = {
  technicianId: string;
  appointmentId: string;
  eventType: StaffNotificationEventType;
  actorId?: string | null;
  extraNote?: string;
  /** Override quiet hours for urgent cancels */
  bypassQuietHours?: boolean;
};

function buildMessages(
  eventType: StaffNotificationEventType,
  guest: string,
  service: string,
  when: string,
  address: string,
  appointmentId: string,
  extraNote?: string,
) {
  const addrPart = address ? ` · ${address}` : '';
  const notePart = extraNote ? ` (${extraNote})` : '';
  const url = jobUrl(appointmentId);

  switch (eventType) {
    case 'job_assigned':
    case 'new_booking_assigned':
      return {
        title: `Job assigned: ${guest}`,
        sms: `Gloss Boss ATX: New job — ${guest}, ${service}, ${when}.${addrPart} Open: ${url}`,
        body: `${service} · ${when}${addrPart}${notePart}`,
        kind: 'tech_job_assigned',
      };
    case 'job_rescheduled':
      return {
        title: `Job rescheduled: ${guest}`,
        sms: `Gloss Boss ATX: Schedule change — ${guest}, ${service}. New time: ${when}.${addrPart}${notePart}`,
        body: `New time: ${when}${addrPart}${notePart}`,
        kind: 'tech_job_rescheduled',
      };
    case 'job_cancelled':
      return {
        title: `Job cancelled: ${guest}`,
        sms: `Gloss Boss ATX: Cancelled — ${guest}, ${service} (${when}).${notePart}`,
        body: `Was scheduled ${when}${notePart}`,
        kind: 'tech_job_cancelled',
      };
    default:
      return {
        title: `Job update: ${guest}`,
        sms: `Gloss Boss ATX: ${guest} · ${service} · ${when}`,
        body: `${service} · ${when}`,
        kind: 'tech_job_update',
      };
  }
}

function statusLabel(ok: boolean | undefined, skipped?: boolean): string {
  if (skipped) return 'skipped';
  if (ok) return 'sent';
  return 'failed';
}

/** Route job alerts to assigned staff via email, SMS, web push, Pushover (optional), and in-app. */
export async function emitStaffNotification(
  admin: SupabaseClient,
  input: EmitStaffNotificationInput,
): Promise<{ emailStatus: string; smsStatus: string; pushStatus: string; inAppStatus: string }> {
  const noop = { emailStatus: 'skipped', smsStatus: 'skipped', pushStatus: 'skipped', inAppStatus: 'skipped' };
  if (!input.technicianId || !input.appointmentId) return noop;

  const prefs = await loadStaffNotificationPreferences(admin, input.technicianId);
  if (!staffEventAllowed(prefs, input.eventType)) return noop;

  const quiet = !input.bypassQuietHours && isStaffInQuietHours(prefs);
  if (quiet) {
    return { emailStatus: 'quiet_hours', smsStatus: 'quiet_hours', pushStatus: 'quiet_hours', inAppStatus: 'quiet_hours' };
  }

  const [{ data: tech }, { data: appt }] = await Promise.all([
    admin
      .from('profiles')
      .select('id, full_name, phone, email, pushover_user_key')
      .eq('id', input.technicianId)
      .maybeSingle(),
    admin
      .from('appointments')
      .select('id, guest_name, service_slug, scheduled_start, service_address, service_city')
      .eq('id', input.appointmentId)
      .maybeSingle(),
  ]);

  if (!appt) return noop;

  const techName = str(tech?.full_name) || 'Technician';
  const guest = str(appt.guest_name) || 'Customer';
  const service = str(appt.service_slug).replace(/-/g, ' ') || 'detail';
  const when = formatApptTime(str(appt.scheduled_start));
  const address = [str(appt.service_address), str(appt.service_city)].filter(Boolean).join(', ');
  const url = jobUrl(input.appointmentId);
  const msgs = buildMessages(input.eventType, guest, service, when, address, input.appointmentId, input.extraNote);
  const smsBody = msgs.sms;

  let emailStatus = 'skipped';
  let smsStatus = 'skipped';
  let pushStatus = 'skipped';
  let inAppStatus = 'skipped';

  const inserted = prefs.notifyInAppEnabled
    ? await insertTitanNotificationEvent(admin, {
        title: msgs.title,
        body: msgs.body,
        source: 'staff_router',
        priority: input.eventType === 'job_cancelled' ? 'high' : 'normal',
        relatedType: 'appointment',
        relatedId: input.appointmentId,
        relatedUrl: url,
        providerPayload: {
          technician_id: input.technicianId,
          event_type: input.eventType,
          actor_id: input.actorId ?? null,
        },
      })
    : { ok: false };

  if (inserted.ok) inAppStatus = 'sent';

  const email = str(tech?.email);
  if (prefs.notifyEmailEnabled && email && resendConfigured()) {
    const sent = await sendResendHtml({
      to: email,
      subject: `Gloss Boss ATX — ${msgs.title}`,
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111"><p>Hi ${techName},</p><p><strong>${msgs.title}</strong></p><p>${msgs.body}</p><p><a href="${url}">Open work order</a></p></div>`,
    });
    emailStatus = statusLabel(sent.ok);
    await logNotificationOutbox({
      kind: msgs.kind,
      channel: 'email',
      status: sent.ok ? 'sent' : 'failed',
      provider: 'resend',
      recipient: email,
      appointment_id: input.appointmentId,
      template_key: msgs.kind,
      error_message: sent.error ?? null,
      payload: { guest, service, when, event_type: input.eventType, technician_id: input.technicianId },
    });
  }

  const phone = str(tech?.phone);
  if (prefs.notifySmsEnabled && phone) {
    const sms = await sendCustomerSms({
      db: admin,
      kind: msgs.kind,
      template_key: msgs.kind,
      to: phone,
      body: smsBody,
      requireConsent: false,
      appointment_id: input.appointmentId,
      technician_id: input.technicianId,
    });
    smsStatus = statusLabel(sms.ok, sms.skipped);
    await logNotificationOutbox({
      kind: msgs.kind,
      channel: 'sms',
      status: sms.ok ? 'sent' : 'failed',
      provider: 'twilio',
      recipient: phone,
      appointment_id: input.appointmentId,
      template_key: msgs.kind,
      error_message: sms.error ?? null,
      payload: { guest, service, when, event_type: input.eventType, technician_id: input.technicianId },
    });
  }

  if (prefs.notifyPushEnabled) {
    const web = await sendWebPushToUser(admin, input.technicianId, {
      title: msgs.title,
      body: msgs.body,
      url,
      tag: `${msgs.kind}-${input.appointmentId}`,
    });
    if (web.sent > 0) {
      pushStatus = 'sent';
    } else if (str(tech?.pushover_user_key) && pushoverConfigured()) {
      const push = await sendPushoverNotification({
        title: msgs.title,
        message: msgs.body,
        url,
        priority: input.eventType === 'job_cancelled' ? 1 : 0,
        userKey: str(tech?.pushover_user_key),
      });
      pushStatus = statusLabel(push.ok, push.skipped);
    } else if (web.skipped && !str(tech?.pushover_user_key)) {
      pushStatus = 'not_subscribed';
    } else if (web.failed > 0) {
      pushStatus = 'failed';
    }
  }

  if (inserted.id) {
    await updateNotificationChannelStatuses(admin, inserted.id, {
      emailStatus,
      smsStatus,
      pushoverStatus: pushStatus,
      providerPayload: { event_type: input.eventType, technician_id: input.technicianId },
    });
  }

  try {
    const { logTitanActivity } = await import('@/lib/titan/activity-feed');
    await logTitanActivity(admin, {
      kind: input.eventType === 'job_assigned' || input.eventType === 'new_booking_assigned' ? 'tech_job_assigned' : 'outreach_sent',
      title: `${msgs.title} → ${techName}`,
      detail: `${guest} · ${service} · Email:${emailStatus} SMS:${smsStatus} Push:${pushStatus}`,
      href: '/admin/dispatch',
      metadata: {
        appointment_id: input.appointmentId,
        technician_id: input.technicianId,
        actor_id: input.actorId,
        event_type: input.eventType,
      },
    });
  } catch {
    /* non-blocking */
  }

  return { emailStatus, smsStatus, pushStatus, inAppStatus };
}

/** Notify assigned technician — delegates to staff router. */
export async function notifyTechnicianJobAssigned(
  admin: SupabaseClient,
  input: { technicianId: string; appointmentId: string; actorId?: string | null },
): Promise<{ smsStatus: string; pushStatus: string }> {
  const res = await emitStaffNotification(admin, {
    technicianId: input.technicianId,
    appointmentId: input.appointmentId,
    eventType: 'job_assigned',
    actorId: input.actorId,
  });
  return { smsStatus: res.smsStatus, pushStatus: res.pushStatus };
}

export async function notifyTechnicianJobRescheduled(
  admin: SupabaseClient,
  input: { technicianId: string; appointmentId: string; extraNote?: string },
) {
  return emitStaffNotification(admin, {
    technicianId: input.technicianId,
    appointmentId: input.appointmentId,
    eventType: 'job_rescheduled',
    extraNote: input.extraNote,
  });
}

export async function notifyTechnicianJobCancelled(
  admin: SupabaseClient,
  input: { technicianId: string; appointmentId: string; extraNote?: string },
) {
  return emitStaffNotification(admin, {
    technicianId: input.technicianId,
    appointmentId: input.appointmentId,
    eventType: 'job_cancelled',
    extraNote: input.extraNote,
    bypassQuietHours: true,
  });
}

export async function notifyTechnicianNewBookingAssigned(
  admin: SupabaseClient,
  input: { technicianId: string; appointmentId: string },
) {
  return emitStaffNotification(admin, {
    technicianId: input.technicianId,
    appointmentId: input.appointmentId,
    eventType: 'new_booking_assigned',
  });
}
