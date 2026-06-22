import type { SupabaseClient } from '@supabase/supabase-js';
import type { OperationException } from '@/lib/operations-snapshot';

function isMissingTable(message: string) {
  return /exception_dismissals|exception_actions|business_exceptions|schema cache|does not exist|Could not find/i.test(message);
}

export async function loadDismissedFingerprints(admin: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await admin.from('exception_dismissals').select('fingerprint, snooze_until').limit(5000);
  if (error) {
    if (isMissingTable(error.message)) return new Set();
    return new Set();
  }
  const now = Date.now();
  const dismissed = new Set<string>();
  for (const row of data ?? []) {
    const until = row.snooze_until ? new Date(String(row.snooze_until)).getTime() : null;
    if (until != null && until <= now) continue;
    dismissed.add(String(row.fingerprint));
  }
  return dismissed;
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
  let synced = 0;

  for (const item of items) {
    const { error } = await admin.from('business_exceptions').upsert(
      {
        fingerprint: item.id,
        kind: item.category,
        severity: item.severity,
        status: 'open',
        title: item.title,
        detail: item.detail,
        appointment_id: item.workOrderId || null,
        payment_id: item.paymentId || null,
        last_seen_at: now,
        resolved_at: null,
        metadata: item,
        updated_at: now,
      },
      { onConflict: 'fingerprint' },
    );
    if (!error) synced += 1;
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
      .update({ status: 'resolved', resolved_at: now, updated_at: now })
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
