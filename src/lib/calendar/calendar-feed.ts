import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { chicagoTimeShort, dateKeyChicago } from '@/lib/chicago-time';
import { dayKeyInRange } from '@/lib/calendar/calendar-utils';
import { displayMoney } from '@/lib/display-format';
import { loadGoogleCalendarConnection } from '@/lib/google/google-calendar-sync';
import { resolveGoogleCalendarConnectionStatus } from '@/lib/google/google-calendar-status';
import type { CalendarFeedItem, CalendarFeedRole, CalendarFeedResponse } from '@/lib/calendar/calendar-types';
import { workOrderPath } from '@/lib/work-order-links';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function parseSiteCalendarNotes(raw: unknown): Array<{ id: string; dayKey: string; title: string; note: string; createdAt: string }> {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const rows = Array.isArray(value) ? value : Array.isArray((value as { events?: unknown[] })?.events) ? (value as { events: unknown[] }).events : [];
    return rows
      .map((event: Record<string, unknown>) => ({
        id: str(event.id),
        dayKey: str(event.dayKey),
        title: str(event.title),
        note: str(event.note),
        createdAt: str(event.createdAt),
      }))
      .filter((event) => event.id && event.dayKey && event.title);
  } catch {
    return [];
  }
}

function isActiveAppointment(row: Record<string, unknown>) {
  const status = str(row.status).toLowerCase();
  if (status === 'cancelled' || status === 'deleted') return false;
  if (row.archived_at || row.deleted_at) return false;
  const payStatus = str(row.payment_status).toLowerCase();
  if (payStatus === 'refunded' || payStatus === 'voided') return false;
  return true;
}

function appointmentToFeedItem(row: Record<string, unknown>, shell: 'admin' | 'technician'): CalendarFeedItem {
  const id = str(row.id);
  const startAt = str(row.scheduled_start);
  const endAt = str(row.estimated_end) || startAt;
  const guest = str(row.guest_name) || 'Guest';
  const service = str(row.service_slug).replace(/-/g, ' ') || 'Detail';
  return {
    id: `appt-${id}`,
    kind: 'appointment',
    source: 'titan_appointment',
    dayKey: dateKeyChicago(startAt),
    startAt,
    endAt,
    title: guest,
    subtitle: service,
    status: str(row.status),
    price: displayMoney(Number(row.base_price_cents ?? 0)),
    href: workOrderPath(id, { source: 'appointment', shell }),
    blocksBooking: row.schedule_override !== true,
    appointmentId: id,
    timeLabel: chicagoTimeShort(startAt),
  };
}

function fallbackToFeedItem(row: Record<string, unknown>, shell: 'admin' | 'technician'): CalendarFeedItem {
  const id = str(row.id);
  const startAt = str(row.scheduled_start);
  const endAt = str(row.estimated_end) || startAt;
  const payload = row.payload && typeof row.payload === 'object' ? (row.payload as Record<string, unknown>) : {};
  const guest = str(payload.guest_name) || str(row.guest_name) || 'Guest';
  const service = str(row.service_slug).replace(/-/g, ' ') || 'Detail';
  return {
    id: `fb-${id}`,
    kind: 'fallback',
    source: 'titan_appointment',
    dayKey: dateKeyChicago(startAt),
    startAt,
    endAt,
    title: guest,
    subtitle: `${service} (pending)`,
    status: str(row.status),
    href: workOrderPath(id, { source: 'fallback', shell }),
    blocksBooking: row.schedule_override !== true,
    timeLabel: chicagoTimeShort(startAt),
  };
}

function blockToFeedItem(row: Record<string, unknown>): CalendarFeedItem | null {
  const id = str(row.id);
  const startAt = str(row.start_at);
  const endAt = str(row.end_at);
  if (!id || !startAt || !endAt) return null;
  const source = str(row.source) || 'manual';
  const googleEventId = str(row.google_event_id) || null;
  const appointmentId = str(row.appointment_id) || null;
  const blockSource =
    source === 'google_calendar' ? 'google_calendar' : source === 'titan_appointment' ? 'titan_appointment' : 'manual';
  const sourceLabel =
    blockSource === 'google_calendar' ? 'Google' : blockSource === 'titan_appointment' ? 'Titan' : 'Blocked';
  const title = str(row.title) || 'Blocked time';
  return {
    id: `block-${id}`,
    kind: 'block',
    source: blockSource,
    dayKey: dateKeyChicago(startAt),
    startAt,
    endAt,
    title: `${sourceLabel}: ${title}`,
    note: str(row.notes) || undefined,
    blocksBooking: row.blocks_booking !== false,
    googleEventId,
    appointmentId: appointmentId || null,
    timeLabel: `${chicagoTimeShort(startAt)} – ${chicagoTimeShort(endAt)}`,
  };
}

