import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/admin/api-guard';
import { googleCalendarOAuthConfigured } from '@/lib/google/google-calendar-config';
import { loadGoogleCalendarConnection } from '@/lib/google/google-calendar-sync';
import {
  googleCalendarStatusLabel,
  humanizeGoogleSyncError,
  resolveGoogleCalendarConnectionStatus,
} from '@/lib/google/google-calendar-status';
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
  const { data: connRow } = await admin
    .from('google_calendar_connections')
    .select('last_pull_at, last_push_at, last_sync_at, last_error, token_expires_at, calendar_id, refresh_token, sync_enabled')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = connRow as {
    last_pull_at?: string;
    last_push_at?: string;
    last_sync_at?: string;
    last_error?: string;
    token_expires_at?: string;
    calendar_id?: string;
    refresh_token?: string;
    sync_enabled?: boolean;
  } | null;

  const configured = googleCalendarOAuthConfigured();
  const hasConnectionRow = Boolean(connection && row?.sync_enabled !== false);
  const connectionStatus = resolveGoogleCalendarConnectionStatus({
    configured,
    hasConnectionRow,
    refreshToken: connection?.refresh_token ?? row?.refresh_token ?? null,
    tokenExpiresAt: connection?.token_expires_at ?? row?.token_expires_at ?? null,
    lastError: row?.last_error ?? null,
  });

  const isHealthy = connectionStatus === 'connected' || connectionStatus === 'syncing';

  return NextResponse.json({
    ok: true,
    configured,
    connected: isHealthy,
    connectionStatus,
    connectionStatusLabel: googleCalendarStatusLabel(connectionStatus),
    statusMessage:
      connectionStatus === 'needs_reconnect' || connectionStatus === 'error'
        ? humanizeGoogleSyncError(row?.last_error)
        : null,
    email: connection?.google_account_email ?? null,
    calendarId: connection?.calendar_id ?? row?.calendar_id ?? null,
    tokenExpiresAt: connection?.token_expires_at ?? row?.token_expires_at ?? null,
    refreshTokenPresent: Boolean(connection?.refresh_token ?? row?.refresh_token),
    lastPullAt: row?.last_pull_at ?? null,
    lastPushAt: row?.last_push_at ?? null,
    lastSyncAt: row?.last_sync_at ?? null,
    lastError: connectionStatus === 'connected' ? null : row?.last_error ?? null,
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
