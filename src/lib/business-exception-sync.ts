import type { SupabaseClient } from '@supabase/supabase-js';
import type { OperationException } from '@/lib/operations-snapshot';
import { loadDismissalRecords, isDismissalActive } from '@/lib/business-exception-inbox';

function isMissingTable(message: string) {
  return /exception_|business_exceptions|schema cache|does not exist|Could not find/i.test(message);
}

/** @deprecated use loadDismissalRecords from business-exception-inbox */
export async function loadDismissedFingerprints(admin: SupabaseClient): Promise<Set<string>> {
  const { loadDismissalRecords, isDismissalActive } = await import('@/lib/business-exception-inbox');
  const records = await loadDismissalRecords(admin);
  const active = new Set<string>();
  for (const [fp, rec] of records.entries()) {
    if (isDismissalActive(rec)) active.add(fp);
  }
  return active;
}

export async function syncBusinessExceptions(
  admin: SupabaseClient,
  items: OperationException[],
): Promise<{ synced: number; resolved: number; skipped: boolean }> {
  const probe = await admin.from('business_exceptions').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { synced: 0, resolved: 0, skipped: true };
  }

  const now = new Date().toISOString();
  const fingerprints = new Set(items.map((item) => item.id));
  const dismissals = await loadDismissalRecords(admin);
  let synced = 0;

  for (const item of items) {
    const dismissal = dismissals.get(item.id);
    if (isDismissalActive(dismissal)) continue;

    const { data: existing } = await admin
      .from('business_exceptions')
      .select('id, first_seen_at, status')
      .eq('fingerprint', item.id)
      .maybeSingle();

    const payload = {
      fingerprint: item.id,
      kind: item.category,
      severity: item.severity,
      status: 'open' as const,
      title: item.title,
      detail: item.detail,
      appointment_id: item.workOrderId || null,
      payment_id: item.paymentId || null,
      receipt_id: item.receiptId || null,
      last_seen_at: now,
      resolved_at: null,
      resolved_by: null,
      auto_resolved: false,
      metadata: item,
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await admin.from('business_exceptions').update(payload).eq('id', existing.id);
      if (!error) synced += 1;
    } else {
      const { error } = await admin.from('business_exceptions').insert({
        ...payload,
        first_seen_at: now,
      });
      if (!error) synced += 1;
    }
  }

  const { data: openRows } = await admin
    .from('business_exceptions')
    .select('id, fingerprint')
    .eq('status', 'open')
    .limit(5000);

  let resolved = 0;
  for (const row of openRows ?? []) {
    if (fingerprints.has(String(row.fingerprint))) continue;
    const { error } = await admin
      .from('business_exceptions')
      .update({
        status: 'resolved',
        resolved_at: now,
        resolved_by: null,
        auto_resolved: true,
        updated_at: now,
      })
      .eq('id', row.id);
    if (!error) resolved += 1;
  }

  return { synced, resolved, skipped: false };
}

export async function logExceptionAction(
  admin: SupabaseClient,
  actorId: string | null,
  fingerprint: string | null,
  actionType: string,
  payload: Record<string, unknown> = {},
) {
  const { error } = await admin.from('exception_actions').insert({
    fingerprint,
    action_type: actionType,
    actor_id: actorId,
    payload,
    created_at: new Date().toISOString(),
  });
  if (error && !isMissingTable(error.message)) {
    console.warn('[exception_actions]', error.message);
  }
}

export async function markExceptionResolvedByUser(
  admin: SupabaseClient,
  fingerprint: string,
  actorId: string,
  note?: string,
) {
  const now = new Date().toISOString();
  await admin
    .from('business_exceptions')
    .update({
      status: 'resolved',
      resolved_at: now,
      resolved_by: actorId,
      auto_resolved: false,
      resolution_note: note ?? null,
      updated_at: now,
    })
    .eq('fingerprint', fingerprint);
}

export type SyncRunResult = {
  ok: boolean;
  synced: number;
  resolved: number;
  scanCount: number;
  error?: string;
  startedAt: string;
  finishedAt: string;
};

export async function recordSyncRun(
  admin: SupabaseClient,
  input: {
    startedAt: string;
    finishedAt: string;
    synced: number;
    resolved: number;
    scanCount: number;
    error?: string;
  },
) {
  const { error } = await admin.from('exception_sync_runs').insert({
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    synced_count: input.synced,
    resolved_count: input.resolved,
    scan_count: input.scanCount,
    error_message: input.error ?? null,
  });
  if (error && !isMissingTable(error.message)) {
    console.warn('[exception_sync_runs]', error.message);
  }
}

export async function runExceptionSyncPipeline(
  admin: SupabaseClient,
  scanFn: (admin: SupabaseClient) => Promise<{ exceptions: OperationException[]; refreshedAt: string }>,
): Promise<SyncRunResult> {
  const startedAt = new Date().toISOString();
  try {
    const scan = await scanFn(admin);
    const { synced, resolved, skipped } = await syncBusinessExceptions(admin, scan.exceptions);
    const finishedAt = new Date().toISOString();
    if (!skipped) {
      await recordSyncRun(admin, {
        startedAt,
        finishedAt,
        synced,
        resolved,
        scanCount: scan.exceptions.length,
      });
    }
    return {
      ok: true,
      synced,
      resolved,
      scanCount: scan.exceptions.length,
      startedAt,
      finishedAt,
    };
  } catch (e) {
    const finishedAt = new Date().toISOString();
    const message = e instanceof Error ? e.message : String(e);
    await recordSyncRun(admin, {
      startedAt,
      finishedAt,
      synced: 0,
      resolved: 0,
      scanCount: 0,
      error: message,
    });
    return {
      ok: false,
      synced: 0,
      resolved: 0,
      scanCount: 0,
      error: message,
      startedAt,
      finishedAt,
    };
  }
}
