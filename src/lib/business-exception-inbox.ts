import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExceptionCategory, ExceptionSeverity, OperationException } from '@/lib/operations-snapshot';
import { formatChicagoDateTime } from '@/lib/chicago-time';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /exception_|business_exceptions|schema cache|does not exist|Could not find/i.test(message);
}

export type ExceptionDismissalRecord = {
  fingerprint: string;
  snoozeUntil: string | null;
  note: string | null;
  dismissedAt: string | null;
};

export type ExceptionTimeline = {
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  autoResolved: boolean;
  dismissedUntil: string | null;
  status: 'open' | 'resolved' | 'dismissed';
};

export type InboxException = OperationException & {
  timeline: ExceptionTimeline;
  dbId: string;
};

export type InboxLoadOptions = {
  includeDismissed?: boolean;
  includeResolved?: boolean;
  limit?: number;
};

export async function loadDismissalRecords(admin: SupabaseClient): Promise<Map<string, ExceptionDismissalRecord>> {
  const { data, error } = await admin
    .from('exception_dismissals')
    .select('fingerprint, snooze_until, note, created_at, updated_at')
    .limit(5000);
  if (error) {
    if (isMissingTable(error.message)) return new Map();
    return new Map();
  }
  const map = new Map<string, ExceptionDismissalRecord>();
  for (const row of data ?? []) {
    map.set(String(row.fingerprint), {
      fingerprint: String(row.fingerprint),
      snoozeUntil: row.snooze_until ? String(row.snooze_until) : null,
      note: row.note ? String(row.note) : null,
      dismissedAt: row.updated_at ? String(row.updated_at) : row.created_at ? String(row.created_at) : null,
    });
  }
  return map;
}

export function isDismissalActive(record: ExceptionDismissalRecord | undefined): boolean {
  if (!record) return false;
  if (!record.snoozeUntil) return true;
  return new Date(record.snoozeUntil).getTime() > Date.now();
}

function parseMetadata(raw: unknown): Partial<OperationException> | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id === 'string' && typeof m.title === 'string') return m as Partial<OperationException>;
  return null;
}

function rowToInboxException(
  row: Record<string, unknown>,
  dismissal: ExceptionDismissalRecord | undefined,
  resolvedByName: string | null,
): InboxException | null {
  const meta = parseMetadata(row.metadata);
  const fingerprint = str(row.fingerprint);
  if (!fingerprint) return null;

  const statusRaw = str(row.status).toLowerCase();
  const dismissed = isDismissalActive(dismissal);
  const status: ExceptionTimeline['status'] =
    statusRaw === 'resolved' ? 'resolved' : dismissed ? 'dismissed' : 'open';

  const base: OperationException = {
    id: fingerprint,
    category: (meta?.category ?? str(row.kind) ?? 'system') as ExceptionCategory,
    severity: (meta?.severity ?? str(row.severity) ?? 'warning') as ExceptionSeverity,
    title: meta?.title ?? str(row.title) ?? 'Exception',
    detail: meta?.detail ?? str(row.detail) ?? '',
    customerName: meta?.customerName ?? null,
    workOrderId: meta?.workOrderId ?? (row.appointment_id ? str(row.appointment_id) : null),
    paymentId: meta?.paymentId ?? (row.payment_id ? str(row.payment_id) : null),
    receiptId: meta?.receiptId ?? (row.receipt_id ? str(row.receipt_id) : null),
    outboxId: meta?.outboxId ?? null,
    occurredAt: meta?.occurredAt ?? null,
    href: meta?.href ?? '/admin/exceptions',
    actionLabel: meta?.actionLabel ?? 'Open',
    secondaryHref: meta?.secondaryHref,
    secondaryActionLabel: meta?.secondaryActionLabel,
    channel: meta?.channel ?? null,
    recipient: meta?.recipient ?? null,
    eventType: meta?.eventType ?? null,
    suggestedNext: meta?.suggestedNext,
    inlineActions: meta?.inlineActions,
  };

  return {
    ...base,
    dbId: str(row.id),
    timeline: {
      firstSeenAt: row.first_seen_at ? String(row.first_seen_at) : null,
      lastSeenAt: row.last_seen_at ? String(row.last_seen_at) : null,
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      resolvedByName,
      autoResolved: row.auto_resolved === true,
      dismissedUntil: dismissal?.snoozeUntil ?? null,
      status,
    },
  };
}

export async function loadInboxFromDatabase(
  admin: SupabaseClient,
  opts: InboxLoadOptions = {},
): Promise<{ items: InboxException[]; lastSyncAt: string | null }> {
  const probe = await admin.from('business_exceptions').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { items: [], lastSyncAt: null };
  }

  const dismissals = await loadDismissalRecords(admin);
  const limit = opts.limit ?? 500;

  let query = admin
    .from('business_exceptions')
    .select(
      'id, fingerprint, kind, severity, status, title, detail, appointment_id, payment_id, receipt_id, first_seen_at, last_seen_at, resolved_at, resolved_by, auto_resolved, metadata, updated_at',
    )
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (!opts.includeResolved) {
    query = query.eq('status', 'open');
  }

  const { data: rows, error } = await query;
  if (error) return { items: [], lastSyncAt: null };

  const resolverIds = [...new Set((rows ?? []).map((r) => str(r.resolved_by)).filter(Boolean))];
  const resolverNames = new Map<string, string>();
  if (resolverIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, full_name, email').in('id', resolverIds);
    for (const p of profiles ?? []) {
      resolverNames.set(str(p.id), str(p.full_name) || str(p.email) || 'Staff');
    }
  }

  const items: InboxException[] = [];
  for (const row of rows ?? []) {
    const fp = str(row.fingerprint);
    const dismissal = dismissals.get(fp);
    const dismissed = isDismissalActive(dismissal);
    if (dismissed && !opts.includeDismissed) continue;
    if (str(row.status) === 'resolved' && !opts.includeResolved) continue;

    const inbox = rowToInboxException(
      row as Record<string, unknown>,
      dismissal,
      row.resolved_by ? resolverNames.get(str(row.resolved_by)) ?? null : null,
    );
    if (inbox) items.push(inbox);
  }

  const { data: lastRun } = await admin
    .from('exception_sync_runs')
    .select('finished_at, started_at')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastSyncAt = lastRun?.finished_at
    ? String(lastRun.finished_at)
    : lastRun?.started_at
      ? String(lastRun.started_at)
      : null;

  return { items, lastSyncAt };
}

export function formatTimelineLine(timeline: ExceptionTimeline): string[] {
  const lines: string[] = [];
  if (timeline.firstSeenAt) lines.push(`First seen ${formatChicagoDateTime(timeline.firstSeenAt)}`);
  if (timeline.lastSeenAt) lines.push(`Last seen ${formatChicagoDateTime(timeline.lastSeenAt)}`);
  if (timeline.dismissedUntil) lines.push(`Snoozed until ${formatChicagoDateTime(timeline.dismissedUntil)}`);
  if (timeline.resolvedAt) {
    const who = timeline.resolvedByName ?? (timeline.autoResolved ? 'System' : 'Unknown');
    lines.push(`Resolved ${formatChicagoDateTime(timeline.resolvedAt)} by ${who}`);
  }
  return lines;
}
