import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTwilioSms, twilioConfigured } from '@/lib/email-send';
import { twilioSendMode } from '@/lib/twilio-config';
import { normalizeToE164 } from '@/lib/us-phone';

export type SmsSendResult = {
  ok: boolean;
  skipped?: boolean;
  error?: string;
  sid?: string;
  deliveryStatus?: string;
  carrierError?: string;
};

export async function logSmsOutbox(
  db: SupabaseClient | null | undefined,
  row: {
    kind: string;
    status: 'sent' | 'delivered' | 'queued' | 'failed' | 'skipped';
    appointment_id?: string | null;
    fallback_booking_id?: string | null;
    customer_id?: string | null;
    technician_id?: string | null;
    template_key?: string | null;
    provider_message_id?: string | null;
    error_message?: string | null;
    skipped_reason?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  if (!db) return;
  const now = new Date().toISOString();
  const { error } = await db.from('notification_outbox').insert({
    kind: row.kind,
    channel: 'sms',
    provider: 'twilio',
    status: row.status,
    appointment_id: row.appointment_id ?? null,
    fallback_booking_id: row.fallback_booking_id ?? null,
    customer_id: row.customer_id ?? null,
    technician_id: row.technician_id ?? null,
    template_key: row.template_key ?? row.kind,
    provider_message_id: row.provider_message_id ?? null,
    error_message: row.error_message ?? null,
    skipped_reason: row.skipped_reason ?? null,
    payload: { send_mode: twilioSendMode(), ...row.payload },
    sent_at: row.status === 'sent' ? now : null,
    failed_at: row.status === 'failed' ? now : null,
    created_at: now,
  });
  if (error) console.warn('[sms] notification_outbox', error.message);
}

export async function sendCustomerSms(params: {
  db?: SupabaseClient | null;
  kind: string;
  to: string;
  body: string;
  appointment_id?: string | null;
  fallback_booking_id?: string | null;
  customer_id?: string | null;
  technician_id?: string | null;
  template_key?: string;
  extraPayload?: Record<string, unknown>;
}): Promise<SmsSendResult> {
  const phone = normalizeToE164(String(params.to ?? ''));
  const e164 = phone.ok ? phone.e164 : String(params.to ?? '').trim();
  const basePayload = {
    destination_e164: phone.ok ? phone.e164 : null,
    to_last4: phone.ok ? phone.digits10.slice(-4) : String(params.to ?? '').replace(/\D/g, '').slice(-4),
    body_preview: params.body.slice(0, 120),
    ...params.extraPayload,
  };

  if (!twilioConfigured()) {
    await logSmsOutbox(params.db, {
      kind: params.kind,
      status: 'skipped',
      appointment_id: params.appointment_id,
      fallback_booking_id: params.fallback_booking_id,
      customer_id: params.customer_id,
      technician_id: params.technician_id,
      template_key: params.template_key,
      skipped_reason: 'Twilio not configured (SID, token, and Messaging Service or From number).',
      payload: basePayload,
    });
    return { ok: false, skipped: true, error: 'Twilio not configured.' };
  }

  if (!phone.ok) {
    await logSmsOutbox(params.db, {
      kind: params.kind,
      status: 'skipped',
      appointment_id: params.appointment_id,
      fallback_booking_id: params.fallback_booking_id,
      customer_id: params.customer_id,
      technician_id: params.technician_id,
      template_key: params.template_key,
      skipped_reason: phone.error,
      payload: basePayload,
    });
    return { ok: false, skipped: true, error: phone.error };
  }

  const sent = await sendTwilioSms({ to: e164, body: params.body });
  if (sent.ok) {
    const delivery = (sent.status ?? 'queued').toLowerCase();
    const delivered = delivery === 'delivered' || delivery === 'sent';
    const outboxStatus = delivered ? 'delivered' : delivery === 'failed' || delivery === 'undelivered' ? 'failed' : 'queued';
    await logSmsOutbox(params.db, {
      kind: params.kind,
      status: outboxStatus,
      appointment_id: params.appointment_id,
      fallback_booking_id: params.fallback_booking_id,
      customer_id: params.customer_id,
      technician_id: params.technician_id,
      template_key: params.template_key,
      provider_message_id: sent.sid ?? null,
      error_message: sent.errorMessage ?? sent.error ?? null,
      payload: {
        ...basePayload,
        twilio_status: delivery,
        twilio_sid: sent.sid ?? null,
        carrier_error: sent.errorMessage ?? null,
      },
    });
    return { ok: true, sid: sent.sid, deliveryStatus: delivery, carrierError: sent.errorMessage };
  }

  await logSmsOutbox(params.db, {
    kind: params.kind,
    status: 'failed',
    appointment_id: params.appointment_id,
    fallback_booking_id: params.fallback_booking_id,
    customer_id: params.customer_id,
    technician_id: params.technician_id,
    template_key: params.template_key,
    error_message: sent.error ?? 'Twilio send failed.',
    payload: basePayload,
  });
  return { ok: false, error: sent.error ?? 'Twilio send failed.' };
}
