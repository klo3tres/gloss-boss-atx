import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { sendAgreementLink } from '@/lib/agreements/send';
import { ensureAgreementRequest, getLatestAgreementRequest } from '@/lib/agreements/requests';
import type { AgreementMessageTone } from '@/lib/agreements/messages';
import { buildAgreementMessages } from '@/lib/agreements/messages';
import { agreementUrl } from '@/lib/auth/action-link-registry';

export const runtime = 'nodejs';

type Body = {
  intent?: 'send' | 'schedule' | 'preview' | 'ensure' | 'status';
  appointmentId?: string;
  workOrderId?: string;
  channel?: 'sms' | 'email' | 'both';
  tone?: AgreementMessageTone;
  messageOverride?: string | null;
  emailSubject?: string | null;
  scheduleAt?: string | null;
  actorUserId?: string | null;
};

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const appointmentId = String(body.appointmentId ?? '').trim();
  if (!appointmentId) return NextResponse.json({ ok: false, error: 'appointmentId required.' }, { status: 400 });

  const intent = body.intent ?? 'send';

  if (intent === 'status') {
    const latest = await getLatestAgreementRequest(admin, appointmentId);
    return NextResponse.json({ ok: true, request: latest });
  }

  const { data: appt } = await admin
    .from('appointments')
    .select('id, access_token, guest_name, vehicle_description, scheduled_start, customer_id')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appt) return NextResponse.json({ ok: false, error: 'Appointment not found.' }, { status: 404 });

  const row = appt as Record<string, unknown>;
  const token = String(row.access_token ?? '').trim();
  if (!token) return NextResponse.json({ ok: false, error: 'Missing access token.' }, { status: 400 });

  if (intent === 'ensure' || intent === 'preview') {
    const ensured = await ensureAgreementRequest(admin, {
      appointmentId,
      customerId: String(row.customer_id ?? '') || null,
      workOrderId: String(body.workOrderId ?? '') || null,
      accessToken: token,
      createdBy: body.actorUserId ?? null,
    });
    const url = ensured.url ?? agreementUrl({ appointmentId, token });
    const when = row.scheduled_start
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          dateStyle: 'medium',
          timeStyle: 'short',
        }).format(new Date(String(row.scheduled_start)))
      : 'your upcoming appointment';
    const messages = buildAgreementMessages({
      firstName: String(row.guest_name ?? 'there').split(/\s+/)[0] || 'there',
      vehicle: String(row.vehicle_description ?? 'your vehicle'),
      appointmentWhen: when,
      agreementLink: url,
    });
    return NextResponse.json({ ok: true, url, request: ensured.request, messages });
  }

  const channel = body.channel ?? 'both';
  const result = await sendAgreementLink(admin, {
    appointmentId,
    workOrderId: String(body.workOrderId ?? '') || null,
    channel,
    tone: body.tone ?? 'professional',
    messageOverride: body.messageOverride,
    emailSubject: body.emailSubject,
    actorUserId: body.actorUserId,
    scheduleAt: intent === 'schedule' ? body.scheduleAt ?? null : null,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  const latest = await getLatestAgreementRequest(admin, appointmentId);
  return NextResponse.json({ ...result, request: latest });
}
