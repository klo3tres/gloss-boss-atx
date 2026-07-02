import { NextResponse } from 'next/server';
import { requireStaffApiUser } from '@/lib/admin/api-guard';
import { loadCalendarFeed } from '@/lib/calendar/calendar-feed';
import { isAdminLevel } from '@/lib/auth/roles';
import { maybeAutoPullGoogleCalendar } from '@/lib/google/google-calendar-auto-pull';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const gate = await requireStaffApiUser();
  if (!gate.ok) {
    return NextResponse.json({ ok: false, error: gate.error }, { status: gate.status });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return NextResponse.json({ ok: false, error: 'Service role unavailable' }, { status: 503 });
  }

  const url = new URL(req.url);
  const from = url.searchParams.get('from')?.trim();
  const to = url.searchParams.get('to')?.trim();
  if (!from || !to) {
    return NextResponse.json({ ok: false, error: 'from and to query params required' }, { status: 400 });
  }

  const roleParam = url.searchParams.get('role')?.trim();
  const role =
    roleParam === 'tech' || (!isAdminLevel(gate.role) && gate.role === 'technician') ? 'tech' : 'admin';

  let googleAutoPull;
  if (role === 'admin') {
    googleAutoPull = await maybeAutoPullGoogleCalendar(admin, { emitActivity: 'failures_only' });
  }

  const feed = await loadCalendarFeed(admin, {
    from,
    to,
    role,
    staffUserId: role === 'tech' ? gate.userId : undefined,
    includeGoogleStatus: role === 'admin',
  });

  return NextResponse.json({ ...feed, googleAutoPull });
}
