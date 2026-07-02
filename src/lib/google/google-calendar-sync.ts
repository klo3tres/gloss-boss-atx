import type { SupabaseClient } from '@supabase/supabase-js';
import {
  googleCalendarClientId,
  googleCalendarClientSecret,
  googleCalendarOAuthConfigured,
  googleCalendarRedirectUri,
} from '@/lib/google/google-calendar-config';
import {
  mapGoogleTokenError,
  type GoogleCalendarOAuthErrorCode,
} from '@/lib/google/google-calendar-oauth-errors';

type CalendarConnection = {
  id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  calendar_id: string;
  sync_enabled: boolean;
  google_account_email: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function appBase() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');
}

async function refreshAccessToken(connection: CalendarConnection): Promise<{ accessToken: string; expiresAt: string | null } | null> {
  const refreshToken = connection.refresh_token;
  const clientId = googleCalendarClientId();
  const clientSecret = googleCalendarClientSecret();
  if (!refreshToken || !clientId || !clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  const expiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
  return { accessToken: data.access_token, expiresAt };
}

export async function loadGoogleCalendarConnection(admin: SupabaseClient): Promise<CalendarConnection | null> {
  const { data, error } = await admin
    .from('google_calendar_connections')
    .select('id, access_token, refresh_token, token_expires_at, calendar_id, sync_enabled, google_account_email')
    .eq('sync_enabled', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as CalendarConnection;
}

async function ensureFreshToken(admin: SupabaseClient, connection: CalendarConnection): Promise<string | null> {
  const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at).getTime() : 0;
  if (expiresAt > Date.now() + 60_000) return connection.access_token;

  const refreshed = await refreshAccessToken(connection);
  if (!refreshed) return connection.access_token;

  await admin
    .from('google_calendar_connections')
    .update({
      access_token: refreshed.accessToken,
      token_expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return refreshed.accessToken;
}

function formatChicago(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(d);
}

function buildEventPayload(row: Record<string, unknown>) {
  const startIso = str(row.scheduled_start);
  const endIso = str(row.estimated_end) || startIso;
  const guest = str(row.guest_name) || 'Customer';
  const vehicles = str(row.vehicle_description) || 'Mobile detail';
  const addr = [row.service_address, row.service_city, row.service_state, row.service_zip].filter(Boolean).join(', ');
  const status = str(row.status).toLowerCase();
  const cancelled = status === 'cancelled';

  return {
    summary: cancelled ? `[Cancelled] ${guest} — Gloss Boss` : `${guest} — ${vehicles}`,
    description: [
      `Customer: ${guest}`,
      `Phone: ${str(row.guest_phone) || '—'}`,
      `Email: ${str(row.guest_email) || '—'}`,
      `Vehicles: ${vehicles}`,
      `Status: ${status || 'scheduled'}`,
      `Work order: ${appBase()}/admin/work-orders/${str(row.id)}`,
    ].join('\n'),
    location: addr || undefined,
    start: { dateTime: startIso, timeZone: 'America/Chicago' },
    end: { dateTime: endIso, timeZone: 'America/Chicago' },
    status: cancelled ? 'cancelled' : 'confirmed',
  };
}

export async function upsertGoogleCalendarEvent(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!googleCalendarOAuthConfigured()) return { ok: false, error: 'Google Calendar OAuth not configured' };

  const connection = await loadGoogleCalendarConnection(admin);
  if (!connection) return { ok: false, error: 'No Google Calendar connection' };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (!appt) return { ok: false, error: 'Appointment not found' };
  const row = appt as Record<string, unknown>;
  if (str(row.status) === 'cancelled') {
    return deleteGoogleCalendarEvent(admin, appointmentId);
  }

  const accessToken = await ensureFreshToken(admin, connection);
  if (!accessToken) return { ok: false, error: 'Could not refresh Google token' };

  const payload = buildEventPayload(row);
  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');

  const { data: existing } = await admin
    .from('google_calendar_event_map')
    .select('google_event_id, google_calendar_id')
    .eq('appointment_id', appointmentId)
    .maybeSingle();

  const existingId = str((existing as { google_event_id?: string } | null)?.google_event_id);

  if (existingId) {
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(existingId)}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return { ok: false, error: `Google update failed (${res.status}): ${err.slice(0, 200)}` };
    }
    const updated = (await res.json()) as { id?: string; etag?: string };
    await admin
      .from('google_calendar_event_map')
      .update({
        etag: updated.etag ?? null,
        last_pushed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('appointment_id', appointmentId);
    return { ok: true };
  }

  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    return { ok: false, error: `Google create failed (${res.status}): ${err.slice(0, 200)}` };
  }
  const created = (await res.json()) as { id?: string; etag?: string };
  if (!created.id) return { ok: false, error: 'Google did not return event id' };

  await admin.from('google_calendar_event_map').upsert(
    {
      appointment_id: appointmentId,
      google_event_id: created.id,
      google_calendar_id: connection.calendar_id || 'primary',
      etag: created.etag ?? null,
      last_pushed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'appointment_id' },
  );

  await admin
    .from('google_calendar_connections')
    .update({
      last_push_at: new Date().toISOString(),
      last_sync_at: new Date().toISOString(),
      push_count: (connection as { push_count?: number }).push_count
        ? Number((connection as { push_count?: number }).push_count) + 1
        : 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return { ok: true };
}

export async function deleteGoogleCalendarEvent(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!googleCalendarOAuthConfigured()) return { ok: false, error: 'Google Calendar OAuth not configured' };

  const connection = await loadGoogleCalendarConnection(admin);
  if (!connection) return { ok: true };

  const { data: existing } = await admin
    .from('google_calendar_event_map')
    .select('google_event_id')
    .eq('appointment_id', appointmentId)
    .maybeSingle();
  const eventId = str((existing as { google_event_id?: string } | null)?.google_event_id);
  if (!eventId) return { ok: true };

  const accessToken = await ensureFreshToken(admin, connection);
  if (!accessToken) return { ok: false, error: 'Could not refresh Google token' };

  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const err = await res.text().catch(() => '');
    return { ok: false, error: `Google delete failed (${res.status}): ${err.slice(0, 200)}` };
  }

  await admin.from('google_calendar_event_map').delete().eq('appointment_id', appointmentId);
  return { ok: true };
}

/** Fire-and-forget sync — never blocks booking flow. */
export function queueGoogleCalendarSync(admin: SupabaseClient, appointmentId: string, action: 'upsert' | 'delete' = 'upsert') {
  void (async () => {
    try {
      const result = await runGoogleCalendarSync(admin, appointmentId, action);
      if (!result.ok) console.warn('[google-calendar]', action, appointmentId, result.error);
    } catch (e) {
      console.warn('[google-calendar]', action, appointmentId, e);
    }
  })();
}

/** Awaitable push/delete for admin job lifecycle (shows toast on result). */
export async function runGoogleCalendarSync(
  admin: SupabaseClient,
  appointmentId: string,
  action: 'upsert' | 'delete' = 'upsert',
): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  if (!googleCalendarOAuthConfigured()) {
    return { ok: false, skipped: true, error: 'Google Calendar not configured' };
  }
  const connection = await loadGoogleCalendarConnection(admin);
  if (!connection) {
    return { ok: false, skipped: true, error: 'Google Calendar not connected' };
  }
  const fn = action === 'delete' ? deleteGoogleCalendarEvent : upsertGoogleCalendarEvent;
  const result = await fn(admin, appointmentId);
  if (admin) {
    const { data: appt } = await admin
      .from('appointments')
      .select('guest_name, service_slug, vehicle_description, scheduled_start, estimated_end')
      .eq('id', appointmentId)
      .maybeSingle();
    const row = (appt ?? {}) as Record<string, unknown>;
    const guest = str(row.guest_name) || 'Customer';
    const service =
      str(row.service_slug).replace(/-/g, ' ') || str(row.vehicle_description).split(',')[0] || 'Detail';
    const startIso = str(row.scheduled_start);
    const endIso = str(row.estimated_end);
    const whenShort = startIso
      ? new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago',
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        }).format(new Date(startIso))
      : '';
    const timeRange =
      startIso && endIso
        ? `${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(startIso))}–${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(endIso))}`
        : whenShort;
    const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
    void emitOwnerNotification(admin, {
      eventType: result.ok ? 'new_booking' : 'calendar_sync_failed',
      title: result.ok
        ? action === 'delete'
          ? `Google Calendar removed: ${guest} — ${service}`
          : `Google Calendar updated: ${guest} — ${service}`
        : 'Google Calendar sync failed',
      body: result.ok
        ? action === 'delete'
          ? `Gloss Boss ATX: Google Calendar event removed for ${guest} — ${service}${whenShort ? `, ${whenShort}` : ''}.`
          : `Gloss Boss ATX: Google Calendar synced for ${guest} — ${service}${timeRange ? `, ${timeRange}` : whenShort ? `, ${whenShort}` : ''}.`
        : `Gloss Boss ATX: Google Calendar sync failed for ${guest} — ${result.error ?? 'unknown error'}.`,
      source: 'google_calendar',
      relatedType: 'appointment',
      relatedId: appointmentId,
      relatedUrl: `/admin/work-orders/${appointmentId}?shell=admin`,
      bypassQuietHours: !result.ok,
    });
  }
  return result;
}

