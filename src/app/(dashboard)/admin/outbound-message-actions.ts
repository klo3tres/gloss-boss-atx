'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';

export async function logOutboundMessage(
  admin: SupabaseClient,
  row: {
    kind: string;
    channel: 'sms' | 'email';
    status: string;
    body: string;
    recipient: string;
    subject?: string | null;
    provider?: string | null;
    provider_message_id?: string | null;
    error_message?: string | null;
    appointment_id?: string | null;
    customer_id?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
  },
) {
  const now = new Date().toISOString();
  try {
    await admin.from('notification_outbox').insert({
      kind: row.kind,
      channel: row.channel,
      status: row.status,
      provider: row.provider ?? (row.channel === 'email' ? 'resend' : 'twilio'),
      provider_message_id: row.provider_message_id ?? null,
      error_message: row.error_message ?? null,
      appointment_id: row.appointment_id ?? null,
      customer_id: row.customer_id ?? null,
      subject: row.subject ?? null,
      sent_at: row.status === 'sent' || row.status === 'delivered' ? now : null,
      payload: {
        to: row.recipient,
        body: row.body,
        body_preview: row.body.slice(0, 500),
        entity_type: row.entity_type ?? null,
        entity_id: row.entity_id ?? null,
      },
      created_at: now,
    });
  } catch (e) {
    console.warn('[outbound-message] log failed', e);
  }
}

async function requireStaffAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function sendPreviewedSmsAction(input: {
  to: string;
  body: string;
  kind: string;
  templateKey?: string;
  appointmentId?: string;
  customerId?: string;
  entityType?: string;
  entityId?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const { sendCustomerSms } = await import('@/lib/sms-send');
  const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
  const sent = await sendCustomerSms({
    db: gate.admin,
    kind: input.kind,
    to: input.to,
    body: input.body,
    template_key: input.templateKey,
    appointment_id: input.appointmentId ?? null,
    customer_id: input.customerId ?? null,
    requireConsent: false,
    extraPayload: { entity_type: input.entityType, entity_id: input.entityId },
  });

  await logOutboundMessage(gate.admin, {
    kind: input.kind,
    channel: 'sms',
    status: sent.ok ? 'sent' : sent.skipped ? 'skipped' : 'failed',
    body: input.body,
    recipient: input.to,
    provider_message_id: sent.sid ?? null,
    error_message: sent.error ?? null,
    appointment_id: input.appointmentId ?? null,
    customer_id: input.customerId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });

  if (!sent.ok) {
    void emitOwnerNotification(gate.admin, {
      eventType: 'delivery_failed',
      title: 'SMS delivery failed',
      body: `To ${input.to}: ${sent.error ?? 'unknown error'}`,
      source: 'outbox',
      priority: 'high',
      bypassQuietHours: true,
    });
    return { error: sent.error ?? 'SMS failed' };
  }
  return { ok: true };
}

export async function sendPreviewedEmailAction(input: {
  to: string;
  subject: string;
  body: string;
  kind: string;
  appointmentId?: string;
  customerId?: string;
  entityType?: string;
  entityId?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
  const { glossBossEmailLayout } = await import('@/lib/email/templates/layout');

  let status = 'skipped';
  let err: string | null = null;
  let providerId: string | null = null;

  if (resendConfigured()) {
    const html = glossBossEmailLayout({
      title: input.subject,
      bodyHtml: `<p style="color:#e4e4e7;font-size:15px;line-height:1.6;white-space:pre-wrap">${input.body.replace(/</g, '&lt;')}</p>`,
    });
    const sent = await sendResendHtml({ to: input.to, subject: input.subject, html });
    status = sent.ok ? 'sent' : 'failed';
    err = sent.ok ? null : sent.error ?? 'send failed';
    providerId = sent.emailId ?? null;
  } else {
    err = 'Resend not configured';
  }

  await logOutboundMessage(gate.admin, {
    kind: input.kind,
    channel: 'email',
    status,
    body: input.body,
    subject: input.subject,
    recipient: input.to,
    provider_message_id: providerId,
    error_message: err,
    appointment_id: input.appointmentId ?? null,
    customer_id: input.customerId ?? null,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
  });

  if (status !== 'sent') return { error: err ?? 'Email failed' };
  return { ok: true };
}

export async function schedulePreviewedMessageAction(input: {
  channel: 'sms' | 'email';
  to: string;
  body: string;
  subject?: string;
  kind: string;
  scheduledFor: string;
  appointmentId?: string;
  customerId?: string;
  opportunityId?: string;
  entityType?: string;
  entityId?: string;
}): Promise<{ ok?: boolean; error?: string; scheduledId?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const scheduledFor = new Date(input.scheduledFor);
  if (Number.isNaN(scheduledFor.getTime())) return { error: 'Invalid schedule time.' };
  if (scheduledFor.getTime() < Date.now() - 60_000) return { error: 'Schedule time must be in the future.' };

  const { scheduleCadenceMessage } = await import('@/lib/customer-notification-cadence');
  const body =
    input.channel === 'sms'
      ? (await import('@/lib/customer-notification-cadence')).appendSmsCompliance(input.body)
      : input.body;

  const res = await scheduleCadenceMessage(gate.admin, {
    ruleKey: input.kind,
    channel: input.channel,
    recipient: input.to,
    body,
    subject: input.subject,
    scheduledFor: scheduledFor.toISOString(),
    customerId: input.customerId ?? null,
    appointmentId: input.appointmentId ?? null,
    opportunityId: input.opportunityId ?? null,
    entityType: input.entityType ?? undefined,
    entityId: input.entityId ?? undefined,
  });

  if (!res.ok) return { error: res.error ?? 'Schedule failed' };
  return { ok: true, scheduledId: res.id };
}
