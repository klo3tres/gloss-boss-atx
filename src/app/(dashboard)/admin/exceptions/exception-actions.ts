'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { logExceptionAction } from '@/lib/business-exception-sync';
import { findAndRepairAllDuplicatePayments } from '@/lib/payment-duplicate-repair';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { managePaymentAction } from '@/app/(dashboard)/admin/revenue/actions';

async function requireStaffAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { session, admin };
}

function revalidateOpsPaths() {
  revalidatePath('/admin');
  revalidatePath('/admin/exceptions');
  revalidatePath('/admin/daily-operations');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/notifications');
}

export async function dismissExceptionAction(
  fingerprint: string,
  note?: string,
  snoozeDays?: number,
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  const fp = String(fingerprint ?? '').trim();
  if (!fp) return { error: 'Missing fingerprint' };

  const snoozeUntil =
    snoozeDays && snoozeDays > 0
      ? new Date(Date.now() + snoozeDays * 86400000).toISOString()
      : null;

  const { error } = await gate.admin.from('exception_dismissals').upsert(
    {
      fingerprint: fp,
      dismissed_by: gate.session.user!.id,
      note: note?.trim() || null,
      snooze_until: snoozeUntil,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'fingerprint' },
  );
  if (error) return { error: error.message };

  await logExceptionAction(gate.admin, gate.session.user!.id, fp, 'dismiss', { note, snoozeDays });
  revalidateOpsPaths();
  return { ok: true };
}

export async function repairDuplicatePaymentsInboxAction(): Promise<{
  ok?: boolean;
  error?: string;
  repaired?: number;
}> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await findAndRepairAllDuplicatePayments(gate.admin);
  await logExceptionAction(gate.admin, gate.session.user!.id, null, 'repair_duplicates', result);
  revalidateOpsPaths();
  if (result.errors.length > 0) {
    return { error: result.errors.slice(0, 2).join('; '), repaired: result.groupsRepaired };
  }
  return { ok: true, repaired: result.groupsRepaired };
}

export async function excludePaymentInboxAction(paymentId: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  const id = String(paymentId ?? '').trim();
  if (!id) return { error: 'Missing payment id' };

  const res = await managePaymentAction(id, 'exclude', 'payments');
  if (res.error) return { error: res.error };

  await logExceptionAction(gate.admin, gate.session.user!.id, `payment:excluded:${id}`, 'exclude_payment', { paymentId: id });
  revalidateOpsPaths();
  return { ok: true };
}

export async function retryNotificationInboxAction(outboxId: string): Promise<{ ok?: boolean; error?: string; message?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  const id = String(outboxId ?? '').trim();
  if (!id) return { error: 'Missing outbox id' };

  const { data: row, error } = await gate.admin.from('notification_outbox').select('*').eq('id', id).maybeSingle();
  if (error || !row) return { error: error?.message ?? 'Notification not found' };

  const channel = String(row.channel ?? 'email').toLowerCase();
  const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>;
  const to = String(payload.to ?? payload.destination_e164 ?? payload.phone ?? '').trim();
  const body = String(payload.body ?? payload.message ?? row.error_message ?? '').trim();
  const subject = String(row.subject ?? payload.subject ?? 'Gloss Boss ATX update').trim();

  if (!to) return { error: 'No recipient stored on this notification — open the work order and resend manually.' };

  if (channel === 'sms') {
    const { sendCustomerSms } = await import('@/lib/sms-send');
    const res = await sendCustomerSms({
      db: gate.admin,
      kind: String(row.kind ?? 'retry'),
      template_key: String(row.kind ?? 'retry'),
      to,
      body: body || 'Gloss Boss ATX: Please contact us if you need assistance with your appointment.',
      appointment_id: row.appointment_id ? String(row.appointment_id) : null,
    });
    await gate.admin.from('notification_outbox').insert({
      kind: String(row.kind ?? 'retry'),
      channel: 'sms',
      provider: 'twilio',
      status: res.ok ? 'sent' : res.skipped ? 'skipped' : 'failed',
      appointment_id: row.appointment_id ?? null,
      error_message: res.error ?? null,
      skipped_reason: res.skipped ? 'provider_not_configured' : null,
      payload: { to, retry_of: id },
      created_at: new Date().toISOString(),
    });
    if (!res.ok) return { error: res.error ?? 'SMS retry failed' };
    await logExceptionAction(gate.admin, gate.session.user!.id, `notify:${id}`, 'retry_notification', { outboxId: id });
    revalidateOpsPaths();
    return { ok: true, message: 'SMS retry sent.' };
  }

  const { getResendEnvStatus, sendResendHtml } = await import('@/lib/email-send');
  const { glossBossEmailLayout } = await import('@/lib/email/templates/layout');
  const env = getResendEnvStatus();
  if (!env.ready) return { error: `Email not configured: ${env.missing.join(', ')}` };

  const html = glossBossEmailLayout({
    title: subject,
    preview: subject,
    headline: subject,
    bodyHtml: `<p style="color:#fafafa;font-size:15px;">${(body || 'Gloss Boss ATX notification retry.').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`,
  });
  const sent = await sendResendHtml({ to, subject, html });
  await gate.admin.from('notification_outbox').insert({
    kind: String(row.kind ?? 'retry'),
    channel: 'email',
    provider: 'resend',
    status: sent.ok ? 'sent' : 'failed',
    subject,
    appointment_id: row.appointment_id ?? null,
    error_message: sent.ok ? null : sent.error ?? 'failed',
    payload: { to, retry_of: id },
    created_at: new Date().toISOString(),
  });
  if (!sent.ok) return { error: sent.error ?? 'Email retry failed' };

  await logExceptionAction(gate.admin, gate.session.user!.id, `notify:${id}`, 'retry_notification', { outboxId: id });
  revalidateOpsPaths();
  return { ok: true, message: 'Email retry sent.' };
}

