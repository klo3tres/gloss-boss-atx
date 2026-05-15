/**
 * Optional outbound email for contact form via Resend HTTP API.
 * Set RESEND_API_KEY + RESEND_FROM_EMAIL in .env.local (from must be verified on Resend for production).
 */

const DEFAULT_TO = 'glossbossatx1@gmail.com';

export type ContactNotifyPayload = {
  fromName: string;
  fromEmail: string;
  subject: string | null;
  body: string;
};

export async function notifyBusinessOfContactMessage(payload: ContactNotifyPayload): Promise<{ sent: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim() ?? 'onboarding@resend.dev';
  const to = process.env.CONTACT_NOTIFY_EMAIL?.trim() ?? DEFAULT_TO;

  if (!apiKey) {
    console.warn(
      '[Gloss Boss ATX] RESEND_API_KEY not set — contact message stored in Supabase only. Add RESEND_API_KEY to send email to the shop.'
    );
    return { sent: false };
  }

  const subjectLine = payload.subject?.trim() ? `[Contact] ${payload.subject.trim()}` : '[Contact] New message from website';

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
        reply_to: payload.fromEmail,
        subject: subjectLine,
        text: `From: ${payload.fromName} <${payload.fromEmail}>\n\n${payload.body}`,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[contact-notify] Resend error', res.status, errText);
      return { sent: false, error: errText };
    }

    return { sent: true };
  } catch (e) {
    console.error('[contact-notify]', e);
    return { sent: false, error: e instanceof Error ? e.message : 'send failed' };
  }
}
