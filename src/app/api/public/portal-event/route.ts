import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { verifyAppointmentAccessToken } from '@/lib/appointment-lifecycle';
import { recordCustomerPortalEvent, type PortalEventType } from '@/lib/customer-portal-tracking';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

const allowed = new Set<PortalEventType>([
  'acknowledgement_started',
  'payment_page_opened',
  'account_claim_started',
]);

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    appointmentId?: string;
    token?: string;
    eventType?: PortalEventType;
  } | null;
  const appointmentId = String(body?.appointmentId ?? '').trim();
  const token = String(body?.token ?? '').trim();
  const eventType = body?.eventType;
  if (!appointmentId || !token || !eventType || !allowed.has(eventType)) {
    return NextResponse.json({ error: 'Invalid event' }, { status: 400 });
  }
  if (!(await verifyAppointmentAccessToken(appointmentId, token))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Unavailable' }, { status: 503 });
  const session = await getSessionWithProfile();
  const { data: appointment } = await admin
    .from('appointments')
    .select('customer_id')
    .eq('id', appointmentId)
    .maybeSingle();
  const result = await recordCustomerPortalEvent(admin, {
    appointmentId,
    customerId: appointment?.customer_id ? String(appointment.customer_id) : null,
    token,
    eventType,
    headers: request.headers,
    role: session.profile?.role,
    method: request.method,
    channelSource: 'customer_booking_session',
  });
  return NextResponse.json({ ok: true, counted: result.counted });
}