export async function loadCalendarFeed(
  admin: SupabaseClient,
  opts: {
    from: string;
    to: string;
    role: CalendarFeedRole;
    staffUserId?: string;
    includeGoogleStatus?: boolean;
  },
): Promise<CalendarFeedResponse> {
  const { from, to, role, staffUserId, includeGoogleStatus } = opts;
  const shell: 'admin' | 'technician' = role === 'tech' ? 'technician' : 'admin';
  const items: CalendarFeedItem[] = [];
  const seenApptIds = new Set<string>();

  let apptQuery = admin
    .from('appointments')
    .select(
      'id, guest_name, service_slug, scheduled_start, estimated_end, status, base_price_cents, assigned_technician_id, archived_at, deleted_at, schedule_override, payment_status',
    )
    .gte('scheduled_start', from)
    .lte('scheduled_start', to)
    .is('archived_at', null)
    .is('deleted_at', null);

  if (role === 'tech' && staffUserId) {
    apptQuery = apptQuery.eq('assigned_technician_id', staffUserId);
  }

  const [{ data: appts }, { data: fbs }, { data: blocks }, { data: notesRow }] = await Promise.all([
    apptQuery,
    role === 'admin'
      ? admin
          .from('booking_fallbacks')
          .select('id, scheduled_start, estimated_end, service_slug, status, payload, archived_at, deleted_at, schedule_override')
          .gte('scheduled_start', from)
          .lte('scheduled_start', to)
          .is('archived_at', null)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from('booking_availability_blocks')
      .select('id, title, notes, start_at, end_at, blocks_booking, source, google_event_id, appointment_id')
      .gte('end_at', from)
      .lte('start_at', to),
    role === 'admin'
      ? admin.from('site_settings').select('value').eq('key', 'calendar_events').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  for (const row of appts ?? []) {
    const r = row as Record<string, unknown>;
    if (!isActiveAppointment(r)) continue;
    const id = str(r.id);
    if (id && seenApptIds.has(id)) continue;
    if (id) seenApptIds.add(id);
    items.push(appointmentToFeedItem(r, shell));
  }

  for (const row of fbs ?? []) {
    const r = row as Record<string, unknown>;
    if (r.schedule_override === true) continue;
    const st = str(r.status).toLowerCase();
    if (st === 'cancelled' || st === 'deleted') continue;
    items.push(fallbackToFeedItem(r, shell));
  }

  const blockApptIds = new Set<string>();
  for (const row of blocks ?? []) {
    const item = blockToFeedItem(row as Record<string, unknown>);
    if (!item) continue;
    if (item.appointmentId && seenApptIds.has(item.appointmentId)) {
      blockApptIds.add(item.appointmentId);
      continue;
    }
    items.push(item);
  }

  if (role === 'admin') {
    const notes = parseSiteCalendarNotes(notesRow?.value);
    for (const note of notes) {
      if (!dayKeyInRange(note.dayKey, from, to)) continue;
      const dayStart = new Date(`${note.dayKey}T09:00:00-05:00`).toISOString();
      items.push({
        id: `note-${note.id}`,
        kind: 'note',
        source: 'site_note',
        dayKey: note.dayKey,
        startAt: dayStart,
        endAt: dayStart,
        title: note.title,
        note: note.note,
        blocksBooking: false,
        timeLabel: 'All day',
      });
    }
  }

  items.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  let googleSync: CalendarFeedResponse['googleSync'];
  if (includeGoogleStatus && role === 'admin') {
    const connection = await loadGoogleCalendarConnection(admin);
    const { data: connRow } = await admin
      .from('google_calendar_connections')
      .select('last_pull_at, last_push_at, last_sync_at, last_error, token_expires_at, refresh_token, sync_enabled')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const row = connRow as Record<string, unknown> | null;
    const connectionStatus = resolveGoogleCalendarConnectionStatus({
      configured: true,
      hasConnectionRow: Boolean(connection && row?.sync_enabled !== false),
      refreshToken: connection?.refresh_token ?? (row?.refresh_token as string | undefined) ?? null,
      tokenExpiresAt: connection?.token_expires_at ?? (row?.token_expires_at as string | undefined) ?? null,
      lastError: str(row?.last_error) || null,
    });
    const isHealthy = connectionStatus === 'connected' || connectionStatus === 'syncing';
    googleSync = {
      connected: isHealthy,
      connectionStatus,
      accountEmail: connection?.google_account_email ?? null,
      lastPullAt: str(row?.last_pull_at) || null,
      lastPushAt: str(row?.last_push_at) || null,
      lastSyncAt: str(row?.last_sync_at) || null,
      lastError: isHealthy ? null : str(row?.last_error) || null,
    };
  }

  return { ok: true, from, to, items, googleSync };
}
