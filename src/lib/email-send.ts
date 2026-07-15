import { bookingConfirmationEmailHtml } from '@/lib/email/templates/booking';
import { portalButtonHtml } from '@/lib/email/templates/layout';
import {
  appointmentReminderEmailHtml,
  jobCompletedEmailHtml,
  jobStartedEmailHtml,
  paymentReceivedEmailHtml,
  welcomeEmailHtml,
} from '@/lib/email/templates/transactional';
import { glossBossEmailLayout } from '@/lib/email/templates/layout';
import { parseResendError } from '@/lib/resend-config';
import {
  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber,
  twilioMessagingServiceSid,
  twilioSenderReady,
} from '@/lib/twilio-config';
import { appOrigin } from '@/lib/auth/action-link-registry';

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

export type ResendEnvStatus = {
  apiKeySet: boolean;
  fromEmailSet: boolean;
  fromEmail: string;
  ready: boolean;
  missing: string[];
};

export function getResendEnvStatus(): ResendEnvStatus {
  const apiKeySet = Boolean(process.env.RESEND_API_KEY?.trim());
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() ?? '';
  const fromEmailSet = Boolean(fromEmail);
  const missing: string[] = [];
  if (!apiKeySet) missing.push('RESEND_API_KEY');
  if (!fromEmailSet) missing.push('RESEND_FROM_EMAIL');
  return {
    apiKeySet,
    fromEmailSet,
    fromEmail: fromEmailSet ? fromEmail : '(not set)',
    ready: apiKeySet && fromEmailSet,
    missing,
  };
}

export async function sendResendHtml(params: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ ok: boolean; error?: string; emailId?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) {
    console.info('[email] Resend skipped (missing RESEND_API_KEY or RESEND_FROM_EMAIL)', params.to);
    return { ok: false, error: 'Resend is not configured (missing API key or from address).' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [params.to], subject: params.subject, html: params.html }),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = parseResendError(text, res.status);
      console.warn('[email] Resend HTTP', res.status, err.slice(0, 300));
      return { ok: false, error: err };
    }
    let emailId: string | undefined;
    try {
      const json = JSON.parse(text) as { id?: string };
      if (json.id) emailId = json.id;
    } catch {
      /* ignore */
    }
    return { ok: true, emailId };
  } catch (e) {
    console.warn('[email] Resend fetch', e);
    return { ok: false };
  }
}

export function twilioConfigured(): boolean {
  return twilioSenderReady();
}

function parseTwilioError(text: string): string {
  try {
    const j = JSON.parse(text) as { message?: string; code?: number };
    if (j.message) return j.code ? `${j.message} (${j.code})` : j.message;
  } catch {
    /* raw text */
  }
  return text.slice(0, 400) || 'Twilio request failed';
}

