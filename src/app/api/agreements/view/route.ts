import { NextResponse } from 'next/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { markAgreementViewed, getLatestAgreementRequest } from '@/lib/agreements/requests';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable.' }, { status: 503 });

  let body: { appointmentId?: string };
  try {
    body = (await request.json()) as { appointmentId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const appointmentId = String(body.appointmentId ?? '').trim();
  if (!appointmentId) {
    return NextResponse.json({ ok: false, error: 'appointmentId required.' }, { status: 400 });
  }

  await markAgreementViewed(admin, appointmentId);
  const latest = await getLatestAgreementRequest(admin, appointmentId);
  return NextResponse.json({ ok: true, request: latest });
}
