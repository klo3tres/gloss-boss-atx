import { NextResponse } from 'next/server';
import { logSmsConsentChange, normalizeSmsConsentStatus } from '@/lib/sms-consent';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const runtime = 'nodejs';

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'UNSTOP', 'YES']);

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return new NextResponse('<Response />', { headers: { 'Content-Type': 'text/xml' } });

  const form = await request.formData();
  const from = String(form.get('From') ?? '').replace(/\D/g, '').slice(-10);
  const body = String(form.get('Body') ?? '').trim().toUpperCase();
  const optOut = STOP_WORDS.has(body);
  const optIn = START_WORDS.has(body);

  if ((optOut || optIn) && from) {
    const { data: customers } = await admin.from('customers').select('id, sms_consent').ilike('phone', `%${from}`).limit(20);
    for (const c of customers ?? []) {
      const row = c as { id: string; sms_consent?: boolean | null };
      await admin.from('customers').update({
        sms_consent: optIn,
        sms_status: normalizeSmsConsentStatus(optIn),
        sms_consent_source: 'customer_profile',
        sms_consent_timestamp: new Date().toISOString(),
        sms_opt_out_timestamp: optOut ? new Date().toISOString() : null,
      }).eq('id', row.id);
      await logSmsConsentChange(admin, {
        customerId: row.id,
        source: 'customer_profile',
        previousConsent: row.sms_consent ?? null,
        newConsent: optIn,
        note: `Inbound Twilio keyword: ${body}`,
      });
    }
  }

  return new NextResponse('<Response />', { headers: { 'Content-Type': 'text/xml' } });
}
