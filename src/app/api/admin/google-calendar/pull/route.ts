import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { maybeAutoPullGoogleCalendar } from '@/lib/google/google-calendar-auto-pull';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

/** Manual / debug pull — bypasses throttle but still respects DB lock unless forced via query. */
export async function POST(req: Request) {
  const gate = await requireAdminApiUser();
  if (!gate.ok) return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });

  const result = await maybeAutoPullGoogleCalendar(admin, { force: true, daysAhead: 45 });
  if (result.skipReason === 'not_connected') {
    return NextResponse.json({ ok: false, error: 'Google Calendar not connected' }, { status: 400 });
  }
  if (result.skipReason === 'not_configured') {
    return NextResponse.json({ ok: false, error: 'Google Calendar OAuth not configured' }, { status: 503 });
  }
  if (result.skipReason === 'lock') {
    return NextResponse.json({ ok: false, error: 'Another Google sync is already running' }, { status: 409 });
  }
  if (result.error) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  revalidatePath('/admin/calendar');
  revalidatePath('/admin/setup-center');
  return NextResponse.json({
    ok: true,
    imported: result.imported ?? 0,
    lastPullAt: result.lastPullAt ?? null,
  });
}
