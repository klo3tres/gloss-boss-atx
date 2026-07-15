import type { SupabaseClient } from '@supabase/supabase-js';
import { sendTwilioSms, twilioConfigured } from '@/lib/email-send';
import { customerCanReceiveSms } from '@/lib/sms-consent';
import { twilioSendMode } from '@/lib/twilio-config';
import { normalizeToE164 } from '@/lib/us-phone';

export type SmsSkipReason =
  | 'twilio_not_configured'
  | 'missing_phone'
  | 'invalid_phone'
  | 'consent_denied'
  | 'send_failed';

export type SmsSendResult = {
  ok: boolean;
  skipped?: boolean;
  skipped_reason?: SmsSkipReason | string;
  error?: string;
  sid?: string;
  deliveryStatus?: string;
  carrierError?: string;
};

export async function logSmsOutbox(
  db: SupabaseClient | null | undefined,
  row: {
    kind: string;
    status: 'sent' | 'delivered' | 'queued' | 'failed' | 'undelivered' | 'skipped';
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
    sent_at: row.status === 'sent' || row.status === 'delivered' ? now : null,
    delivered_at: row.status === 'delivered' ? now : null,
    failed_at: row.status === 'failed' || row.status === 'undelivered' ? now : null,
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
  requireConsent?: boolean;
}): Promise<SmsSendResult> {
  const phone = normalizeToE164(String(params.to ?? ''));
  const e164 = phone.ok ? phone.e164 : String(params.to ?? '').trim();
  const basePayload = {
    destination_e164: phone.ok ? phone.e164 : null,
    to_last4: phone.ok ? phone.digits10.slice(-4) : String(params.to ?? '').replace(/\D/g, '').slice(-4),
    body_preview: params.body.slice(0, 120),
    ...params.extraPayload,
  };

  if (!String(params.to ?? '').trim()) {
    await logSmsOutbox(params.db, {
      kind: params.kind,
      status: 'skipped',
      appointment_id: params.appointment_id,
      fallback_booking_id: params.fallback_booking_id,
      customer_id: params.customer_id,
      technician_id: params.technician_id,
      template_key: params.template_key,
      skipped_reason: 'missing_phone',
      payload: basePayload,
    });
    return {
      ok: false,
      skipped: true,
      skipped_reason: 'missing_phone',
      error: 'No phone number on file.',
    };
  }

  if (!twilioConfigured()) {
    await logSmsOutbox(params.db, {
      kind: params.kind,
      status: 'skipped',
      appointment_id: params.appointment_id,
      fallback_booking_id: params.fallback_booking_id,
      customer_id: params.customer_id,
      technician_id: params.technician_id,
      template_key: params.template_key,
      skipped_reason: 'twilio_not_configured',
      payload: basePayload,
    });
    return {
      ok: false,
      skipped: true,
      skipped_reason: 'twilio_not_configured',
      error: 'SMS skipped — Twilio is not configured.',
    };
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
      skipped_reason: 'invalid_phone',
      payload: basePayload,
    });
    return {
      ok: false,
      skipped: true,
      skipped_reason: 'invalid_phone',
      error: phone.error ?? 'Invalid phone number.',
    };
  }

  if (params.requireConsent !== false) {
    const consent = await customerCanReceiveSms(params.db, {
      appointmentId: params.appointment_id,
      fallbackBookingId: params.fallback_booking_id,
      customerId: params.customer_id,
      phone: e164,
    });
    if (!consent.ok) {
      const reason = consent.reason ?? 'SMS consent is not opted in.';
      await logSmsOutbox(params.db, {
        kind: params.kind,
        status: 'skipped',
        appointment_id: params.appointment_id,
        fallback_booking_id: params.fallback_booking_id,
        customer_id: params.customer_id,
        technician_id: params.technician_id,
        template_key: params.template_key,
        skipped_reason: 'consent_denied',
        payload: { ...basePayload, sms_consent_required: true, consent_detail: reason },
      });
      return {
        ok: false,
        skipped: true,
        skipped_reason: 'consent_denied',
        error: reason,
      };
    }
  }

  const sent = await sendTwilioSms({ to: e164, body: params.body });
  if (sent.ok) {
    const delivery = (sent.status ?? 'queued').toLowerCase();
    const outboxStatus = delivery === 'delivered'
      ? 'delivered'
      : delivery === 'sent'
        ? 'sent'
        : delivery === 'failed'
          ? 'failed'
          : delivery === 'undelivered'
            ? 'undelivered'
            : 'queued';
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
    skipped_reason: 'send_failed',
    payload: basePayload,
  });
  return {
    ok: false,
    skipped_reason: 'send_failed',
    error: sent.error ?? 'Twilio send failed.',
  };
}
