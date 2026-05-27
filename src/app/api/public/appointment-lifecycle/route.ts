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
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
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
