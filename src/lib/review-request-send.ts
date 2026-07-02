import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';
import { glossBossEmailLayout, emailParagraph, emailCtaButton, escapeEmailHtml } from '@/lib/email/templates/layout';
import { resolveGoogleReviewUrl } from '@/lib/site-defaults';

export async function sendReviewRequest(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ email: string; sms: string }> {
  const { data: appt } = await admin
    .from('appointments')
    .select('guest_name, guest_email, guest_phone, service_slug')
    .eq('id', appointmentId)
    .maybeSingle();
  if (!appt) return { email: 'skipped', sms: 'skipped' };

  const name = String(appt.guest_name ?? 'Customer');
  const email = String(appt.guest_email ?? '');
  const phone = String(appt.guest_phone ?? '');

  let reviewUrl = '';
  const ss = await admin.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle();
  const raw = ss.data?.value;
  if (typeof raw === 'string' && raw.startsWith('http')) reviewUrl = raw;
  else if (raw && typeof raw === 'object') {
    const u = (raw as { review_url?: string; url?: string }).review_url ?? (raw as { url?: string }).url;
    if (typeof u === 'string') reviewUrl = u;
  }
  if (!reviewUrl) reviewUrl = resolveGoogleReviewUrl('');

  const subject = 'How did we do? Leave a Google review';
  const smsBody = `Gloss Boss ATX — Thanks ${name}! We'd love your Google review: ${reviewUrl}`;
  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(name)},`, false) +
    emailParagraph('Your detail is complete. If you loved the finish, a quick Google review helps Gloss Boss ATX grow.', true) +
    (reviewUrl ? emailCtaButton(reviewUrl, 'Leave a Google review') : emailParagraph('Reply to this email and we will send your review link.', true));

  let emailStatus = 'skipped';
  let smsStatus = 'skipped';

  if (email.includes('@') && resendConfigured()) {
    const sent = await sendResendHtml({
      to: email,
      subject,
      html: glossBossEmailLayout({ title: subject, preview: subject, headline: 'Thank you!', bodyHtml }),
    });
    emailStatus = sent.ok ? 'sent' : 'failed';
  }

  if (phone) {
    const sms = await sendCustomerSms({
      db: admin,
      kind: 'review_request',
      template_key: 'review_request',
      to: phone,
      appointment_id: appointmentId,
      body: smsBody,
      requireConsent: false,
    });
    smsStatus = sms.skipped ? 'skipped' : sms.ok ? 'sent' : 'failed';
  }

  await emitOwnerNotification(admin, {
    eventType: emailStatus === 'failed' || smsStatus === 'failed' ? 'delivery_failed' : 'work_order_completed',
    title: 'Review request sent',
    body: `${name} · email ${emailStatus} · SMS ${smsStatus}`,
    source: 'review_request',
    relatedType: 'appointment',
    relatedId: appointmentId,
    relatedUrl: `/admin/work-orders/${appointmentId}?shell=admin`,
  });

  return { email: emailStatus, sms: smsStatus };
}
