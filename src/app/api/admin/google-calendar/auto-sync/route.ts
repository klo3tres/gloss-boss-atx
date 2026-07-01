import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { maybeAutoPullGoogleCalendar } from '@/lib/google/google-calendar-auto-pull';

export const dynamic = 'force-dynamic';

/** Background auto-pull — throttled + DB locked. Used on calendar/dispatch/booking load. */
export async function POST() {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const result = await maybeAutoPullGoogleCalendar(admin);

  if (result.skipReason === 'not_connected') {
    return NextResponse.json({ synced: false, connected: false, skipped: true });
  }
  if (result.skipReason === 'not_configured') {
    return NextResponse.json({ synced: false, connected: false, skipped: true, reason: 'not_configured' });
  }
  if (result.skipped) {
    return NextResponse.json({
      synced: false,
      skipped: true,
      reason: result.skipReason,
      lastPullAt: result.lastPullAt ?? null,
    });
  }
  if (result.error) {
    return NextResponse.json({ synced: false, error: result.error, lastPullAt: result.lastPullAt ?? null });
  }

  return NextResponse.json({
    synced: true,
    imported: result.imported ?? 0,
    lastPullAt: result.lastPullAt ?? null,
  });
}
