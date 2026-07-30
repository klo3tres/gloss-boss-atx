import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  cancelAppointmentLifecycle,
  rescheduleAppointmentLifecycle,
} from '@/lib/appointment-lifecycle';
import { bookingInstantFitsInChicagoWindow, isBookingInstantAllowedInChicago } from '@/lib/booking-availability';
import { fetchBookedBlocks, slotConflictsWithBlocks } from '@/lib/booking-slot-blocking';
import { loadBookingAvailabilityRules } from '@/lib/booking-server-shared';
import { parseChicagoLocalToIso } from '@/lib/chicago-time';

export const runtime = 'nodejs';

function secureTokenMatches(expected: unknown, supplied: string) {
  const expectedBuffer = Buffer.from(String(expected ?? '').trim());
  const suppliedBuffer = Buffer.from(supplied);
  return (
    expectedBuffer.length > 0 &&
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

function appointmentCanBeModified(appointment: Record<string, unknown>) {
  const status = String(appointment.status ?? '').toLowerCase();
  const scheduledTime = new Date(String(appointment.scheduled_start ?? '')).getTime();
  return (
    !['cancelled', 'canceled', 'voided', 'deleted', 'archived', 'in_progress', 'completed', 'no_show'].includes(status) &&
    !appointment.archived_at &&
    !appointment.deleted_at &&
    !appointment.job_started_at &&
    !appointment.job_completed_at &&
    !Number.isNaN(scheduledTime) &&
    scheduledTime > Date.now()
  );
}

export async function GET(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  const url = new URL(request.url);
  const appointmentId = url.searchParams.get('appointmentId')?.trim() ?? '';
  const token = url.searchParams.get('token')?.trim() ?? '';
  const date = url.searchParams.get('date')?.trim() ?? '';
  if (!appointmentId || !token || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Appointment, secure token, and date are required.' }, { status: 400 });
  }
  const { data: appointment, error } = await admin
    .from('appointments')
    .select('access_token, status, scheduled_start, estimated_end, estimated_duration_minutes, job_started_at, job_completed_at, archived_at, deleted_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Availability is temporarily unavailable. Retry.' }, { status: 503 });
  if (!appointment) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
  if (!secureTokenMatches(appointment.access_token, token)) {
    return NextResponse.json({ error: 'This secure appointment link could not be verified.' }, { status: 403 });
  }
  if (!appointmentCanBeModified(appointment as Record<string, unknown>)) {
    return NextResponse.json({ error: 'Online changes are closed for this appointment.' }, { status: 409 });
  }
  const oldStartMs = new Date(String(appointment.scheduled_start ?? '')).getTime();
  const oldEndMs = new Date(String(appointment.estimated_end ?? '')).getTime();
  const storedDuration = Number(appointment.estimated_duration_minutes ?? 0);
  const durationMinutes =
    Number.isFinite(storedDuration) && storedDuration > 0
      ? Math.max(15, Math.round(storedDuration))
      : !Number.isNaN(oldEndMs) && oldEndMs > oldStartMs
        ? Math.max(15, Math.ceil((oldEndMs - oldStartMs) / 60_000))
        : 180;
  const rules = await loadBookingAvailabilityRules(admin);
  const rangeAnchor = parseChicagoLocalToIso(date, '12:00');
  if (!rangeAnchor) return NextResponse.json({ error: 'Choose a valid date.' }, { status: 400 });
  const anchorMs = new Date(rangeAnchor).getTime();
  const blocks = await fetchBookedBlocks(
    admin,
    new Date(anchorMs - 36 * 60 * 60 * 1000).toISOString(),
    new Date(anchorMs + 36 * 60 * 60 * 1000).toISOString(),
  );
  const interval = Math.max(5, Math.min(120, Math.round(rules.slotIntervalMinutes ?? 15)));
  const slots: Array<{ time: string; iso: string; label: string }> = [];
  for (let minute = 0; minute < 24 * 60; minute += interval) {
    const time = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
    const iso = parseChicagoLocalToIso(date, time);
    if (!iso) continue;
    const instant = new Date(iso);
    if (
      !bookingInstantFitsInChicagoWindow(instant, durationMinutes, rules) ||
      slotConflictsWithBlocks(iso, durationMinutes, blocks, appointmentId)
    ) {
      continue;
    }
    slots.push({
      time,
      iso,
      label: new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago',
        hour: 'numeric',
        minute: '2-digit',
      }).format(instant),
    });
  }
  return NextResponse.json({ ok: true, date, durationMinutes, slots });
}

