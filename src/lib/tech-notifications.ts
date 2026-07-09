import type { SupabaseClient } from '@supabase/supabase-js';
import { sendCustomerSms } from '@/lib/sms-send';
import { sendPushoverNotification, pushoverConfigured } from '@/lib/pushover';
import { logNotificationOutbox } from '@/lib/notification-outbox-log';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function formatApptTime(iso?: string | null) {
  if (!iso) return 'your next job';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'your next job';
  return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Notify assigned technician via SMS + push (Pushover) from Gloss Boss. */
export async function notifyTechnicianJobAssigned(
  admin: SupabaseClient,
  input: { technicianId: string; appointmentId: string; actorId?: string | null },
): Promise<{ smsStatus: string; pushStatus: string }> {
  const [{ data: tech }, { data: appt }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, email').eq('id', input.technicianId).maybeSingle(),
    admin
      .from('appointments')
      .select('id, guest_name, service_slug, scheduled_start, service_address, service_city')
      .eq('id', input.appointmentId)
      .maybeSingle(),
  ]);

  const techName = str(tech?.full_name) || 'Technician';
  const guest = str(appt?.guest_name) || 'Customer';
  const service = str(appt?.service_slug).replace(/-/g, ' ') || 'detail';
  const when = formatApptTime(str(appt?.scheduled_start));
  const address = [str(appt?.service_address), str(appt?.service_city)].filter(Boolean).join(', ');
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
  const jobUrl = `${appUrl}/tech?job=${input.appointmentId}`;

  const smsBody = `Gloss Boss ATX: New job assigned — ${guest}, ${service}, ${when}.${address ? ` ${address}.` : ''} Open: ${jobUrl}`;
  const pushTitle = `Job assigned: ${guest}`;
  const pushBody = `${service} · ${when}${address ? ` · ${address}` : ''}`;

  let smsStatus = 'skipped';
  let pushStatus = 'skipped';

  const phone = str(tech?.phone);
  if (phone) {
    const sms = await sendCustomerSms({
      db: admin,
      kind: 'tech_job_assigned',
      template_key: 'tech_job_assigned',
      to: phone,
      body: smsBody,
      requireConsent: false,
      appointment_id: input.appointmentId,
      technician_id: input.technicianId,
    });
    smsStatus = sms.ok ? 'sent' : sms.skipped ? 'skipped' : 'failed';
    await logNotificationOutbox({
      kind: 'tech_job_assigned',
      channel: 'sms',
      status: sms.ok ? 'sent' : 'failed',
      provider: 'twilio',
      recipient: phone,
      appointment_id: input.appointmentId,
      template_key: 'tech_job_assigned',
      error_message: sms.error ?? null,
      payload: { guest, service, when, technician_id: input.technicianId },
    });
  }

  if (pushoverConfigured()) {
    const push = await sendPushoverNotification({
      title: `${pushTitle} → ${techName}`,
      message: pushBody,
      url: jobUrl,
      priority: 1,
    });
    pushStatus = push.ok ? 'sent' : push.skipped ? 'skipped' : 'failed';
  }

  try {
    const { logTitanActivity } = await import('@/lib/titan/activity-feed');
    await logTitanActivity(admin, {
      kind: 'tech_job_assigned',
      title: `Job assigned to ${techName}`,
      detail: `${guest} · ${service} · SMS:${smsStatus} Push:${pushStatus}`,
      href: '/admin/dispatch',
      metadata: { appointment_id: input.appointmentId, technician_id: input.technicianId, actor_id: input.actorId },
    });
  } catch {
    /* non-blocking */
  }

  return { smsStatus, pushStatus };
}
