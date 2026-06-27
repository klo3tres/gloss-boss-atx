'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { cancelAppointmentLifecycle, rescheduleAppointmentLifecycle } from '@/lib/appointment-lifecycle';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return admin;
}

export async function adminCancelAppointmentActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return adminCancelAppointmentAction(formData);
}

export async function adminRescheduleAppointmentActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return adminRescheduleAppointmentAction(formData);
}

export async function adminCancelAppointmentAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return actionErr('Forbidden');
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const reason = String(formData.get('reason') ?? 'Cancelled by admin').trim();
  const r = await cancelAppointmentLifecycle(admin, { appointmentId, reason });
  if (!r.ok) return actionErr(r.error ?? 'Cancel failed');
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  return actionOk('Appointment cancelled — slot released, emails queued.');
}

export async function adminRescheduleAppointmentAction(formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (!admin) return actionErr('Forbidden');
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const date = String(formData.get('date') ?? '').trim();
  const time = String(formData.get('time') ?? '').trim();
  const reason = String(formData.get('reason') ?? 'Rescheduled by admin').trim();
  const customEmailBody = String(formData.get('customEmailBody') ?? '').trim() || undefined;
  const customSmsBody = String(formData.get('customSmsBody') ?? '').trim() || undefined;
  const customEmailSubject = String(formData.get('customEmailSubject') ?? '').trim() || undefined;
  if (!date || !time) return actionErr('Date and time required.');
  const newScheduledStart = new Date(`${date}T${time}`).toISOString();
  const r = await rescheduleAppointmentLifecycle(admin, {
    appointmentId,
    newScheduledStart,
    reason,
    customEmailBody,
    customSmsBody,
    customEmailSubject,
  });
  if (!r.ok) return actionErr(r.error ?? 'Reschedule failed');
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  return actionOk('Appointment rescheduled — customer notified.');
}

export async function previewRescheduleAppointmentAction(input: {
  appointmentId: string;
  date: string;
  time: string;
}): Promise<{
  ok?: boolean;
  error?: string;
  guestName?: string;
  email?: string;
  phone?: string;
  emailBody?: string;
  emailSubject?: string;
  smsBody?: string;
  oldStart?: string;
  newStart?: string;
}> {
  const admin = await requireAdmin();
  if (!admin) return { error: 'Forbidden' };
  const appointmentId = input.appointmentId.trim();
  const date = input.date.trim();
  const time = input.time.trim();
  if (!appointmentId || !date || !time) return { error: 'Date and time required.' };
  const newScheduledStart = new Date(`${date}T${time}`).toISOString();
  if (Number.isNaN(new Date(newScheduledStart).getTime())) return { error: 'Invalid date/time' };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (!appt) return { error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  const oldStart = String(row.scheduled_start ?? '');
  const guest = String(row.guest_name ?? 'Customer');
  const email = String(row.guest_email ?? '').trim();
  const phone = String(row.guest_phone ?? '').trim();
  const token = String(row.access_token ?? '');
  const { appBaseUrl, buildRescheduleEmailBody, buildRescheduleSmsBody } = await import('@/lib/outbound-message-builders');
  const base = appBaseUrl();
  const confirmUrl = token
    ? `${base}/book/confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`
    : `${base}/book`;
  const calUrl = `${base}/api/calendar/appointment/${appointmentId}`;

  return {
    ok: true,
    guestName: guest,
    email: email || undefined,
    phone: phone || undefined,
    emailSubject: 'Gloss Boss ATX — Appointment rescheduled',
    emailBody: buildRescheduleEmailBody({ guestName: guest, oldStart, newStart: newScheduledStart, confirmUrl, calUrl }),
    smsBody: buildRescheduleSmsBody({ oldStart, newStart: newScheduledStart, confirmUrl }),
    oldStart,
    newStart: newScheduledStart,
  };
}
