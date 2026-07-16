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
import { loadAppointmentNotificationPolicy } from '@/lib/appointment-notification-policy';

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
    case 'job_reminder_24h':
      return {
        title: `Tomorrow: ${guest}`,
        sms: `Gloss Boss ATX: Reminder — job tomorrow with ${guest}, ${service}, ${when}.${addrPart} Open: ${url}`,
        body: `24h reminder · ${service} · ${when}${addrPart}${notePart}`,
        kind: 'tech_job_reminder_24h',
      };
    case 'job_reminder_2h':
      return {
        title: `Starting soon: ${guest}`,
        sms: `Gloss Boss ATX: Job in ~2 hours — ${guest}, ${service}, ${when}.${addrPart} Open: ${url}`,
        body: `2h reminder · ${service} · ${when}${addrPart}${notePart}`,
        kind: 'tech_job_reminder_2h',
      };
    case 'job_start_overdue':
      return {
        title: `Job has not started: ${guest}`,
        sms: `Gloss Boss ATX: ${guest}'s job was scheduled for ${when} and has not been started. Open: ${url}`,
        body: `Start time passed 15+ minutes ago · ${service} · ${when}${addrPart}${notePart}`,
        kind: 'tech_job_start_overdue',
      };
    case 'job_reminder_60m':
    case 'job_reminder_30m': {
      const minutes = eventType === 'job_reminder_60m' ? 60 : 30;
      return { title: `Job in ${minutes} minutes: ${guest}`, sms: `Gloss Boss ATX: ${guest}'s ${service} starts in ${minutes} minutes at ${when}.${addrPart} Open: ${url}`, body: `${minutes}-minute reminder · ${service} · ${when}${addrPart}`, kind: `tech_job_reminder_${minutes}m` };
    }
    case 'job_not_acknowledged':
      return { title: `Assignment needs acknowledgment: ${guest}`, sms: `Gloss Boss ATX: Please acknowledge ${guest}'s job scheduled for ${when}. Open: ${url}`, body: `Assignment has not been acknowledged · ${service} · ${when}`, kind: 'tech_job_not_acknowledged' };
    case 'job_not_on_the_way':
      return { title: `On-the-way status missing: ${guest}`, sms: `Gloss Boss ATX: ${guest}'s job starts at ${when}. Mark on the way or update the ETA: ${url}`, body: `On-the-way status missing · ${service} · ${when}`, kind: 'tech_job_not_on_the_way' };
    case 'job_running_over':
      return { title: `Job is running over: ${guest}`, sms: `Gloss Boss ATX: ${guest}'s job is past its estimated duration. Update the owner/customer as needed: ${url}`, body: `Estimated duration exceeded · ${service} · ${when}`, kind: 'tech_job_running_over' };
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

/**
 * Schedule 24h + 2h staff job reminders for the assigned technician (and owner via processor).
 * Dedupes on scheduled_messages.rule_key staff_job_24h / staff_job_2h per appointment.
 * Skips when no technician is assigned or scheduled_start is missing/past the reminder window.
 */
