import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function logNotificationOutbox(row: {
  kind: string;
  channel: 'email' | 'sms';
  status: 'sent' | 'failed' | 'skipped' | 'accepted' | 'pending';
  provider: string;
  recipient: string;
  from_address?: string | null;
  provider_message_id?: string | null;
  error_message?: string | null;
  skipped_reason?: string | null;
  template_key?: string | null;
  appointment_id?: string | null;
  payload?: Record<string, unknown>;
}) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return;
  const insert: Record<string, unknown> = {
    kind: row.kind,
    channel: row.channel,
    status: row.status,
    provider: row.provider,
    template_key: row.template_key ?? row.kind,
    error_message: row.error_message ?? null,
    skipped_reason: row.skipped_reason ?? null,
    provider_message_id: row.provider_message_id ?? null,
    appointment_id: row.appointment_id ?? null,
    payload: {
      to: row.recipient,
      from: row.from_address ?? process.env.RESEND_FROM_EMAIL ?? process.env.TWILIO_FROM_NUMBER ?? null,
      ...row.payload,
    },
    created_at: new Date().toISOString(),
  };
  const { error } = await admin.from('notification_outbox').insert(insert);
  if (error) console.warn('[notification_outbox]', error.message);
}
