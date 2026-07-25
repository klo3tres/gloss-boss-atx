import { NextResponse } from 'next/server';
import { loadBookingConfirmationSummary } from '@/lib/booking-confirmation-summary';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

/** Public canonical booking state. Access requires the appointment token. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const appointmentId =
    url.searchParams.get('appointment_id') ??
    url.searchParams.get('appointmentId') ??
    '';
  const token = url.searchParams.get('token') ?? '';
  if (!appointmentId || !token) {
    return NextResponse.json({ error: 'Missing appointment_id and token' }, { status: 400 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  const { data: appointment } = await admin
    .from('appointments')
    .select('access_token')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appointment || str(appointment.access_token) !== token) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const summary = await loadBookingConfirmationSummary(admin, appointmentId);
  if (!summary) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, ...summary });
}
