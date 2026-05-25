'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { countNotificationTemplates, upsertNotificationTemplate } from '@/lib/notification-template-db';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return admin;
}

export async function saveNotificationTemplateAction(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const id = String(formData.get('id') ?? '').trim();
  const key = String(formData.get('key') ?? '').trim();
  const channel = String(formData.get('channel') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const subject = String(formData.get('subject') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  const enabled = String(formData.get('enabled') ?? '') === 'on';
  if (!key || !channel || !name || !body) return;

  const row = {
    template_key: key,
    channel,
    name,
    subject: subject || null,
    body,
    enabled,
    variables: ['customer', 'vehicle', 'service', 'tech', 'address', 'appointment_time', 'payment_link', 'review_link'],
    updated_at: new Date().toISOString(),
  };
  if (id) {
    await admin.from('notification_templates').update(row).eq('id', id);
  } else {
    await admin.from('notification_templates').insert(row);
  }
  revalidatePath('/admin/notifications');
}

export async function testNotificationSendAction(formData: FormData): Promise<{ message: string }> {
  const admin = await requireAdmin();
  if (!admin) return { message: 'Unauthorized' };

  const channel = String(formData.get('channel') ?? 'email').trim();
  const to = String(formData.get('to') ?? '').trim();
  const subject = String(formData.get('subject') ?? 'Gloss Boss ATX test').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!to || !body) return { message: 'To and body are required.' };

  if (channel === 'sms') {
    const { sendCustomerSms } = await import('@/lib/sms-send');
    const res = await sendCustomerSms({
      db: admin,
      kind: 'test_send',
      template_key: 'test_send',
      to,
      body,
    });
    const deliveryNote = res.deliveryStatus ? ` (${res.deliveryStatus})` : '';
    const carrierNote = res.carrierError ? ` — ${res.carrierError}` : '';
    const outboxStatus = res.ok
      ? res.deliveryStatus === 'delivered'
        ? 'delivered'
        : 'sent'
      : res.skipped
        ? 'skipped'
        : 'failed';
    await admin.from('notification_outbox').insert({
      kind: 'test_send',
      channel: 'sms',
      provider: 'twilio',
      status: outboxStatus,
      provider_message_id: res.sid ?? null,
      error_message: res.error ?? res.carrierError ?? null,
      skipped_reason: res.skipped ? 'provider_not_configured' : null,
      payload: { to, delivery_status: res.deliveryStatus, carrier_error: res.carrierError },
      created_at: new Date().toISOString(),
    });
    return {
      message: res.ok
        ? `SMS accepted${deliveryNote}${carrierNote} — not marked delivered until carrier confirms.`
        : res.skipped
          ? `SMS skipped: ${res.error ?? 'Twilio not configured'}.`
          : `SMS failed: ${res.error ?? 'unknown'}${carrierNote}`,
    };
  }

  const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
  const { glossBossEmailLayout } = await import('@/lib/email/templates/layout');
  if (!resendConfigured()) {
    await admin.from('notification_outbox').insert({
      kind: 'test_send',
      channel: 'email',
      status: 'skipped',
      skipped_reason: 'Resend not configured',
      payload: { to },
      created_at: new Date().toISOString(),
    });
    return { message: 'Email skipped — set RESEND_API_KEY and RESEND_FROM_EMAIL.' };
  }
  const { GLOSS_BOSS_SUPPORT_EMAIL } = await import('@/lib/branding');
  const html = glossBossEmailLayout({
    title: subject,
    preview: 'Gloss Boss ATX — test notification',
    headline: 'Test notification',
    bodyHtml: `
      <p style="color:#fafafa;font-size:15px;">This is a branded test from the Gloss Boss ATX notification center.</p>
      <p style="color:#d4d4d8;font-size:14px;margin-top:16px;">${body.replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>
      <p style="color:#a1a1aa;font-size:13px;margin-top:24px;">Purpose: verify layout, logo, and delivery before customer-facing sends.</p>
      <p style="color:#a1a1aa;font-size:13px;">Support: ${GLOSS_BOSS_SUPPORT_EMAIL}</p>`,
  });
  const sent = await sendResendHtml({ to, subject, html });
  const fromEmail = process.env.RESEND_FROM_EMAIL?.trim() ?? '';
  await admin.from('notification_outbox').insert({
    kind: 'test_send',
    channel: 'email',
    provider: 'resend',
    status: sent.ok ? 'sent' : 'failed',
    subject,
    provider_message_id: sent.emailId ?? null,
    error_message: sent.ok ? null : sent.error ?? 'failed',
    payload: { to, from: fromEmail, subject },
    created_at: new Date().toISOString(),
  });
  return { message: sent.ok ? `Email sent to ${to}.` : `Email failed: ${sent.error ?? 'unknown'}` };
}

export async function installAllNotificationDefaultsAction(): Promise<{ message: string; ok: boolean }> {
  const admin = await requireAdmin();
  if (!admin) return { ok: false, message: 'Unauthorized' };

  const defaults: Array<[string, string, string, string, string]> = [
    ['booking_confirmation', 'email', 'Booking Confirmation', 'Gloss Boss ATX: Appointment confirmed', 'Your appointment is confirmed for {{appointment_time}}.'],
    ['booking_reminder', 'sms', 'Booking Reminder', '', 'Reminder: Gloss Boss ATX at {{appointment_time}} for {{vehicle}}.'],
    ['admin_new_booking', 'sms', 'Admin New Booking', '', 'New booking {{customer}} {{appointment_time}} Total {{payment_link}}'],
    ['job_started', 'sms', 'Job Started', '', 'Your {{service}} has started for {{vehicle}}.'],
    ['technician_en_route', 'sms', 'Technician En Route', '', 'Gloss Boss ATX: Your technician is on the way for {{appointment_time}}.'],
    ['pay_balance', 'sms', 'Pay Balance', '', 'Balance due: {{payment_link}}'],
    ['invoice_receipt', 'email', 'Invoice / Receipt', 'Your Gloss Boss ATX receipt', 'Receipt for {{service}} — {{payment_link}}'],
    ['review_request', 'sms', 'Review Request', '', 'Thanks! Leave a review: {{review_link}}'],
    ['account_claim', 'email', 'Account Claim', 'Claim your booking', 'Claim your booking: {{payment_link}}'],
    ['reschedule_cancel', 'sms', 'Reschedule / Cancel', '', 'Appointment update for {{appointment_time}}.'],
  ];

  const errors: string[] = [];
  let saved = 0;
  for (const [key, channel, name, subject, body] of defaults) {
    const res = await upsertNotificationTemplate(admin, {
      template_key: key,
      channel,
      name,
      subject: subject || null,
      body,
      enabled: true,
    });
    if (res.ok) saved += 1;
    else if (res.error) errors.push(`${key}/${channel}: ${res.error}`);
  }

  const total = await countNotificationTemplates(admin);
  revalidatePath('/admin/notifications');

  if (saved === 0 && errors.length > 0) {
    return { ok: false, message: `Install failed — ${errors[0]}` };
  }
  if (total === 0) {
    return { ok: false, message: 'No templates in database after install. Apply migration 000059_qa_hard_fix.sql.' };
  }
  return {
    ok: true,
    message: `Installed/updated ${saved} template(s). ${total} row(s) now in notification_templates.${errors.length ? ` Warnings: ${errors.slice(0, 2).join('; ')}` : ''}`,
  };
}