export async function enqueueStaffJobReminders(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    technicianId?: string | null;
    scheduledStart?: string | null;
    guestName?: string | null;
    serviceSlug?: string | null;
  },
): Promise<{ enqueued: string[]; skipped?: string }> {
  const appointmentId = str(input.appointmentId);
  const technicianId = str(input.technicianId);
  const scheduledStart = str(input.scheduledStart);
  if (!appointmentId) return { enqueued: [], skipped: 'missing_appointment' };
  if (!technicianId) return { enqueued: [], skipped: 'not_assigned' };
  if (!scheduledStart) return { enqueued: [], skipped: 'missing_schedule' };

  const startMs = new Date(scheduledStart).getTime();
  if (Number.isNaN(startMs)) return { enqueued: [], skipped: 'invalid_schedule' };

  const guest = str(input.guestName) || 'Customer';
  const service = str(input.serviceSlug).replace(/-/g, ' ') || 'detail';
  const when = formatApptTime(scheduledStart);
  const enqueued: string[] = [];

  // Drop pending reminders so reschedule/reassign can replace them.
  await admin
    .from('scheduled_messages')
    .update({ status: 'cancelled', skipped_reason: 'rescheduled_or_reassigned', updated_at: new Date().toISOString() })
    .eq('appointment_id', appointmentId)
    .in('rule_key', ['staff_job_24h', 'staff_job_2h', 'staff_job_60m', 'staff_job_30m'])
    .eq('status', 'scheduled');

  for (const spec of [
    { ruleKey: 'staff_job_24h', hoursBefore: 24, label: '24h' },
    { ruleKey: 'staff_job_2h', hoursBefore: 2, label: '2h' },
    { ruleKey: 'staff_job_60m', hoursBefore: 1, label: '60m' },
    { ruleKey: 'staff_job_30m', hoursBefore: 0.5, label: '30m' },
  ] as const) {
    const dueMs = startMs - spec.hoursBefore * 3600000;
    if (dueMs < Date.now() - 60_000) continue;

    const { data: existing } = await admin
      .from('scheduled_messages')
      .select('id')
      .eq('appointment_id', appointmentId)
      .eq('rule_key', spec.ruleKey)
      .in('status', ['scheduled', 'sent', 'sending'])
      .limit(1);
    if ((existing ?? []).length > 0) continue;

    const body = `Staff job reminder (${spec.label}): ${guest} · ${service} · ${when}`;
    const { error } = await admin.from('scheduled_messages').insert({
      rule_key: spec.ruleKey,
      channel: 'staff',
      recipient: `staff:${technicianId}`,
      subject: `Job reminder ${spec.label}`,
      body,
      scheduled_for: new Date(dueMs).toISOString(),
      appointment_id: appointmentId,
      entity_type: 'appointment',
      entity_id: appointmentId,
      status: 'scheduled',
    });
    if (!error) enqueued.push(spec.ruleKey);
  }

  return { enqueued };
}

/** Process due staff_job_* scheduled rows via staff + owner notification routers. */
export async function processDueStaffJobReminders(
  admin: SupabaseClient,
): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'scheduled')
    .in('rule_key', ['staff_job_24h', 'staff_job_2h', 'staff_job_60m', 'staff_job_30m'])
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(40);

  if (error || !data?.length) return { sent: 0, skipped: 0, failed: 0 };

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of data) {
    const r = row as Record<string, unknown>;
    const id = str(r.id);
    const appointmentId = str(r.appointment_id);
    const ruleKey = str(r.rule_key);
    const recipient = str(r.recipient);
    const technicianId = recipient.startsWith('staff:') ? recipient.slice(6) : recipient;

    await admin
      .from('scheduled_messages')
      .update({ status: 'sending', last_attempt_at: now, updated_at: now })
      .eq('id', id);

    if (!appointmentId || !technicianId) {
      await admin
        .from('scheduled_messages')
        .update({ status: 'skipped', skipped_reason: 'missing_staff_or_appointment', updated_at: now })
        .eq('id', id);
      skipped++;
      continue;
    }

    const { data: appt } = await admin
      .from('appointments')
      .select('id, assigned_technician_id, guest_name, service_slug, scheduled_start, status')
      .eq('id', appointmentId)
      .maybeSingle();

    const assigned = str((appt as { assigned_technician_id?: string } | null)?.assigned_technician_id);
    const status = str((appt as { status?: string } | null)?.status).toLowerCase();
    if (!assigned || assigned !== technicianId || ['cancelled', 'completed', 'archived'].includes(status)) {
      await admin
        .from('scheduled_messages')
        .update({ status: 'skipped', skipped_reason: 'not_assigned_or_closed', updated_at: now })
        .eq('id', id);
      skipped++;
      continue;
    }

    const eventType = ruleKey === 'staff_job_30m' ? 'job_reminder_30m' : ruleKey === 'staff_job_60m' ? 'job_reminder_60m' : ruleKey === 'staff_job_2h' ? 'job_reminder_2h' : 'job_reminder_24h';
    try {
      await emitStaffNotification(admin, {
        technicianId,
        appointmentId,
        eventType,
      });
      const guest = str((appt as { guest_name?: string } | null)?.guest_name) || 'Customer';
      const when = formatApptTime((appt as { scheduled_start?: string } | null)?.scheduled_start);
      try {
        const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
        await emitOwnerNotification(admin, {
          eventType: 'new_booking',
          title: ruleKey === 'staff_job_2h' ? `Job in 2h: ${guest}` : `Job tomorrow: ${guest}`,
          body: `Staff reminder (${ruleKey}) — ${guest} at ${when}. Tech assigned.`,
          source: 'staff_job_reminder',
          relatedType: 'appointment',
          relatedId: appointmentId,
          relatedUrl: `/admin/work-orders/${appointmentId}`,
        });
      } catch {
        /* owner notify best-effort */
      }
      await admin
        .from('scheduled_messages')
        .update({ status: 'sent', sent_at: now, provider: 'staff_router', updated_at: now })
        .eq('id', id);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin
        .from('scheduled_messages')
        .update({ status: 'failed', skipped_reason: msg, updated_at: now })
        .eq('id', id);
      failed++;
    }
  }

  return { sent, skipped, failed };
}