export async function sendFollowUpInboxAction(input: {
  fingerprint: string;
  email?: string;
  phone?: string;
  customerName?: string;
}): Promise<{ ok?: boolean; error?: string; message?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const name = String(input.customerName ?? 'there').trim() || 'there';
  const smsBody = `Hi ${name}, it's Gloss Boss ATX. It's been a while since your last detail — reply to book your next appointment or visit glossbossatx.com/book.`;
  const emailSubject = 'Time for your next Gloss Boss detail?';
  const emailBody = `Hi ${name},\n\nWe noticed it's been a while since your last Gloss Boss ATX service. We'd love to get you back on the schedule.\n\nBook online: https://glossbossatx.com/book\n\n— Gloss Boss ATX`;

  const phone = String(input.phone ?? '').trim();
  const email = String(input.email ?? '').trim();

  if (phone) {
    const { sendCustomerSms } = await import('@/lib/sms-send');
    const res = await sendCustomerSms({
      db: gate.admin,
      kind: 'follow_up',
      template_key: 'follow_up',
      to: phone,
      body: smsBody,
    });
    if (!res.ok) return { error: res.error ?? 'SMS follow-up failed' };
  } else if (email) {
    const { sendResendHtml } = await import('@/lib/email-send');
    const { glossBossEmailLayout } = await import('@/lib/email/templates/layout');
    const html = glossBossEmailLayout({
      title: emailSubject,
      preview: emailSubject,
      headline: emailSubject,
      bodyHtml: `<p style="color:#fafafa;font-size:15px;">${emailBody.replace(/\n/g, '<br/>')}</p>`,
    });
    const sent = await sendResendHtml({ to: email, subject: emailSubject, html });
    if (!sent.ok) return { error: sent.error ?? 'Email follow-up failed' };
  } else {
    return { error: 'No email or phone available for follow-up.' };
  }

  await logExceptionAction(gate.admin, gate.session.user!.id, input.fingerprint, 'send_followup', input);
  revalidateOpsPaths();
  return { ok: true, message: 'Follow-up sent.' };
}

export async function createOfferFromInboxAction(input: {
  fingerprint: string;
  customerId?: string;
  email?: string;
}): Promise<{ ok?: boolean; error?: string; href?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  await logExceptionAction(gate.admin, gate.session.user!.id, input.fingerprint, 'create_offer', input);
  const href = input.customerId
    ? `/admin/customers/${input.customerId}?tab=credits`
    : input.email
      ? `/admin/promotions?search=${encodeURIComponent(input.email)}`
      : '/admin/promotions';
  revalidateOpsPaths();
  return { ok: true, href };
}
