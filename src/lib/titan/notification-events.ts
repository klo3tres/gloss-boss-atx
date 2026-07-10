import type { SupabaseClient } from '@supabase/supabase-js';

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type TitanNotificationEvent = {
  id: string;
  workspaceKey: string;
  title: string;
  body: string;
  source: string | null;
  priority: NotificationPriority;
  relatedType: string | null;
  relatedId: string | null;
  relatedUrl: string | null;
  readAt: string | null;
  archivedAt: string | null;
  emailStatus: string | null;
  smsStatus: string | null;
  pushoverStatus: string | null;
  providerPayload: Record<string, unknown>;
  createdAt: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function mapTitanNotificationRow(row: Record<string, unknown>): TitanNotificationEvent {
  const payload = row.provider_payload;
  return {
    id: str(row.id),
    workspaceKey: str(row.workspace_key) || 'default',
    title: str(row.title),
    body: str(row.body),
    source: str(row.source) || null,
    priority: (str(row.priority) || 'normal') as NotificationPriority,
    relatedType: str(row.related_type) || null,
    relatedId: str(row.related_id) || null,
    relatedUrl: str(row.related_url) || null,
    readAt: str(row.read_at) || null,
    archivedAt: str(row.archived_at) || null,
    emailStatus: str(row.email_status) || null,
    smsStatus: str(row.sms_status) || null,
    pushoverStatus: str(row.pushover_status) || null,
    providerPayload:
      payload && typeof payload === 'object' && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
    createdAt: str(row.created_at),
  };
}

export function isNotificationTableReady(error: { message?: string } | null): boolean {
  if (!error?.message) return true;
  return !/titan_notification_events|does not exist|schema cache/i.test(error.message);
}

export async function insertTitanNotificationEvent(
  admin: SupabaseClient,
  row: {
    workspaceKey?: string;
    title: string;
    body: string;
    source?: string;
    priority?: NotificationPriority;
    relatedType?: string;
    relatedId?: string;
    relatedUrl?: string;
    emailStatus?: string;
    smsStatus?: string;
    pushoverStatus?: string;
    providerPayload?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data, error } = await admin
    .from('titan_notification_events')
    .insert({
      workspace_key: row.workspaceKey ?? 'default',
      title: row.title.slice(0, 500),
      body: row.body.slice(0, 4000),
      source: row.source ?? null,
      priority: row.priority ?? 'normal',
      related_type: row.relatedType ?? null,
      related_id: row.relatedId ?? null,
      related_url: row.relatedUrl ?? null,
      email_status: row.emailStatus ?? null,
      sms_status: row.smsStatus ?? null,
      pushover_status: row.pushoverStatus ?? null,
      provider_payload: row.providerPayload ?? {},
    })
    .select('id')
    .single();

  if (error) {
    if (!isNotificationTableReady(error)) return { ok: false, error: 'Migration 000108 not applied.' };
    return { ok: false, error: error.message };
  }
  return { ok: true, id: str((data as { id?: string })?.id) };
}

export async function loadTitanNotificationEvents(
  admin: SupabaseClient,
  opts: { workspaceKey?: string; limit?: number; includeArchived?: boolean } = {},
): Promise<{ events: TitanNotificationEvent[]; tablesReady: boolean }> {
  let q = admin
    .from('titan_notification_events')
    .select('*')
    .eq('workspace_key', opts.workspaceKey ?? 'default')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 80);

  if (!opts.includeArchived) {
    q = q.is('archived_at', null);
  }

  const { data, error } = await q;
  if (error) {
    if (!isNotificationTableReady(error)) return { events: [], tablesReady: false };
    return { events: [], tablesReady: true };
  }
  return { events: (data ?? []).map((r) => mapTitanNotificationRow(r as Record<string, unknown>)), tablesReady: true };
}

export async function countUnreadNotifications(admin: SupabaseClient, workspaceKey = 'default'): Promise<number> {
  const { count, error } = await admin
    .from('titan_notification_events')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_key', workspaceKey)
    .is('read_at', null)
    .is('archived_at', null);
  if (error || !isNotificationTableReady(error)) return 0;
  return count ?? 0;
}

export async function markNotificationRead(admin: SupabaseClient, id: string): Promise<void> {
  await admin
    .from('titan_notification_events')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
}

export async function markAllNotificationsRead(admin: SupabaseClient, workspaceKey = 'default'): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from('titan_notification_events')
    .update({ read_at: now })
    .eq('workspace_key', workspaceKey)
    .is('read_at', null)
    .is('archived_at', null);
}

export async function archiveNotification(admin: SupabaseClient, id: string): Promise<void> {
  await admin
    .from('titan_notification_events')
    .update({ archived_at: new Date().toISOString(), read_at: new Date().toISOString() })
    .eq('id', id);
}

export async function archiveAllNotifications(admin: SupabaseClient, workspaceKey = 'default'): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from('titan_notification_events')
    .update({ archived_at: now, read_at: now })
    .eq('workspace_key', workspaceKey)
    .is('archived_at', null);
}

export async function updateNotificationChannelStatuses(
  admin: SupabaseClient,
  id: string,
  patch: { emailStatus?: string; smsStatus?: string; pushoverStatus?: string; providerPayload?: Record<string, unknown> },
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.emailStatus) row.email_status = patch.emailStatus;
  if (patch.smsStatus) row.sms_status = patch.smsStatus;
  if (patch.pushoverStatus) row.pushover_status = patch.pushoverStatus;
  if (patch.providerPayload) row.provider_payload = patch.providerPayload;
  if (Object.keys(row).length === 0) return;
  await admin.from('titan_notification_events').update(row).eq('id', id);
}

export function groupNotificationsByDay(events: TitanNotificationEvent[]) {
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday.getTime() - 86400000);

  const today: TitanNotificationEvent[] = [];
  const yesterday: TitanNotificationEvent[] = [];
  const older: TitanNotificationEvent[] = [];

  for (const evt of events) {
    const d = new Date(evt.createdAt);
    if (Number.isNaN(d.getTime())) {
      older.push(evt);
      continue;
    }
    if (d >= startToday) today.push(evt);
    else if (d >= startYesterday) yesterday.push(evt);
    else older.push(evt);
  }
  return { today, yesterday, older };
}