export function buildGoogleOAuthUrl(state: string): string | null {
  const clientId = googleCalendarClientId();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCalendarRedirectUri(),
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleOAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  email: string | null;
};

export type GoogleOAuthExchangeResult =
  | { ok: true; tokens: GoogleOAuthTokens }
  | { ok: false; code: GoogleCalendarOAuthErrorCode; detail?: string };

async function safeJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function exchangeGoogleOAuthCode(code: string): Promise<GoogleOAuthExchangeResult> {
  const clientId = googleCalendarClientId();
  const clientSecret = googleCalendarClientSecret();
  if (!clientId) return { ok: false, code: 'missing_client_id' };
  if (!clientSecret) return { ok: false, code: 'missing_client_secret' };

  let res: Response;
  try {
    res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: googleCalendarRedirectUri(),
        grant_type: 'authorization_code',
      }),
    });
  } catch (e) {
    return { ok: false, code: 'token_exchange_failed', detail: e instanceof Error ? e.message : String(e) };
  }

  const data = await safeJson<{
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  }>(res);

  if (!res.ok || !data?.access_token) {
    const raw = data?.error_description ?? data?.error ?? `HTTP ${res.status}`;
    return { ok: false, code: mapGoogleTokenError(raw), detail: raw };
  }

  let email: string | null = null;
  try {
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (profileRes.ok) {
      const profile = await safeJson<{ email?: string }>(profileRes);
      email = profile?.email?.trim() || null;
    }
  } catch {
    /* email is optional */
  }

  return {
    ok: true,
    tokens: {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
      email,
    },
  };
}