/** Alert owner and assigned technician once when a job is still not started 15 minutes after start time. */
export async function processMissedJobStartAlerts(
  admin: SupabaseClient,
): Promise<{ alerted: number; skipped: number; failed: number }> {
  const policy = await loadAppointmentNotificationPolicy(admin);
  if (!policy.enabled) return { alerted: 0, skipped: 0, failed: 0 };
  const now = Date.now();
  const cutoff = new Date(now - policy.firstLateMinutes * 60_000).toISOString();
  const oldest = new Date(now - 24 * 60 * 60_000).toISOString();
  const fullQuery = await admin
    .from('appointments')
    .select('id, guest_name, service_slug, scheduled_start, status, job_started_at, assigned_technician_id, flexible_arrival, delay_approved_by_owner_at, delay_approved_by_customer_at, updated_eta_minutes')
    .gte('scheduled_start', oldest)
    .lte('scheduled_start', cutoff)
    .is('job_started_at', null)
    .not('status', 'in', '(cancelled,canceled,completed,archived,in_progress)')
    .order('scheduled_start', { ascending: true })
    .limit(50);
  let data = fullQuery.data as Record<string, unknown>[] | null;
  let error = fullQuery.error;

  if (error && /flexible_arrival|delay_approved|updated_eta_minutes|column|schema cache|Could not find|does not exist/i.test(error.message)) {
    const legacyQuery = await admin
      .from('appointments')
      .select('id, guest_name, service_slug, scheduled_start, status, job_started_at, assigned_technician_id')
      .gte('scheduled_start', oldest)
      .lte('scheduled_start', cutoff)
      .is('job_started_at', null)
      .not('status', 'in', '(cancelled,canceled,completed,archived,in_progress)')
      .order('scheduled_start', { ascending: true })
      .limit(50);
    data = legacyQuery.data as Record<string, unknown>[] | null;
    error = legacyQuery.error;
  }

  if (error || !data?.length) return { alerted: 0, skipped: 0, failed: error ? 1 : 0 };
  let alerted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of data) {
    const appointmentId = str(row.id);
    const guest = str(row.guest_name) || 'Customer';
    const scheduledStart = str(row.scheduled_start);
    const operational = row as Record<string, unknown>;
    if (
      operational.flexible_arrival === true ||
      Boolean(operational.delay_approved_by_owner_at) ||
      Boolean(operational.delay_approved_by_customer_at)
    ) {
      skipped++;
      continue;
    }
    const etaDelayMinutes = Math.max(0, Number(operational.updated_eta_minutes ?? 0) || 0);
    const scheduledMs = Date.parse(scheduledStart);
    if (etaDelayMinutes > 0 && Number.isFinite(scheduledMs) && now < scheduledMs + (etaDelayMinutes + policy.firstLateMinutes) * 60_000) {
      skipped++;
      continue;
    }
    const markerPayload = {
      rule_key: `job_start_overdue_${policy.firstLateMinutes}m`,
      channel: 'email',
      recipient: 'owner',
      subject: `Job has not started: ${guest}`,
      body: `${guest}'s appointment has not started ${policy.firstLateMinutes} minutes after its scheduled time.`,
      status: 'scheduled',
      scheduled_for: new Date().toISOString(),
      appointment_id: appointmentId,
      entity_type: 'appointment',
      entity_id: appointmentId,
      metadata: { alert_only: true, threshold_minutes: policy.firstLateMinutes },
    };
    let markerId = '';
    const marker = await admin.from('scheduled_messages').insert(markerPayload).select('id').maybeSingle();
    if (marker.error) {
      if (!/duplicate|unique/i.test(marker.error.message)) {
        failed++;
        continue;
      }
      const existing = await admin
        .from('scheduled_messages')
        .select('id, status')
        .eq('rule_key', `job_start_overdue_${policy.firstLateMinutes}m`)
        .eq('appointment_id', appointmentId)
        .maybeSingle();
      if (!existing.data?.id || existing.data.status === 'sent') {
        skipped++;
        continue;
      }
      markerId = str(existing.data.id);
      await admin.from('scheduled_messages').update({ status: 'scheduled', skipped_reason: null }).eq('id', markerId);
    } else {
      markerId = str(marker.data?.id);
    }

    try {
      const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
      await emitOwnerNotification(admin, {
        eventType: 'job_start_overdue',
        title: `Job has not started: ${guest}`,
        body: `${guest}'s appointment was scheduled for ${formatApptTime(scheduledStart)} and is now more than ${policy.firstLateMinutes} minutes late without a recorded job start.`,
        source: 'missed_job_start_monitor',
        priority: 'high',
        relatedType: 'appointment',
        relatedId: appointmentId,
        relatedUrl: `/admin/work-orders/${encodeURIComponent(appointmentId)}`,
        bypassQuietHours: true,
      });
      const technicianId = str(row.assigned_technician_id);
      if (technicianId) {
        await emitStaffNotification(admin, {
          technicianId,
          appointmentId,
          eventType: 'job_start_overdue',
          extraNote: 'Please start the job or contact the owner.',
          bypassQuietHours: true,
        });
      }
      if (markerId) {
        await admin.from('scheduled_messages').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          skipped_reason: null,
          updated_at: new Date().toISOString(),
        }).eq('id', markerId);
      }
      alerted++;
    } catch (error) {
      if (markerId) {
        await admin.from('scheduled_messages').update({
          status: 'failed',
          skipped_reason: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        }).eq('id', markerId);
      }
      failed++;
    }
  }
  return { alerted, skipped, failed };
}

