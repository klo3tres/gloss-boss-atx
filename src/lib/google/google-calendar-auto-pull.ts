import type { SupabaseClient } from '@supabase/supabase-js';
import { googleCalendarOAuthConfigured } from '@/lib/google/google-calendar-config';
import { humanizeGoogleSyncError } from '@/lib/google/google-calendar-status';
import { loadGoogleCalendarConnection, pullGoogleCalendarEvents } from '@/lib/google/google-calendar-sync';

/** Minimum time between automatic pulls (2–5 min window — use 3 min). */
export const GOOGLE_PULL_THROTTLE_MS = 3 * 60 * 1000;

/** Stale lock — another process may have crashed mid-pull. */
const STALE_LOCK_MS = 5 * 60 * 1000;

export type GoogleAutoPullResult = {
  ran: boolean;
  skipped?: boolean;
  skipReason?: 'throttle' | 'lock' | 'not_connected' | 'not_configured';
  imported?: number;
  error?: string;
  lastPullAt?: string | null;
};

type ConnectionRow = {
  id: string;
  last_pull_at: string | null;
  pull_in_progress_at: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function loadConnectionRow(admin: SupabaseClient): Promise<ConnectionRow | null> {
  const { data } = await admin
    .from('google_calendar_connections')
    .select('id, last_pull_at, pull_in_progress_at')
    .eq('sync_enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data as ConnectionRow;
}

async function tryAcquirePullLock(admin: SupabaseClient, connectionId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_LOCK_MS).toISOString();

  const { data: freshLock } = await admin
    .from('google_calendar_connections')
    .update({ pull_in_progress_at: now, updated_at: now })
    .eq('id', connectionId)
    .is('pull_in_progress_at', null)
    .select('id')
    .maybeSingle();
  if (freshLock?.id) return true;

  const { data: staleLock } = await admin
    .from('google_calendar_connections')
    .update({ pull_in_progress_at: now, updated_at: now })
    .eq('id', connectionId)
    .lt('pull_in_progress_at', staleBefore)
    .select('id')
    .maybeSingle();
  return Boolean(staleLock?.id);
}

async function releasePullLock(admin: SupabaseClient, connectionId: string) {
  await admin
    .from('google_calendar_connections')
    .update({ pull_in_progress_at: null, updated_at: new Date().toISOString() })
    .eq('id', connectionId);
}

function isPullInProgress(row: ConnectionRow): boolean {
  if (!row.pull_in_progress_at) return false;
  const started = new Date(row.pull_in_progress_at).getTime();
  if (Number.isNaN(started)) return false;
  return Date.now() - started < STALE_LOCK_MS;
}

function isThrottled(lastPullAt: string | null): boolean {
  if (!lastPullAt) return false;
  const t = new Date(lastPullAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < GOOGLE_PULL_THROTTLE_MS;
}

/**
 * Pull Google Calendar events when connected, throttled, and not already locked.
 * Uses a DB row lock on `google_calendar_connections.pull_in_progress_at`.
 */
export async function maybeAutoPullGoogleCalendar(
  admin: SupabaseClient,
  opts?: { force?: boolean; daysAhead?: number },
): Promise<GoogleAutoPullResult> {
  if (!googleCalendarOAuthConfigured()) {
    return { ran: false, skipped: true, skipReason: 'not_configured' };
  }

  const connection = await loadGoogleCalendarConnection(admin);
  if (!connection) {
    return { ran: false, skipped: true, skipReason: 'not_connected' };
  }

  const row = await loadConnectionRow(admin);
  if (!row) {
    return { ran: false, skipped: true, skipReason: 'not_connected' };
  }

  const lastPullAt = str(row.last_pull_at) || null;

  if (!opts?.force) {
    if (isPullInProgress(row)) {
      return { ran: false, skipped: true, skipReason: 'lock', lastPullAt };
    }
    if (isThrottled(lastPullAt)) {
      return { ran: false, skipped: true, skipReason: 'throttle', lastPullAt };
    }
  }

  const locked = await tryAcquirePullLock(admin, row.id);
  if (!locked) {
    return { ran: false, skipped: true, skipReason: 'lock', lastPullAt };
  }

  try {
    const result = await pullGoogleCalendarEvents(admin, { daysAhead: opts?.daysAhead ?? 45 });
    if (!result.ok) {
      return {
        ran: true,
        error: humanizeGoogleSyncError(result.error),
        lastPullAt,
      };
    }
    return {
      ran: true,
      imported: result.imported ?? 0,
      lastPullAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      ran: true,
      error: humanizeGoogleSyncError(e instanceof Error ? e.message : 'Google sync failed'),
      lastPullAt,
    };
  } finally {
    await releasePullLock(admin, row.id);
  }
}
