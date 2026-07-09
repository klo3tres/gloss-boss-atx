import type { SupabaseClient } from '@supabase/supabase-js';

export const SMS_CONSENT_COPY =
  'Would you like to receive SMS text updates from Gloss Boss ATX about appointments, estimates, invoices, reminders, and service updates? Consent is optional and not required to book service. Message and data rates may apply. Reply STOP to unsubscribe.';

export const SMS_STOP_FOOTER = 'Reply STOP to opt out.';

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

  const phoneDigits = str(refs.phone).replace(/\D/g, '').slice(-10);
  let targetCustomerId = str(refs.customerId);
  let apptConsent: boolean | null = null;
  let apptStatus: string | null = null;
  let fallbackConsent: boolean | null = null;

  // 1. Resolve Appointment consent details
  const appointmentId = str(refs.appointmentId);
  if (appointmentId) {
    const { data } = await db
      .from('appointments')
      .select('sms_consent, sms_status, customer_id')
      .eq('id', appointmentId)
      .maybeSingle();
    if (data) {
      apptConsent = data.sms_consent;
      apptStatus = data.sms_status;
      if (!targetCustomerId && data.customer_id) {
        targetCustomerId = data.customer_id;
      }
    }
  }

  // 2. Resolve Fallback Booking consent details
  const fallbackBookingId = str(refs.fallbackBookingId);
  if (fallbackBookingId) {
    const { data } = await db
      .from('booking_fallbacks')
      .select('payload, customer_id')
      .eq('id', fallbackBookingId)
      .maybeSingle();
    if (data) {
      const sms = data.payload?.walk_in_sms_consent as Record<string, unknown> | undefined;
      if (sms) {
        fallbackConsent = sms.agreed === true;
      }
      if (!targetCustomerId && data.customer_id) {
        targetCustomerId = data.customer_id;
      }
    }
  }

  // 3. Resolve Customer record details
  let customerConsent: boolean | null = null;
  let customerStatus: string | null = null;

  if (targetCustomerId) {
    const { data } = await db
      .from('customers')
      .select('sms_consent, sms_status')
      .eq('id', targetCustomerId)
      .maybeSingle();
    if (data) {
      customerConsent = data.sms_consent;
      customerStatus = data.sms_status;
    }
  }

  // If no customer record yet but we have phone digits, lookup customer by phone
  if (customerConsent === null && phoneDigits) {
    const { data } = await db
      .from('customers')
      .select('sms_consent, sms_status')
      .ilike('phone', `%${phoneDigits}`)
      .limit(1)
      .maybeSingle();
    if (data) {
      customerConsent = data.sms_consent;
      customerStatus = data.sms_status;
    }
  }

  // 4. Strict Opt-Out Enforcement (Opt-out overrides any opt-in)
  if (apptConsent === false || apptStatus === 'opted_out') {
    return { ok: false, reason: 'Customer opted out of SMS on this appointment.' };
  }
  if (fallbackConsent === false) {
    return { ok: false, reason: 'Customer opted out of SMS on this walk-in booking.' };
  }
  if (customerConsent === false || customerStatus === 'opted_out') {
    return { ok: false, reason: 'Customer opted out of SMS at the profile level.' };
  }

  // Check by phone digits specifically if any matching customer profile has opted out
  if (phoneDigits) {
    const { data: matches } = await db
      .from('customers')
      .select('sms_consent, sms_status')
      .ilike('phone', `%${phoneDigits}`);
    if (matches) {
      const hasOptOut = matches.some((m) => m.sms_consent === false || m.sms_status === 'opted_out');
      if (hasOptOut) {
        return { ok: false, reason: 'Customer phone number is marked as opted-out.' };
      }
    }
  }

  // 5. Explicit Opt-In Verification
  if (apptConsent === true && apptStatus === 'opted_in') {
    return { ok: true };
  }
  if (fallbackConsent === true) {
    return { ok: true };
  }
  if (customerConsent === true && customerStatus === 'opted_in') {
    return { ok: true };
  }

  return { ok: false, reason: 'SMS consent is not opted in.' };
}
