import { glossBossEmailShell, bookingConfirmationEmailHtml } from '@/lib/email-brand';
import { parseResendError } from '@/lib/resend-config';
import {
  twilioAccountSid,
  twilioAuthToken,
  twilioFromNumber,
  twilioMessagingServiceSid,
  twilioSenderReady,
} from '@/lib/twilio-config';

export function resendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

export async function sendResendHtml(params: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!key || !from) {
    console.info('[email] Resend skipped (missing RESEND_API_KEY or RESEND_FROM_EMAIL)', params.to);
    return { ok: true };
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
    return { ok: true };
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

export async function sendTwilioSms(params: {
  to: string;
  body: string;
}): Promise<{ ok: boolean; error?: string; sid?: string }> {
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
    console.info('[sms] Twilio sent', messageSid ?? 'ok', messagingServiceSid ? 'messaging_service' : 'from_number');
    return { ok: true, sid: messageSid };
  } catch (e) {
    console.warn('[sms] Twilio', e);
    return { ok: false, error: e instanceof Error ? e.message : 'network_error' };
  }
}

export function portalButtonHtml(origin: string): string {
  const base = origin.replace(/\/$/, '') || 'https://glossbossatx.com';
  const url = `${base}/dashboard`;
  return `<p style="margin:24px 0 0;text-align:center;">
    <a href="${url}" style="display:inline-block;padding:14px 28px;border-radius:10px;background:linear-gradient(90deg,#c9a962,#d4a64d);color:#0a0a0a;font-weight:800;text-decoration:none;text-transform:uppercase;letter-spacing:0.12em;font-size:12px;">Open your dashboard</a>
  </p>`;
}

export async function sendBookingConfirmationEmailIfConfigured(params: {
  to: string;
  guestName: string;
  whenIso: string;
  totalCents: number;
  depositCents: number;
  vehicles: string;
}): Promise<void> {
  const whenLabel = new Date(params.whenIso).toLocaleString();
  const html =
    bookingConfirmationEmailHtml({
      guestName: params.guestName,
      whenLabel,
      total: `$${(params.totalCents / 100).toFixed(2)}`,
      deposit: `$${(params.depositCents / 100).toFixed(2)}`,
      vehicles: params.vehicles,
    }) + portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? '');
  if (!resendConfigured()) {
    console.info('[email] booking confirmation queued (no Resend)', params.to);
    return;
  }
  await sendResendHtml({ to: params.to, subject: 'Gloss Boss ATX — Booking received', html });
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
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#fafafa;">Hi ${params.guestName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">Thank you — ${kind.toLowerCase()} was processed successfully.</p>
    <div style="border:1px solid #3f3f46;border-radius:10px;padding:16px;">
      <p style="margin:0;font-size:14px;color:#fafafa;">Appointment: <strong>${whenLabel}</strong></p>
      <p style="margin:12px 0 0;font-size:14px;color:#fcd34d;">Paid: <strong>$${(params.paidCents / 100).toFixed(2)}</strong></p>
      <p style="margin:8px 0 0;font-size:13px;color:#a1a1aa;">Package total (estimate): $${(params.totalCents / 100).toFixed(2)}</p>
    </div>`;
  const html = glossBossEmailShell({ title: 'Payment confirmation', bodyHtml: body + portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? '') });
  if (!resendConfigured()) {
    console.info('[email] payment receipt skipped (no Resend)', params.to);
    return;
  }
  await sendResendHtml({ to: params.to, subject: `Gloss Boss ATX — ${kind}`, html });
}

export async function sendAccountWelcomeEmailIfConfigured(params: { to: string; name: string }): Promise<void> {
  const body = `
    <div style="text-align:center;margin-bottom:20px;">
      <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.35em;text-transform:uppercase;color:#c9a962;">Gloss Boss ATX</p>
      <p style="margin:8px 0 0;font-size:14px;color:#a1a1aa;">Austin mobile detailing</p>
    </div>
    <p style="margin:0 0 16px;font-size:15px;color:#fafafa;">Hi ${params.name},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">Your customer account is ready. Use the portal to book, pay deposits, complete intake, and track job progress.</p>
    <p style="margin:0;font-size:14px;color:#a1a1aa;">Questions? Reply to this email or call the shop — we’ll take care of your finish.</p>`;
  const html = glossBossEmailShell({ title: 'Welcome aboard', bodyHtml: body + portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? '') });
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
  const inner = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#fafafa;">Hi ${params.guestName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">Your Gloss Boss ATX service has <strong style="color:#fcd34d;">started</strong>.</p>
    <p style="margin:0 0 16px;font-size:14px;color:#a1a1aa;">Service: <strong style="color:#fafafa;">${params.serviceLabel}</strong><br/>Scheduled: ${whenLabel}</p>
    <p style="margin:0;font-size:14px;color:#a1a1aa;">Track live milestones in your customer dashboard anytime.</p>`;
  const html = glossBossEmailShell({
    title: 'Service in progress',
    bodyHtml: inner + portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? ''),
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
  const inner = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#fafafa;">Hi ${params.guestName},</p>
    <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">Your detail is <strong style="color:#6ee7b7;">complete</strong>. Thank you for choosing Gloss Boss ATX.</p>
    <p style="margin:0;font-size:14px;color:#a1a1aa;">Service: <strong style="color:#fafafa;">${params.serviceLabel}</strong></p>
    <p style="margin:16px 0 0;font-size:14px;color:#a1a1aa;">Approved after photos may appear in your dashboard when published.</p>`;
  const html = glossBossEmailShell({
    title: 'Service complete',
    bodyHtml: inner + portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? ''),
  });
  if (!resendConfigured()) {
    console.info('[email] job_completed skipped (no Resend)', to);
    return;
  }
  await sendResendHtml({ to, subject: 'Gloss Boss ATX — Service complete', html });
}

export function businessNotifyDestination(): string | null {
  const a = process.env.CONTACT_NOTIFY_EMAIL?.trim();
  const b = process.env.BUSINESS_NOTIFY_EMAIL?.trim();
  return a || b || null;
}

/** Notify shop owner of a new online booking (Resend only; no-op if destination or API not configured). */
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
  const html = glossBossEmailShell({ title: 'New booking', bodyHtml: inner });
  await sendResendHtml({ to, subject: `Gloss Boss ATX — New booking: ${params.guestName}`, html });
}

export async function sendAppointmentReminderIfConfigured(params: { to: string; whenIso: string }): Promise<void> {
  const whenLabel = new Date(params.whenIso).toLocaleString();
  const inner = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#fafafa;">This is a friendly reminder from Gloss Boss ATX.</p>
    <p style="margin:0 0 16px;font-size:15px;color:#d4d4d8;">You have scheduled service on <strong style="color:#fcd34d;">${whenLabel}</strong>.</p>
    <p style="margin:0;font-size:14px;color:#a1a1aa;">You can review details or rebook anytime from your dashboard.</p>`;
  const html = glossBossEmailShell({
    title: 'Appointment reminder',
    bodyHtml: inner + portalButtonHtml(process.env.NEXT_PUBLIC_APP_URL ?? ''),
  });
  if (!resendConfigured()) {
    console.info('[email] reminder skipped (no Resend)', params.to);
    return;
  }
  await sendResendHtml({ to: params.to, subject: 'Gloss Boss ATX — Appointment reminder', html });
}
