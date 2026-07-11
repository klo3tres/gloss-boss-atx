import type { SupabaseClient } from '@supabase/supabase-js';

export type TitanExecutionRow = {
  id: string;
  source: 'outbox' | 'scheduled';
  channel: string;
  actionType: string;
  recipient: string;
  status: string;
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  scheduledFor: string | null;
};

function str(value: unknown) { return value == null ? '' : String(value); }

export async function loadTitanExecutions(admin: SupabaseClient, limit = 80): Promise<TitanExecutionRow[]> {
  const [outboxResult, scheduledResult] = await Promise.all([
    admin.from('notification_outbox').select('id, kind, channel, status, provider, provider_message_id, error_message, payload, created_at').order('created_at', { ascending: false }).limit(limit),
    admin.from('scheduled_messages').select('id, rule_key, channel, recipient, status, skipped_reason, entity_type, entity_id, opportunity_id, scheduled_for, created_at').order('created_at', { ascending: false }).limit(limit),
  ]);
  const outbox = (outboxResult.data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    const payload = row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {};
    return {
      id: str(row.id), source: 'outbox' as const, channel: str(row.channel), actionType: str(row.kind), recipient: str(payload.to), status: str(row.status),
      provider: str(row.provider) || null, providerMessageId: str(row.provider_message_id) || null, error: str(row.error_message) || null,
      entityType: str(payload.entity_type) || null, entityId: str(payload.entity_id) || null, createdAt: str(row.created_at), scheduledFor: null,
    };
  });
  const scheduled = (scheduledResult.data ?? []).map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      id: str(row.id), source: 'scheduled' as const, channel: str(row.channel), actionType: str(row.rule_key), recipient: str(row.recipient), status: str(row.status),
      provider: null, providerMessageId: null, error: str(row.skipped_reason) || null,
      entityType: str(row.entity_type) || (row.opportunity_id ? 'opportunity' : null), entityId: str(row.entity_id) || str(row.opportunity_id) || null,
      createdAt: str(row.created_at), scheduledFor: str(row.scheduled_for) || null,
    };
  });
  return [...outbox, ...scheduled].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}
