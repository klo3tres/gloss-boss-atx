import type { SupabaseClient } from '@supabase/supabase-js';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { referralLinkForCode } from '@/lib/referral/referral-codes';
import { emitOwnerNotification } from '@/lib/titan/owner-notification-router';
import { glossBossEmailLayout, emailParagraph, emailCtaButton, escapeEmailHtml } from '@/lib/email/templates/layout';

export type ReferralNotificationKind =
  | 'your_referral_link'
  | 'someone_booked'
  | 'reward_earned'
  | 'progress_update';

export async function sendReferralNotification(
  admin: SupabaseClient,
  input: {
    kind: ReferralNotificationKind;
    customerId: string;
    referralCode?: string;
    rewardLabel?: string;
    completedCount?: number;
    threshold?: number;
    referredName?: string;
  },
): Promise<void> {
  const { data: cust } = await admin.from('customers').select('email, phone, full_name').eq('id', input.customerId).maybeSingle();
  if (!cust) return;

  const name = String(cust.full_name ?? 'Customer');
  const email = String(cust.email ?? '');
  const phone = String(cust.phone ?? '');
  const code = input.referralCode ?? '';
  const link = code ? referralLinkForCode(code) : '';

  let subject = 'Gloss Boss ATX — Referral update';
  let smsBody = '';
  let bodyHtml = '';

  switch (input.kind) {
    case 'your_referral_link':
      subject = 'Your Gloss Boss referral link';
      smsBody = `Gloss Boss ATX — Share your referral link and earn rewards: ${link}`;
      bodyHtml =
        emailParagraph(`Hi ${escapeEmailHtml(name)},`, false) +
        emailParagraph('Share your personal referral link. When friends book and complete, you unlock Gloss Boss rewards.', true) +
        emailCtaButton(link, 'Copy & share your link');
      break;
    case 'someone_booked':
      subject = 'Someone booked with your referral!';
      smsBody = `Gloss Boss ATX — Great news! ${input.referredName ?? 'A friend'} booked using your referral link.`;
      bodyHtml =
        emailParagraph(`Hi ${escapeEmailHtml(name)},`, false) +
        emailParagraph(`${escapeEmailHtml(input.referredName ?? 'Someone')} just booked using your referral link.`, true);
      break;
    case 'reward_earned':
      subject = 'You earned a Gloss Boss reward!';
      smsBody = `Gloss Boss ATX — You earned a reward: ${input.rewardLabel ?? 'Referral reward'}. View in your dashboard.`;
      bodyHtml =
        emailParagraph(`Hi ${escapeEmailHtml(name)},`, false) +
        emailParagraph(`You earned: <strong style="color:#fcd34d;">${escapeEmailHtml(input.rewardLabel ?? 'Referral reward')}</strong>`, true);
      break;
    case 'progress_update':
      subject = 'Referral progress update';
      smsBody = `Gloss Boss ATX — You're ${input.completedCount ?? 0} of ${input.threshold ?? 5} referrals toward your next reward.`;
      bodyHtml =
        emailParagraph(`Hi ${escapeEmailHtml(name)},`, false) +
        emailParagraph(`You're ${input.completedCount ?? 0} referrals away from your next reward (goal: ${input.threshold ?? 5}).`, true);
      break;
  }

  let emailStatus = 'skipped';
  let smsStatus = 'skipped';

  if (email.includes('@') && resendConfigured()) {
    const sent = await sendResendHtml({
      to: email,
      subject,
      html: glossBossEmailLayout({ title: subject, preview: subject, headline: 'Referral rewards', bodyHtml }),
    });
    emailStatus = sent.ok ? 'sent' : 'failed';
  }

  if (phone) {
    const sms = await sendCustomerSms({
      db: admin,
      kind: 'referral',
      template_key: input.kind,
      to: phone,
      body: smsBody,
      requireConsent: false,
      extraPayload: { referral_code: code, link },
    });
    smsStatus = sms.skipped ? 'skipped' : sms.ok ? 'sent' : 'failed';
  }

  await emitOwnerNotification(admin, {
    eventType: emailStatus === 'failed' || smsStatus === 'failed' ? 'delivery_failed' : 'new_booking',
    title: `Referral: ${input.kind.replace(/_/g, ' ')}`,
    body: `${name} · email ${emailStatus} · SMS ${smsStatus}`,
    source: 'referral_program',
    relatedType: 'customer',
    relatedId: input.customerId,
    relatedUrl: `/admin/referrals`,
  });

  try {
    await admin.from('notification_outbox').insert({
      kind: `referral_${input.kind}`,
      channel: 'multi',
      provider: 'resend',
      status: emailStatus === 'failed' || smsStatus === 'failed' ? 'failed' : 'sent',
      template_key: input.kind,
      payload: { customer_id: input.customerId, referral_code: code, link },
      created_at: new Date().toISOString(),
    });
  } catch {
    /* best-effort */
  }
}
