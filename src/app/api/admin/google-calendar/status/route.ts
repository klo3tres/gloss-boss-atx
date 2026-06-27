import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { googleCalendarOAuthConfigured } from '@/lib/google/google-calendar-config';
import { loadGoogleCalendarConnection } from '@/lib/google/google-calendar-sync';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function GET() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  const connection = await loadGoogleCalendarConnection(admin);
  return NextResponse.json({
    ok: true,
    configured: googleCalendarOAuthConfigured(),
    connected: Boolean(connection),
    email: connection?.google_account_email ?? null,
    calendarId: connection?.calendar_id ?? null,
    lastSyncAt: connection ? null : null,
  });
}

export async function DELETE() {
  const gate = await requireAdminApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  await admin.from('google_calendar_event_map').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('google_calendar_connections').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  return NextResponse.json({ ok: true });
}