/** Customer self-service cancel/reschedule with booking access token. */
export async function POST(req: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });

  let body: {
    action?: string;
    appointmentId?: string;
    token?: string;
    newScheduledStart?: string;
    newDate?: string;
    newTime?: string;
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
  const { data: appointment, error: appointmentError } = await admin
    .from('appointments')
    .select('access_token, status, scheduled_start, estimated_end, estimated_duration_minutes, job_started_at, job_completed_at, archived_at, deleted_at')
    .eq('id', appointmentId)
    .maybeSingle();
  if (appointmentError) {
    return NextResponse.json({ error: 'Appointment details are temporarily unavailable. Please retry.' }, { status: 503 });
  }
  if (!appointment) return NextResponse.json({ error: 'Appointment not found.' }, { status: 404 });
  if (!secureTokenMatches(appointment.access_token, token)) {
    return NextResponse.json({ error: 'This secure appointment link could not be verified.' }, { status: 403 });
  }
  const scheduledTime = new Date(String(appointment.scheduled_start ?? '')).getTime();
  const canModify = appointmentCanBeModified(appointment as Record<string, unknown>);
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
    const localDate = String(body.newDate ?? '').trim();
    const localTime = String(body.newTime ?? '').trim();
    const requestedIso = localDate && localTime
      ? parseChicagoLocalToIso(localDate, localTime)
      : String(body.newScheduledStart ?? '').trim();
    const requestedDate = requestedIso ? new Date(requestedIso) : null;
    if (!requestedDate || Number.isNaN(requestedDate.getTime())) {
      return NextResponse.json(
        { error: 'Choose a valid new date and time.', code: 'INVALID_RESCHEDULE_TIME' },
        { status: 400 },
      );
    }
    if (requestedDate.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Choose a future appointment time.', code: 'RESCHEDULE_TIME_PASSED' },
        { status: 409 },
      );
    }
    if (Math.abs(requestedDate.getTime() - scheduledTime) < 60_000) {
      return NextResponse.json({
        ok: true,
        message: 'Appointment is already scheduled for that time.',
        scheduledStart: new Date(scheduledTime).toISOString(),
        alreadyRescheduled: true,
      });
    }

    const rules = await loadBookingAvailabilityRules(admin);
    if (!isBookingInstantAllowedInChicago(requestedDate, rules)) {
      return NextResponse.json(
        { error: 'That time is outside online booking hours. Choose another time.', code: 'OUTSIDE_BOOKING_HOURS' },
        { status: 409 },
      );
    }

    const estimatedEndTime = new Date(String(appointment.estimated_end ?? '')).getTime();
    const storedDuration = Number(appointment.estimated_duration_minutes ?? 0);
    const durationMinutes =
      Number.isFinite(storedDuration) && storedDuration > 0
        ? Math.max(15, Math.round(storedDuration))
        : !Number.isNaN(estimatedEndTime) && estimatedEndTime > scheduledTime
          ? Math.max(15, Math.ceil((estimatedEndTime - scheduledTime) / 60_000))
          : 180;
    if (!bookingInstantFitsInChicagoWindow(requestedDate, durationMinutes, rules)) {
      return NextResponse.json(
        { error: 'That start time does not leave enough room to finish the service during booking hours.', code: 'SERVICE_OUTSIDE_BOOKING_HOURS' },
        { status: 409 },
      );
    }
    const rangeStart = new Date(requestedDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const rangeEnd = new Date(requestedDate.getTime() + (durationMinutes + 24 * 60) * 60_000).toISOString();
    const blocks = await fetchBookedBlocks(admin, rangeStart, rangeEnd);
    if (slotConflictsWithBlocks(requestedDate.toISOString(), durationMinutes, blocks, appointmentId)) {
      return NextResponse.json(
        { error: 'That time was just taken. Choose another available time and retry.', code: 'SLOT_CONFLICT' },
        { status: 409 },
      );
    }

    const newScheduledStart = requestedDate.toISOString();
    const r = await rescheduleAppointmentLifecycle(admin, {
      appointmentId,
      newScheduledStart,
      reason: String(body.reason ?? 'Rescheduled by customer'),
    });
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error ?? 'Appointment could not be rescheduled.', code: 'RESCHEDULE_FAILED' },
        { status: 409 },
      );
    }
    const warnings = Array.isArray(r.warnings) ? r.warnings.filter(Boolean) : [];
    const { data: updated, error: updatedError } = await admin
      .from('appointments')
      .select('scheduled_start')
      .eq('id', appointmentId)
      .maybeSingle();
    if (updatedError || !updated?.scheduled_start) {
      return NextResponse.json(
        {
          ok: true,
          message: 'Appointment rescheduled. Refresh to verify the updated time while connected systems finish syncing.',
          scheduledStart: newScheduledStart,
          visibilityWarning: true,
          warnings,
        },
      );
    }
    return NextResponse.json({
      ok: true,
      message:
        warnings.length > 0
          ? 'Appointment rescheduled. One or more connected updates are still retrying.'
          : 'Appointment rescheduled.',
      scheduledStart: String(updated.scheduled_start),
      warnings,
    });
  }

  return NextResponse.json({ error: 'action must be cancel or reschedule' }, { status: 400 });
}
