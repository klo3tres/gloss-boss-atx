import { NextResponse } from 'next/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { pullGoogleCalendarEvents } from '@/lib/google/google-calendar-sync';

export const dynamic = 'force-dynamic';

const SYNC_LOCK_MS = 10 * 60 * 1000;
let lastAutoSyncAt = 0;
let syncInFlight = false;

export async function POST() {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });

  const now = Date.now();
  if (syncInFlight || now - lastAutoSyncAt < SYNC_LOCK_MS) {
    return NextResponse.json({ synced: false, skipped: true });
  }

  const { data: conn } = await admin.from('google_calendar_connections').select('last_pull_at').limit(1).maybeSingle();
  const lastPull = (conn as { last_pull_at?: string } | null)?.last_pull_at;
  if (lastPull && now - new Date(lastPull).getTime() < SYNC_LOCK_MS) {
    return NextResponse.json({ synced: false, skipped: true, lastPullAt: lastPull });
  }

  syncInFlight = true;
  try {
    const result = await pullGoogleCalendarEvents(admin);
    lastAutoSyncAt = Date.now();
    if (!result.ok) {
      const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
      void emitOwnerNotification(admin, {
        eventType: 'calendar_sync_failed',
        title: 'Google Calendar sync failed',
        body: result.error ?? 'Could not pull calendar events.',
        relatedUrl: '/admin/setup-center',
        bypassQuietHours: true,
      });
      return NextResponse.json({ synced: false, error: result.error });
    }
    return NextResponse.json({ synced: true, imported: result.imported ?? 0 });
  } catch (e) {
    return NextResponse.json({ synced: false, error: e instanceof Error ? e.message : 'Sync failed' });
  } finally {
    syncInFlight = false;
  }
}
