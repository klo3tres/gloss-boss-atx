import type { SupabaseClient } from '@supabase/supabase-js';

export const SMS_CONSENT_COPY =
  'Would you like to receive SMS text updates from Gloss Boss ATX about appointments, estimates, invoices, reminders, and service updates? Consent is optional and not required to book service. Message and data rates may apply. Reply STOP to unsubscribe.';

export type SmsConsentSource =
  | 'account_signup'
  | 'online_booking'
  | 'walk_in_booking'
  | 'admin_update'
  | 'customer_profile';

export function normalizeSmsConsentStatus(consent: boolean | null | undefined) {
  return consent === true ? 'opted_in' : consent === false ? 'opted_out' : 'unknown';
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function logSmsConsentChange(
  db: SupabaseClient | null | undefined,
  row: {
    customerId?: string | null;
    appointmentId?: string | null;
    fallbackBookingId?: string | null;
    changedBy?: string | null;
    source: SmsConsentSource;
    previousConsent?: boolean | null;
    newConsent: boolean;
    ip?: string | null;
    userAgent?: string | null;
    note?: string | null;
  },
) {
  if (!db) return;
  const payload = {
    customer_id: row.customerId ?? null,
    appointment_id: row.appointmentId ?? null,
    fallback_booking_id: row.fallbackBookingId ?? null,
    changed_by: row.changedBy ?? null,
    source: row.source,
    previous_sms_consent: row.previousConsent ?? null,
    new_sms_consent: row.newConsent,
    sms_status: normalizeSmsConsentStatus(row.newConsent),
    ip_address: row.ip ?? null,
    user_agent: row.userAgent ?? null,
    note: row.note ?? null,
    consent_text: SMS_CONSENT_COPY,
    created_at: new Date().toISOString(),
  };
  const { error } = await db.from('sms_consent_audit_log').insert(payload);
  if (error) console.warn('[sms-consent] audit log skipped', error.message);
}

export async function customerCanReceiveSms(
  db: SupabaseClient | null | undefined,
  refs: {
    appointmentId?: string | null;
    fallbackBookingId?: string | null;
    customerId?: string | null;
    phone?: string | null;
  },
): Promise<{ ok: boolean; reason?: string }> {
  if (!db) return { ok: false, reason: 'No database available to verify SMS consent.' };

  const appointmentId = str(refs.appointmentId);
  if (appointmentId) {
    const { data } = await db
      .from('appointments')
      .select('sms_consent, sms_status, customer_id')
      .eq('id', appointmentId)
      .maybeSingle();
    const row = data as { sms_consent?: boolean | null; sms_status?: string | null; customer_id?: string | null } | null;
    if (row?.sms_consent === true && row.sms_status === 'opted_in') return { ok: true };
    if (row?.sms_consent === false || row?.sms_status === 'opted_out') {
      return { ok: false, reason: 'Customer did not opt in to SMS for this booking.' };
    }
    if (!refs.customerId && row?.customer_id) refs.customerId = row.customer_id;
  }

  const fallbackBookingId = str(refs.fallbackBookingId);
  if (fallbackBookingId) {
    const { data } = await db
      .from('booking_fallbacks')
      .select('payload, customer_id')
      .eq('id', fallbackBookingId)
      .maybeSingle();
    const row = data as { payload?: Record<string, unknown> | null; customer_id?: string | null } | null;
    const sms = row?.payload?.walk_in_sms_consent as Record<string, unknown> | undefined;
    if (sms?.agreed === true) return { ok: true };
    if (sms?.agreed === false) return { ok: false, reason: 'Customer did not opt in to SMS for this walk-in booking.' };
    if (!refs.customerId && row?.customer_id) refs.customerId = row.customer_id;
  }

  const customerId = str(refs.customerId);
  if (customerId) {
    const { data } = await db
      .from('customers')
      .select('sms_consent, sms_status')
      .eq('id', customerId)
      .maybeSingle();
    const row = data as { sms_consent?: boolean | null; sms_status?: string | null } | null;
    if (row?.sms_consent === true && row.sms_status === 'opted_in') return { ok: true };
    if (row?.sms_consent === false || row?.sms_status === 'opted_out') {
      return { ok: false, reason: 'Customer SMS status is opted out.' };
    }
  }

  const phoneDigits = str(refs.phone).replace(/\D/g, '').slice(-10);
  if (phoneDigits) {
    const { data } = await db
      .from('customers')
      .select('sms_consent, sms_status')
      .ilike('phone', `%${phoneDigits}`)
      .limit(1)
      .maybeSingle();
    const row = data as { sms_consent?: boolean | null; sms_status?: string | null } | null;
    if (row?.sms_consent === true && row.sms_status === 'opted_in') return { ok: true };
  }

  return { ok: false, reason: 'SMS consent is not opted in.' };
}
