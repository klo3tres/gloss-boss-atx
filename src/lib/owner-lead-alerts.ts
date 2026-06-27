import type { SupabaseClient } from '@supabase/supabase-js';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';

export async function notifyOwnerLeadHighConfidence(
  admin: SupabaseClient | null,
  input: { authorName?: string | null; sourceType: string; rawPreview: string; confidence: number },
) {
  const preview = input.rawPreview.slice(0, 120);
  const title = input.authorName?.trim() || 'New high-confidence lead';
  const appBase = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '');

  await emitOwnerNotification(admin, {
    eventType: 'high_confidence_lead',
    title: `Lead Radar: ${title}`,
    body: `${input.confidence}% confidence from ${input.sourceType}. ${preview}`,
    source: 'lead_radar',
    priority: 'high',
    relatedType: 'lead_radar',
    relatedUrl: `${appBase}/admin/titan/lead-radar`,
  });
}

export async function sendTestOwnerEmail(admin: SupabaseClient | null): Promise<{ ok: boolean; error?: string }> {
  const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
  const { resolveOwnerNotifyContact } = await import('@/lib/owner-contact');
  const contact = await resolveOwnerNotifyContact(admin);
  if (!contact.email) return { ok: false, error: 'No owner email configured.' };
  if (!resendConfigured()) return { ok: false, error: 'Resend not configured.' };
  const res = await sendResendHtml({
    to: contact.email,
    subject: 'Gloss Boss ATX — Test owner alert',
    html: '<p>This is a test owner notification from Setup Center.</p>',
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

export async function sendTestOwnerSms(admin: SupabaseClient | null): Promise<{ ok: boolean; error?: string; skipped?: string }> {
  const { sendCustomerSms } = await import('@/lib/sms-send');
  const { resolveOwnerNotifyContact } = await import('@/lib/owner-contact');
  const contact = await resolveOwnerNotifyContact(admin);
  if (!contact.phone) return { ok: false, error: 'No owner phone configured.' };
  const sms = await sendCustomerSms({
    db: admin,
    kind: 'owner_test',
    template_key: 'owner_test',
    to: contact.phone,
    body: 'Gloss Boss ATX test — owner SMS alerts are working.',
    requireConsent: false,
  });
  if (sms.skipped) return { ok: false, skipped: sms.error ?? 'Twilio not configured' };
  if (!sms.ok) return { ok: false, error: sms.error };
  return { ok: true };
}
