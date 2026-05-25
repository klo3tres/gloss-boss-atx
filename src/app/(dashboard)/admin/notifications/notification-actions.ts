'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
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
    await admin.from('notification_outbox').insert({
      kind: 'test_send',
      channel: 'sms',
      status: res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed',
      error_message: res.error ?? null,
      skipped_reason: res.skipped ? 'provider_not_configured' : null,
      payload: { to },
      created_at: new Date().toISOString(),
    });
    return {
      message: res.ok
        ? `SMS sent (${res.sid ?? 'ok'}).`
        : res.skipped
          ? `SMS skipped: ${res.error ?? 'Twilio not configured'}.`
          : `SMS failed: ${res.error ?? 'unknown'}`,
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
  const html = glossBossEmailLayout({
    title: 'Test',
    preview: 'Test',
    headline: 'Test message',
    bodyHtml: `<p style="color:#fafafa;font-size:15px;">${body.replace(/</g, '&lt;')}</p>`,
  });
  const sent = await sendResendHtml({ to, subject, html });
  await admin.from('notification_outbox').insert({
    kind: 'test_send',
    channel: 'email',
    provider: 'resend',
    status: sent.ok ? 'sent' : 'failed',
    error_message: sent.ok ? null : sent.error ?? 'failed',
    payload: { to },
    created_at: new Date().toISOString(),
  });
  return { message: sent.ok ? `Email sent to ${to}.` : `Email failed: ${sent.error ?? 'unknown'}` };
}
