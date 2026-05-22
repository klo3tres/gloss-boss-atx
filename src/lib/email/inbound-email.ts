import { createHmac, timingSafeEqual } from 'crypto';
import { GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import type { SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_FORWARD_TO = 'glossbossatx1@gmail.com';

export type ResendInboundWebhookEvent = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    bcc?: string[];
    subject?: string;
    created_at?: string;
  };
};

export type ReceivedEmailContent = {
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string | string[]>;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function inboundMailboxAddress(): string {
  return (process.env.INBOUND_MAILBOX_EMAIL?.trim() || GLOSS_BOSS_SUPPORT_EMAIL).toLowerCase();
}

export function inboundForwardTo(): string {
  return (
    process.env.INBOUND_FORWARD_TO?.trim() ||
    process.env.CONTACT_NOTIFY_EMAIL?.trim() ||
    DEFAULT_FORWARD_TO
  ).toLowerCase();
}

/** Parse "Name <email@x.com>" or bare email. */
export function parseEmailAddress(raw: string): { name: string; email: string } {
  const s = str(raw);
  const angle = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (angle) {
    const name = str(angle[1]).replace(/^["']|["']$/g, '') || angle[2]!.split('@')[0] || 'Sender';
    return { name, email: angle[2]!.trim().toLowerCase() };
  }
  const email = s.toLowerCase();
  return { name: email.split('@')[0] || 'Sender', email };
}

export function eventTargetsMailbox(event: ResendInboundWebhookEvent): boolean {
  const mailbox = inboundMailboxAddress();
  const recipients = [
    ...(event.data?.to ?? []),
    ...(event.data?.cc ?? []),
    ...(event.data?.bcc ?? []),
  ].map((r) => parseEmailAddress(r).email);
  return recipients.some((r) => r === mailbox);
}

/** Optional Svix-style verification (Resend webhooks use Svix). */
export function verifyResendWebhookSignature(
  rawBody: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string | undefined,
): boolean {
  if (!secret?.trim()) return true;
  const id = headers.id;
  const timestamp = headers.timestamp;
  const signatureHeader = headers.signature;
  if (!id || !timestamp || !signatureHeader) return false;

  const secretKey = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let key: Buffer;
  try {
    key = Buffer.from(secretKey, 'base64');
  } catch {
    key = Buffer.from(secretKey, 'utf8');
  }

  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', key).update(signed).digest('base64');

  for (const part of signatureHeader.split(' ')) {
    const [, sig] = part.split(',', 2);
    const candidate = sig?.trim();
    if (!candidate) continue;
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(candidate);
      if (a.length === b.length && timingSafeEqual(a, b)) return true;
    } catch {
      if (candidate === expected) return true;
    }
  }
  return false;
}

export async function fetchReceivedEmailContent(emailId: string): Promise<ReceivedEmailContent | null> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey || !emailId) return null;

  const res = await fetch(`https://api.resend.com/emails/receiving/${encodeURIComponent(emailId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    console.warn('[inbound-email] receiving.get failed', res.status, await res.text().catch(() => ''));
    return null;
  }

  const json = (await res.json()) as Record<string, unknown>;
  return {
    html: typeof json.html === 'string' ? json.html : null,
    text: typeof json.text === 'string' ? json.text : null,
    headers: json.headers && typeof json.headers === 'object' ? (json.headers as Record<string, string | string[]>) : undefined,
  };
}

export async function storeInboundCrmMessage(
  admin: SupabaseClient,
  params: {
    emailId: string;
    fromName: string;
    fromEmail: string;
    subject: string;
    body: string;
    appointmentId?: string | null;
    customerId?: string | null;
  },
): Promise<{ ok: boolean; duplicate?: boolean; error?: string }> {
  const { emailId, fromName, fromEmail, subject, body, appointmentId, customerId } = params;

  const { data: existing } = await admin
    .from('messages')
    .select('id')
    .eq('inbound_email_id', emailId)
    .maybeSingle();
  if (existing?.id) return { ok: true, duplicate: true };

  const attempts: Record<string, unknown>[] = [
    {
      from_name: fromName,
      from_email: fromEmail,
      subject,
      body,
      message: body,
      status: 'new',
      direction: 'inbound',
      source: 'inbound_email',
      inbound_email_id: emailId,
      appointment_id: appointmentId ?? null,
      customer_id: customerId ?? null,
    },
    {
      from_name: fromName,
      from_email: fromEmail,
      subject,
      body,
      message: body,
      status: 'new',
      inbound_email_id: emailId,
      appointment_id: appointmentId ?? null,
    },
    {
      from_name: fromName,
      from_email: fromEmail,
      subject,
      body,
      message: body,
      status: 'new',
    },
  ];

  let lastErr: string | null = null;
  for (const row of attempts) {
    const { error } = await admin.from('messages').insert(row);
    if (!error) return { ok: true };
    lastErr = error.message;
    if (!isSchemaDriftError(error.message)) break;
  }

  return { ok: false, error: lastErr ?? 'insert failed' };
}

export async function forwardInboundToGmail(params: {
  fromName: string;
  fromEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  originalTo: string;
}): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  const to = inboundForwardTo();
  if (!apiKey || !from) {
    console.warn('[inbound-email] forward skipped — RESEND_API_KEY or RESEND_FROM_EMAIL missing');
    return { sent: false, error: 'resend_not_configured' };
  }

  const subjectLine = `[Inbox ${params.originalTo}] ${params.subject || '(no subject)'}`;
  const text = [
    `Inbound to ${params.originalTo}`,
    `From: ${params.fromName} <${params.fromEmail}>`,
    '',
    params.bodyText || '(empty body)',
  ].join('\n');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        reply_to: params.fromEmail,
        subject: subjectLine,
        text,
        html: params.bodyHtml?.trim()
          ? `<p><strong>Inbound to ${params.originalTo}</strong></p><p>From: ${params.fromName} &lt;${params.fromEmail}&gt;</p><hr/>${params.bodyHtml}`
          : undefined,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[inbound-email] forward failed', res.status, errText);
      return { sent: false, error: errText };
    }
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'forward failed';
    console.error('[inbound-email] forward', e);
    return { sent: false, error: msg };
  }
}

export async function resolveCustomerContext(
  admin: SupabaseClient,
  fromEmail: string,
): Promise<{ customerId: string | null; appointmentId: string | null }> {
  const email = fromEmail.toLowerCase();
  const { data: cust } = await admin.from('customers').select('id').eq('email', email).maybeSingle();
  const customerId = cust?.id ? String(cust.id) : null;

  const { data: appt } = await admin
    .from('appointments')
    .select('id')
    .eq('guest_email', email)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    customerId,
    appointmentId: appt?.id ? String(appt.id) : null,
  };
}

export async function processInboundEmailEvent(
  admin: SupabaseClient,
  event: ResendInboundWebhookEvent,
): Promise<{ stored: boolean; forwarded: boolean; skipped?: string }> {
  if (event.type !== 'email.received' || !event.data?.email_id) {
    return { stored: false, forwarded: false, skipped: 'not_email_received' };
  }

  if (!eventTargetsMailbox(event)) {
    return { stored: false, forwarded: false, skipped: 'not_target_mailbox' };
  }

  const emailId = str(event.data.email_id);
  const { name: fromName, email: fromEmail } = parseEmailAddress(str(event.data.from));
  const subject = str(event.data.subject) || '(no subject)';

  const content = await fetchReceivedEmailContent(emailId);
  const bodyText =
    str(content?.text) ||
    (content?.html ? content.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '') ||
    '(Message body could not be loaded — see Resend dashboard.)';

  const { customerId, appointmentId } = await resolveCustomerContext(admin, fromEmail);

  const store = await storeInboundCrmMessage(admin, {
    emailId,
    fromName,
    fromEmail,
    subject,
    body: bodyText,
    customerId,
    appointmentId,
  });

  const forward = await forwardInboundToGmail({
    fromName,
    fromEmail,
    subject,
    bodyText,
    bodyHtml: content?.html,
    originalTo: inboundMailboxAddress(),
  });

  return {
    stored: store.ok,
    forwarded: forward.sent,
    skipped: store.duplicate ? 'duplicate' : undefined,
  };
}
