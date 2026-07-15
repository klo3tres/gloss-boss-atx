import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { logSmsConsentChange, normalizeSmsConsentStatus } from '@/lib/sms-consent';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { twilioAuthToken } from '@/lib/twilio-config';

export const runtime = 'nodejs';

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const START_WORDS = new Set(['START', 'UNSTOP', 'YES']);
const DELIVERY_STATUSES = new Set(['queued', 'sent', 'delivered', 'failed', 'undelivered']);

function validSignature(form: FormData, signature: string | null, callbackUrl: string) {
  const token = twilioAuthToken();
  if (!token || !signature) return false;
  const pairs = [...form.entries()]
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  const payload = `${callbackUrl}${pairs.map(([key, value]) => `${key}${value}`).join('')}`;
  const expected = createHmac('sha1', token).update(payload).digest('base64');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return new NextResponse('<Response />', { headers: { 'Content-Type': 'text/xml' } });

  const form = await request.formData();
  if (!validSignature(form, request.headers.get('x-twilio-signature'), request.url)) {
    return new NextResponse('<Response />', { status: 403, headers: { 'Content-Type': 'text/xml' } });
  }

  const messageSid = String(form.get('MessageSid') ?? form.get('SmsSid') ?? '').trim();
  const messageStatus = String(form.get('MessageStatus') ?? '').trim().toLowerCase();
  if (messageSid && DELIVERY_STATUSES.has(messageStatus)) {
    const now = new Date().toISOString();
    const errorCode = String(form.get('ErrorCode') ?? '').trim();
    const errorMessage = String(form.get('ErrorMessage') ?? '').trim();
    const patch: Record<string, unknown> = {
      status: messageStatus,
      provider_status: messageStatus,
      error_message: errorMessage || (errorCode ? `Twilio error ${errorCode}` : null),
      sent_at: messageStatus === 'sent' || messageStatus === 'delivered' ? now : undefined,
      delivered_at: messageStatus === 'delivered' ? now : undefined,
      failed_at: messageStatus === 'failed' || messageStatus === 'undelivered' ? now : undefined,
      status_updated_at: now,
    };
    Object.keys(patch).forEach((key) => patch[key] === undefined && delete patch[key]);
    const current = await admin
      .from('notification_outbox')
      .select('id, status, kind, payload')
      .eq('provider', 'twilio')
      .eq('provider_message_id', messageSid)
      .maybeSingle();
    if (!current.data?.id) return new NextResponse('<Response />', { headers: { 'Content-Type': 'text/xml' } });
    const rank: Record<string, number> = { queued: 0, sent: 1, delivered: 3, failed: 3, undelivered: 3 };
    if ((rank[String(current.data.status)] ?? -1) > (rank[messageStatus] ?? -1)) {
      return new NextResponse('<Response />', { headers: { 'Content-Type': 'text/xml' } });
    }
    const outbox = await admin
      .from('notification_outbox')
      .update(patch)
      .eq('id', current.data.id)
      .select('id, kind, payload')
      .maybeSingle();

    const payload = outbox.data?.payload && typeof outbox.data.payload === 'object'
      ? outbox.data.payload as Record<string, unknown>
      : {};
    const inviteId = typeof payload.invite_id === 'string' ? payload.invite_id : '';
    if (inviteId) {
      await admin.from('staff_invites').update({
        sms_delivery_status: messageStatus,
        sms_delivery_error: patch.error_message,
        sms_delivery_updated_at: now,
        updated_at: now,
      }).eq('id', inviteId);
    }
    return new NextResponse('<Response />', { headers: { 'Content-Type': 'text/xml' } });
  }

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