export function formatAppointmentWhenChicago(iso: string) {
  return formatChicago(iso);
}

export async function pullGoogleCalendarEvents(
  admin: SupabaseClient,
  opts?: { daysAhead?: number },
): Promise<{ ok: boolean; imported?: number; error?: string }> {
  if (!googleCalendarOAuthConfigured()) return { ok: false, error: 'Google Calendar OAuth not configured' };

  const connection = await loadGoogleCalendarConnection(admin);
  if (!connection) return { ok: false, error: 'No Google Calendar connection' };

  const accessToken = await ensureFreshToken(admin, connection);
  if (!accessToken) return { ok: false, error: 'Could not refresh Google token' };

  const now = new Date();
  const end = new Date(now.getTime() + (opts?.daysAhead ?? 30) * 24 * 60 * 60 * 1000);
  const calendarId = encodeURIComponent(connection.calendar_id || 'primary');
  const params = new URLSearchParams({
    timeMin: now.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    await admin.from('google_calendar_connections').update({ last_error: err.slice(0, 500), updated_at: new Date().toISOString() }).eq('id', connection.id);
    return { ok: false, error: `Google list failed (${res.status})` };
  }

  const payload = (await res.json()) as {
    items?: Array<{
      id?: string;
      summary?: string;
      description?: string;
      location?: string;
      status?: string;
      etag?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  const { data: mapped } = await admin.from('google_calendar_event_map').select('google_event_id');
  const titanEventIds = new Set((mapped ?? []).map((m) => str((m as { google_event_id?: string }).google_event_id)));

  let imported = 0;
  for (const ev of payload.items ?? []) {
    const googleEventId = str(ev.id);
    if (!googleEventId || titanEventIds.has(googleEventId)) continue;
    const startIso = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T12:00:00-06:00` : '');
    const endIso = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T13:00:00-06:00` : startIso);
    if (!startIso) continue;

    await admin.from('google_calendar_external_events').upsert(
      {
        google_event_id: googleEventId,
        google_calendar_id: connection.calendar_id || 'primary',
        summary: str(ev.summary) || 'Google event',
        description: str(ev.description) || null,
        location: str(ev.location) || null,
        start_at: startIso,
        end_at: endIso,
        blocks_booking: true,
        etag: str(ev.etag) || null,
        status: str(ev.status) || 'confirmed',
        last_pulled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'google_event_id,google_calendar_id' },
    );

    const { data: existingBlock } = await admin
      .from('booking_availability_blocks')
      .select('id')
      .eq('google_event_id', googleEventId)
      .maybeSingle();

    const blockPayload = {
      title: str(ev.summary) || 'Google Calendar block',
      start_at: startIso,
      end_at: endIso,
      blocks_booking: true,
      source: 'google_calendar',
      google_event_id: googleEventId,
      updated_at: new Date().toISOString(),
    };

    if (existingBlock?.id) {
      await admin.from('booking_availability_blocks').update(blockPayload).eq('id', existingBlock.id);
    } else {
      await admin.from('booking_availability_blocks').insert(blockPayload);
    }

    imported += 1;
  }

  await admin
    .from('google_calendar_connections')
    .update({
      last_pull_at: new Date().toISOString(),
      pull_count: (connection as { pull_count?: number }).pull_count ? Number((connection as { pull_count?: number }).pull_count) + 1 : 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return { ok: true, imported };
}