async function emitOperationalAlertOnce(
  admin: SupabaseClient,
  input: { ruleKey: string; appointmentId: string; technicianId?: string; guest: string; title: string; body: string; staffEvent: StaffNotificationEventType; cooldownMinutes?: number; maximumSends?: number },
): Promise<'alerted' | 'skipped' | 'failed'> {
  const now = new Date().toISOString();
  const existing = await admin.from('scheduled_messages').select('id, created_at').eq('appointment_id', input.appointmentId).like('rule_key', `${input.ruleKey}%`).order('created_at', { ascending: false }).limit(Math.max(1, input.maximumSends ?? 1));
  if ((existing.data?.length ?? 0) >= Math.max(1, input.maximumSends ?? 1)) return 'skipped';
  const latestAt = Date.parse(String(existing.data?.[0]?.created_at ?? ''));
  if (Number.isFinite(latestAt) && Date.now() < latestAt + Math.max(1, input.cooldownMinutes ?? 30) * 60_000) return 'skipped';
  const sendIndex = (existing.data?.length ?? 0) + 1;
  const marker = await admin.from('scheduled_messages').insert({
    rule_key: `${input.ruleKey}_send_${sendIndex}`,
    channel: 'staff',
    recipient: input.technicianId ? `staff:${input.technicianId}` : 'owner',
    subject: input.title,
    body: input.body,
    status: 'scheduled',
    scheduled_for: now,
    appointment_id: input.appointmentId,
    entity_type: 'appointment',
    entity_id: input.appointmentId,
    metadata: { alert_only: true },
  }).select('id').maybeSingle();
  if (marker.error) return /duplicate|unique/i.test(marker.error.message) ? 'skipped' : 'failed';
  try {
    const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
    await emitOwnerNotification(admin, { eventType: 'job_start_overdue', title: input.title, body: input.body, source: 'appointment_operations_monitor', priority: 'high', relatedType: 'appointment', relatedId: input.appointmentId, relatedUrl: `/admin/work-orders/${encodeURIComponent(input.appointmentId)}`, bypassQuietHours: true });
    if (input.technicianId) await emitStaffNotification(admin, { technicianId: input.technicianId, appointmentId: input.appointmentId, eventType: input.staffEvent, extraNote: input.body, bypassQuietHours: true });
    await admin.from('scheduled_messages').update({ status: 'sent', sent_at: now, updated_at: now }).eq('id', marker.data?.id);
    return 'alerted';
  } catch (error) {
    await admin.from('scheduled_messages').update({ status: 'failed', skipped_reason: error instanceof Error ? error.message : String(error), updated_at: now }).eq('id', marker.data?.id);
    return 'failed';
  }
}

