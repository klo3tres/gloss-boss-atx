import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getAgreementRequestByToken, markAgreementViewed, getLatestAgreementRequest } from '@/lib/agreements/requests';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });

  let body: { appointmentId?: string; token?: string };
  try {
    body = (await request.json()) as { appointmentId?: string; token?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const appointmentId = String(body.appointmentId ?? '').trim();
  const token = String(body.token ?? '').trim();
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: 'appointmentId required.' }, { status: 400 });
  }

  if (token) {
    const agreementRequest = await getAgreementRequestByToken(admin, token);
    if (agreementRequest && agreementRequest.appointmentId !== appointmentId) {
      return NextResponse.json({ ok: false, error: 'Agreement request mismatch.' }, { status: 403 });
    }
    if (agreementRequest && new Date(agreementRequest.tokenExpiresAt).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: 'Agreement link expired.' }, { status: 410 });
    }
  }

  await markAgreementViewed(admin, appointmentId);
  const latest = await getLatestAgreementRequest(admin, appointmentId);
  return NextResponse.json({ ok: true, request: latest });
}

