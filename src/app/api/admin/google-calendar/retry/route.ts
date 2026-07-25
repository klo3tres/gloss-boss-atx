import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { runGoogleCalendarSync } from '@/lib/google/google-calendar-sync';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  const body = (await request.json().catch(() => ({}))) as { appointmentId?: string };
  const appointmentId = body.appointmentId?.trim() ?? '';
  if (!appointmentId) return NextResponse.json({ ok: false, error: 'Missing appointment' }, { status: 400 });
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service unavailable' }, { status: 503 });
  const result = await runGoogleCalendarSync(admin, appointmentId, 'upsert');
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
