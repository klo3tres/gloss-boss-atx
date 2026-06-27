import type { SupabaseClient } from '@supabase/supabase-js';
import {
  googleCalendarClientId,
  googleCalendarClientSecret,
  googleCalendarOAuthConfigured,
  googleCalendarRedirectUri,
} from '@/lib/google/google-calendar-config';

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
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
      const fn = action === 'delete' ? deleteGoogleCalendarEvent : upsertGoogleCalendarEvent;
      const result = await fn(admin, appointmentId);
      if (!result.ok) console.warn('[google-calendar]', action, appointmentId, result.error);
    } catch (e) {
      console.warn('[google-calendar]', action, appointmentId, e);
    }
  })();
}

export function buildGoogleOAuthUrl(state: string): string | null {
  const clientId = googleCalendarClientId();
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleCalendarRedirectUri(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/calendar.events',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeGoogleOAuthCode(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  email: string | null;
} | null> {
  const clientId = googleCalendarClientId();
  const clientSecret = googleCalendarClientSecret();
  if (!clientId || !clientSecret) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
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
  if (!res.ok) return null;
  const data = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) return null;

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  const profile = profileRes.ok ? ((await profileRes.json()) as { email?: string }) : null;

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null,
    email: profile?.email ?? null,
  };
}

export function formatAppointmentWhenChicago(iso: string) {
  return formatChicago(iso);
}