export async function fetchTwilioMessageStatus(messageSid: string): Promise<{
  status: string;
  errorCode?: string | null;
  errorMessage?: string;
} | null> {
  const accountSid = twilioAccountSid();
  const token = twilioAuthToken();
  if (!accountSid || !token || !messageSid) return null;
  try {
    const auth = Buffer.from(`${accountSid}:${token}`).toString('base64');
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${encodeURIComponent(messageSid)}.json`,
      { headers: { Authorization: `Basic ${auth}` } },
    );
    const text = await res.text();
    if (!res.ok) return null;
    const j = JSON.parse(text) as { status?: string; error_code?: string | null; error_message?: string | null };
    return {
      status: String(j.status ?? 'unknown').toLowerCase(),
      errorCode: j.error_code ?? null,
      errorMessage: j.error_message ? String(j.error_message) : undefined,
    };
  } catch {
    return null;
  }
}

export async function sendTwilioSms(params: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; error?: string; sid?: string; status?: string; errorMessage?: string }> {
  const sid = twilioAccountSid();
  const token = twilioAuthToken();
  const messagingServiceSid = twilioMessagingServiceSid();
  const from = twilioFromNumber();
  if (!sid || !token || (!messagingServiceSid && !from)) {
    console.info('[sms] Twilio skipped (missing credentials or sender)', params.to.slice(0, 6));
    return { ok: false, error: 'twilio_not_configured' };
  }
  const to = params.to.replace(/\D/g, '');
  if (to.length < 10) {
    return { ok: false, error: 'invalid_phone' };
  }
  const dest = to.length === 10 ? `+1${to}` : `+${to}`;
  try {
    const auth = Buffer.from(`${sid}:${token}`).toString('base64');
    const fields: Record<string, string> = {
      To: dest,
      Body: params.body.slice(0, 1400),
      StatusCallback: `${appOrigin()}/api/webhooks/twilio`,
    };
    if (messagingServiceSid) {
      fields.MessagingServiceSid = messagingServiceSid;
    } else if (from) {
      fields.From = from;
    }
    const body = new URLSearchParams(fields);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = parseTwilioError(text);
      console.warn('[sms] Twilio HTTP', res.status, err);
      return { ok: false, error: err };
    }
    let messageSid: string | undefined;
    try {
      const j = JSON.parse(text) as { sid?: string };
      messageSid = j.sid;
    } catch {
      /* ignore */
    }
    let deliveryStatus = 'queued';
    let carrierError: string | undefined;
    if (messageSid) {
      const statusRes = await fetchTwilioMessageStatus(messageSid);
      if (statusRes) {
        deliveryStatus = statusRes.status;
        carrierError = statusRes.errorMessage;
      }
    }
    console.info('[sms] Twilio accepted', messageSid ?? 'ok', deliveryStatus, messagingServiceSid ? 'messaging_service' : 'from_number');
    return { ok: true, sid: messageSid, status: deliveryStatus, errorMessage: carrierError };
  } catch (e) {
    console.warn('[sms] Twilio', e);
    return { ok: false, error: e instanceof Error ? e.message : 'network_error' };
  }
}

export { portalButtonHtml };

export async function sendBookingConfirmationEmailIfConfigured(params: {
  to: string;
  guestName: string;
  whenIso: string;
  totalCents: number;
  depositCents: number;
  vehicles: string;
}): Promise<void> {
  const whenLabel = new Date(params.whenIso).toLocaleString();
  const html = bookingConfirmationEmailHtml({
    guestName: params.guestName,
    whenLabel,
    total: `$${(params.totalCents / 100).toFixed(2)}`,
    deposit: `$${(params.depositCents / 100).toFixed(2)}`,
    vehicles: params.vehicles,
  });
  if (!resendConfigured()) {
    console.info('[email] booking confirmation queued (no Resend)', params.to);
    return;
  }
  await sendResendHtml({ to: params.to, subject: 'Gloss Boss ATX — Booking confirmed', html });
}

export async function sendPaymentReceivedEmailIfConfigured(params: {
  to: string;
  guestName: string;
  appointmentId: string;
  whenIso: string;
  totalCents: number;
  paidCents: number;
  isFieldFull: boolean;
}): Promise<void> {
  const whenLabel = new Date(params.whenIso).toLocaleString();
  const kind = params.isFieldFull ? 'Field service payment' : 'Deposit received';
  const html = paymentReceivedEmailHtml({
    guestName: params.guestName,
    whenLabel,
    paid: `$${(params.paidCents / 100).toFixed(2)}`,
    total: `$${(params.totalCents / 100).toFixed(2)}`,
    kindLabel: kind,
  });
  if (!resendConfigured()) {
    console.info('[email] payment receipt skipped (no Resend)', params.to);
    return;
  }
  await sendResendHtml({ to: params.to, subject: `Gloss Boss ATX — ${kind}`, html });
}

export async function sendAccountWelcomeEmailIfConfigured(params: { to: string; name: string }): Promise<void> {
  const html = welcomeEmailHtml({ name: params.name });
  if (!resendConfigured()) {
    console.info('[email] welcome skipped (no Resend)', params.to);
    return;
  }
  await sendResendHtml({ to: params.to, subject: 'Welcome to Gloss Boss ATX', html });
}

export async function sendJobStartedEmailIfConfigured(params: {
  to: string | null | undefined;
  guestName: string;
  serviceLabel: string;
  whenIso: string;
}): Promise<void> {
  const to = String(params.to ?? '').trim().toLowerCase();
  if (!to.includes('@')) {
    console.info('[email] job_started skipped (no customer email)', params.serviceLabel.slice(0, 24));
    return;
  }
  const whenLabel = new Date(params.whenIso).toLocaleString();
  const html = jobStartedEmailHtml({
    guestName: params.guestName,
    serviceLabel: params.serviceLabel,
    whenLabel,
  });
  if (!resendConfigured()) {
    console.info('[email] job_started skipped (no Resend)', to);
    return;
  }
  await sendResendHtml({ to, subject: 'Gloss Boss ATX — Your service has started', html });
}

export async function sendJobCompletedEmailIfConfigured(params: {
  to: string | null | undefined;
  guestName: string;
  serviceLabel: string;
}): Promise<void> {
  const to = String(params.to ?? '').trim().toLowerCase();
  if (!to.includes('@')) {
    console.info('[email] job_completed skipped (no customer email)');
    return;
  }
  const html = jobCompletedEmailHtml({
    guestName: params.guestName,
    serviceLabel: params.serviceLabel,
  });
  if (!resendConfigured()) {
    console.info('[email] job_completed skipped (no Resend)', to);
    return;
  }
  await sendResendHtml({ to, subject: 'Gloss Boss ATX — Service complete', html });
}

const DEFAULT_OWNER_EMAIL = 'glossbossatx1@gmail.com';

export function businessNotifyDestination(): string {
  const a = process.env.CONTACT_NOTIFY_EMAIL?.trim();
  const b = process.env.BUSINESS_NOTIFY_EMAIL?.trim();
  return a || b || DEFAULT_OWNER_EMAIL;
}

export async function sendBusinessNewBookingEmailIfConfigured(params: {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  whenIso: string;
  totalCents: number;
  depositCents: number;
  appointmentId: string;
  vehicles: string;
}): Promise<void> {
  const to = businessNotifyDestination();
  if (!to) {
    console.info('[email] business booking notify skipped (set CONTACT_NOTIFY_EMAIL or BUSINESS_NOTIFY_EMAIL)');
    return;
  }
  if (!resendConfigured()) {
    console.info('[email] business booking notify skipped (Resend not configured)');
    return;
  }
  const whenLabel = new Date(params.whenIso).toLocaleString();
  const inner = `
    <p style="margin:0 0 16px;font-size:15px;color:#fafafa;">New online booking received.</p>
    <div style="border:1px solid #3f3f46;border-radius:10px;padding:16px;">
      <p style="margin:0;font-size:14px;color:#fafafa;"><strong>${params.guestName}</strong></p>
      <p style="margin:8px 0 0;font-size:14px;color:#d4d4d8;">${params.guestEmail} · ${params.guestPhone}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#a1a1aa;">When: ${whenLabel}</p>
      <p style="margin:8px 0 0;font-size:14px;color:#fcd34d;">Total $${(params.totalCents / 100).toFixed(2)} · Deposit $${(params.depositCents / 100).toFixed(2)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">${params.vehicles}</p>
      <p style="margin:8px 0 0;font-size:12px;color:#71717a;font-family:monospace;">Appointment ${params.appointmentId}</p>
    </div>`;
  const html = glossBossEmailLayout({ title: 'New booking', preview: 'New booking', headline: 'New booking', bodyHtml: inner });
  await sendResendHtml({ to, subject: `Gloss Boss ATX — New booking: ${params.guestName}`, html });
}

export async function sendAppointmentReminderIfConfigured(params: { to: string; whenIso: string }): Promise<void> {
  const whenLabel = new Date(params.whenIso).toLocaleString();
  const html = appointmentReminderEmailHtml({ whenLabel });
  if (!resendConfigured()) {
    console.info('[email] reminder skipped (no Resend)', params.to);
    return;
  }
  await sendResendHtml({ to: params.to, subject: 'Gloss Boss ATX — Appointment reminder', html });
}
