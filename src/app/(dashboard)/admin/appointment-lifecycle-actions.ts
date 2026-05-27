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
  if (!date || !time) return actionErr('Date and time required.');
  const newScheduledStart = new Date(`${date}T${time}`).toISOString();
  const r = await rescheduleAppointmentLifecycle(admin, { appointmentId, newScheduledStart, reason });
  if (!r.ok) return actionErr(r.error ?? 'Reschedule failed');
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  return actionOk('Appointment rescheduled — customer notified.');
}