/** Additional acknowledgment, on-the-way, 30-minute-late, and overrun escalation checks. */
export async function processAppointmentOperationalAlerts(admin: SupabaseClient): Promise<{ alerted: number; skipped: number; failed: number }> {
  const totals = { alerted: 0, skipped: 0, failed: 0 };
  const policy = await loadAppointmentNotificationPolicy(admin);
  if (!policy.enabled) return totals;
  const now = Date.now();
  const windowStart = new Date(now - 24 * 60 * 60_000).toISOString();
  const windowEnd = new Date(now + 2 * 60 * 60_000).toISOString();
  const { data: scheduled } = await admin.from('appointments')
    .select('id, guest_name, scheduled_start, status, assigned_technician_id, technician_acknowledged_at, on_the_way_at, job_started_at, flexible_arrival, delay_approved_by_owner_at, delay_approved_by_customer_at')
    .gte('scheduled_start', windowStart).lte('scheduled_start', windowEnd).limit(100);
  for (const raw of scheduled ?? []) {
    const row = raw as Record<string, unknown>;
    const status = str(row.status).toLowerCase();
    if (['cancelled', 'canceled', 'completed', 'archived', 'voided'].includes(status) || row.flexible_arrival === true || row.delay_approved_by_owner_at || row.delay_approved_by_customer_at) continue;
    const appointmentId = str(row.id);
    const technicianId = str(row.assigned_technician_id);
    const guest = str(row.guest_name) || 'Customer';
    const start = Date.parse(str(row.scheduled_start));
    if (!appointmentId || !Number.isFinite(start)) continue;
    const checks: Array<{ due: boolean; ruleKey: string; title: string; body: string; staffEvent: StaffNotificationEventType }> = [
      { due: Boolean(technicianId) && !row.technician_acknowledged_at && now >= start - policy.acknowledgeMinutesBefore * 60_000, ruleKey: `job_not_acknowledged_${policy.acknowledgeMinutesBefore}m`, title: `Assignment not acknowledged: ${guest}`, body: `${guest}'s assignment is within ${policy.acknowledgeMinutesBefore} minutes and has not been acknowledged.`, staffEvent: 'job_not_acknowledged' },
      { due: Boolean(technicianId) && !row.on_the_way_at && !row.job_started_at && now >= start - policy.onWayMinutesBefore * 60_000, ruleKey: `job_not_on_the_way_${policy.onWayMinutesBefore}m`, title: `On-the-way status missing: ${guest}`, body: `${guest}'s appointment is within ${policy.onWayMinutesBefore} minutes and no on-the-way status is recorded.`, staffEvent: 'job_not_on_the_way' },
      { due: !row.job_started_at && now >= start + policy.secondLateMinutes * 60_000, ruleKey: `job_start_overdue_${policy.secondLateMinutes}m`, title: `Job is ${policy.secondLateMinutes} minutes late: ${guest}`, body: `${guest}'s appointment has not started ${policy.secondLateMinutes} minutes after its scheduled time.`, staffEvent: 'job_start_overdue' },
    ];
    for (const check of checks) {
      if (!check.due) continue;
      const result = await emitOperationalAlertOnce(admin, { ...check, appointmentId, technicianId, guest, cooldownMinutes: policy.cooldownMinutes, maximumSends: policy.maximumSendsPerRule });
      totals[result]++;
    }
  }

  const { data: running } = await admin.from('appointments')
    .select('id, guest_name, assigned_technician_id, job_started_at, estimated_duration_minutes, status')
    .not('job_started_at', 'is', null).is('job_completed_at', null).limit(100);
  for (const raw of running ?? []) {
    const row = raw as Record<string, unknown>;
    if (!['in_progress', 'started', 'active'].includes(str(row.status).toLowerCase())) continue;
    const started = Date.parse(str(row.job_started_at));
    const estimated = Math.max(15, Number(row.estimated_duration_minutes ?? 120) || 120);
    if (!Number.isFinite(started) || now < started + (estimated + policy.overrunGraceMinutes) * 60_000) continue;
    const appointmentId = str(row.id);
    const guest = str(row.guest_name) || 'Customer';
    const result = await emitOperationalAlertOnce(admin, { ruleKey: `job_running_over_${policy.overrunGraceMinutes}m`, appointmentId, technicianId: str(row.assigned_technician_id), guest, title: `Job is running over: ${guest}`, body: `${guest}'s job is more than ${policy.overrunGraceMinutes} minutes past its estimated duration.`, staffEvent: 'job_running_over', cooldownMinutes: policy.cooldownMinutes, maximumSends: policy.maximumSendsPerRule });
    totals[result]++;
  }
  return totals;
}
