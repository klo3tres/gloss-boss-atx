import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { resolveOwnerNotifyContact } from '@/lib/owner-contact';
import type { SupabaseClient } from '@supabase/supabase-js';
export async function notifyOwnerLeadHighConfidence(
  admin: SupabaseClient | null,
  input: { authorName?: string | null; sourceType: string; rawPreview: string; confidence: number },
) {
  const contact = await resolveOwnerNotifyContact(admin);
  const preview = input.rawPreview.slice(0, 120);
  const title = input.authorName?.trim() || 'New high-confidence lead';

  if (contact.email && resendConfigured()) {
    await sendResendHtml({
      to: contact.email,
      subject: `Gloss Boss — Lead Radar: ${title}`,
      html: `<p>High-confidence lead (${input.confidence}%) from ${input.sourceType}.</p><p>${preview}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ''}/admin/titan/lead-radar">Open Lead Radar</a></p>`,
    });
  }

  if (contact.phone) {
    await sendCustomerSms({
      db: admin,
      kind: 'owner_lead_alert',
      template_key: 'owner_lead_alert',
      to: contact.phone,
      body: `Gloss Boss Lead Radar (${input.confidence}%): ${title}. ${preview}`,
      requireConsent: false,
    });
  }
}

export async function sendTestOwnerEmail(admin: SupabaseClient | null): Promise<{ ok: boolean; error?: string }> {
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
