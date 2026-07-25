import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  cancelAppointmentLifecycle,
  rescheduleAppointmentLifecycle,
  verifyAppointmentAccessToken,
} from '@/lib/appointment-lifecycle';

export const runtime = 'nodejs';

/** Customer self-service cancel/reschedule with booking access token. */
export async function POST(req: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  let body: {
    action?: string;
    appointmentId?: string;
    token?: string;
    newScheduledStart?: string;
    reason?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const appointmentId = String(body.appointmentId ?? '').trim();
  const token = String(body.token ?? '').trim();
  const action = String(body.action ?? '').trim();

  if (!appointmentId || !token) {
    return NextResponse.json({ error: 'Missing appointmentId and token' }, { status: 400 });
  }
  if (!(await verifyAppointmentAccessToken(appointmentId, token))) {
    return NextResponse.json({ error: 'This secure appointment link could not be verified.' }, { status: 403 });
  }
  const { data: appointment } = await admin
    .from('appointments')
    .select('status, scheduled_start, job_started_at, job_completed_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appointment) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
  const status = String(appointment.status ?? '').toLowerCase();
  const scheduledTime = new Date(String(appointment.scheduled_start ?? '')).getTime();
  const canModify =
    !['cancelled', 'voided', 'deleted', 'in_progress', 'completed'].includes(status) &&
    !appointment.job_started_at &&
    !appointment.job_completed_at &&
    (Number.isNaN(scheduledTime) || scheduledTime > Date.now());
  if (!canModify) {
    return NextResponse.json(
      { error: 'Online changes are closed for this appointment. Send Gloss Boss a message for help.' },
      { status: 409 },
    );
  }

  if (action === 'cancel') {
    const r = await cancelAppointmentLifecycle(admin, {
      appointmentId,
      reason: String(body.reason ?? 'Cancelled by customer'),
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, message: 'Appointment cancelled.' });
  }

  if (action === 'reschedule') {
    const newScheduledStart = String(body.newScheduledStart ?? '').trim();
    const r = await rescheduleAppointmentLifecycle(admin, {
      appointmentId,
      newScheduledStart,
      reason: String(body.reason ?? 'Rescheduled by customer'),
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json({ ok: true, message: 'Appointment rescheduled.' });
  }

  return NextResponse.json({ error: 'action must be cancel or reschedule' }, { status: 400 });
}
