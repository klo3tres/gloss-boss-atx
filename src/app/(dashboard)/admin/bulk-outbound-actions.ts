'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { customerCanReceiveSms } from '@/lib/sms-consent';
import { sendPreviewedEmailAction, sendPreviewedSmsAction } from './outbound-message-actions';

export type BulkRecipient = {
  id: string;
  label: string;
  phone: string | null;
  email: string | null;
  source: 'customer' | 'opportunity' | 'lead';
  customerId?: string | null;
  canSms: boolean;
  canEmail: boolean;
  smsBlocker?: string;
};

async function requireStaff() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { admin };
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function resolveBulkRecipientsByIds(admin: NonNullable<Awaited<ReturnType<typeof requireStaff>>>['admin'], ids: string[]) {
  const customerIds = ids.filter((id) => id.startsWith('customer-')).map((id) => id.slice(9)).filter(Boolean);
  const opportunityIds = ids.filter((id) => id.startsWith('opp-')).map((id) => id.slice(4)).filter(Boolean);
  const recipients: BulkRecipient[] = [];
  if (customerIds.length) {
    const { data } = await admin.from('customers').select('id, full_name, email, phone, email_marketing_opt_in').in('id', customerIds);
    for (const raw of data ?? []) {
      const row = raw as Record<string, unknown>;
      const phone = str(row.phone) || null;
      const email = str(row.email) || null;
      const smsCheck = phone ? await customerCanReceiveSms(admin, { customerId: str(row.id), phone }) : { ok: false, reason: 'No phone' };
      recipients.push({
        id: `customer-${str(row.id)}`,
        label: str(row.full_name) || email || phone || 'Customer',
        phone,
        email,
        source: 'customer',
        customerId: str(row.id),
        canSms: smsCheck.ok,
        canEmail: Boolean(email?.includes('@') && row.email_marketing_opt_in !== false),
        smsBlocker: smsCheck.ok ? undefined : smsCheck.reason,
      });
    }
  }
  if (opportunityIds.length) {
    const { data } = await admin.from('titan_opportunities').select('id, title, author_name, contact_phone, contact_email, status').in('id', opportunityIds);
    for (const raw of data ?? []) {
      const row = raw as Record<string, unknown>;
      if (['booked', 'lost', 'ignored', 'dismissed', 'won'].includes(str(row.status))) continue;
      const phone = str(row.contact_phone) || null;
      const email = str(row.contact_email) || null;
      const smsCheck = phone ? await customerCanReceiveSms(admin, { phone }) : { ok: false, reason: 'No phone' };
      recipients.push({
        id: `opp-${str(row.id)}`,
        label: str(row.author_name) || str(row.title) || 'Lead',
        phone,
        email,
        source: 'opportunity',
        canSms: smsCheck.ok,
        canEmail: Boolean(email?.includes('@')),
        smsBlocker: smsCheck.ok ? undefined : smsCheck.reason,
      });
    }
  }
  return recipients;
}

export async function searchBulkRecipientsAction(input: {
  query?: string;
  source?: 'customers' | 'opportunities' | 'all';
}): Promise<{ recipients: BulkRecipient[]; error?: string }> {
  const gate = await requireStaff();
  if (!gate) return { recipients: [], error: 'Unauthorized' };

  const q = str(input.query).toLowerCase();
  const source = input.source ?? 'all';
  const recipients: BulkRecipient[] = [];

  if (source === 'customers' || source === 'all') {
    let query = gate.admin.from('customers').select('id, full_name, email, phone, sms_consent, sms_status, email_marketing_opt_in').limit(40);
    if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`);
    const { data } = await query.order('updated_at', { ascending: false });
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const phone = str(r.phone) || null;
      const email = str(r.email) || null;
      const smsCheck = phone
        ? await customerCanReceiveSms(gate.admin, { customerId: str(r.id), phone })
        : { ok: false, reason: 'No phone' };
      recipients.push({
        id: `customer-${str(r.id)}`,
        label: str(r.full_name) || email || phone || 'Customer',
        phone,
        email,
        source: 'customer',
        customerId: str(r.id),
        canSms: smsCheck.ok,
        canEmail: Boolean(email?.includes('@') && r.email_marketing_opt_in !== false),
        smsBlocker: smsCheck.ok ? undefined : smsCheck.reason,
      });
    }
  }

  if (source === 'opportunities' || source === 'all') {
    let query = gate.admin
      .from('titan_opportunities')
      .select('id, title, author_name, contact_phone, contact_email, status')
      .not('status', 'in', '("booked","lost","ignored","won")')
      .limit(40);
    if (q) query = query.or(`title.ilike.%${q}%,author_name.ilike.%${q}%,contact_phone.ilike.%${q}%,contact_email.ilike.%${q}%`);
    const { data } = await query.order('updated_at', { ascending: false });
    for (const row of data ?? []) {
      const r = row as Record<string, unknown>;
      const phone = str(r.contact_phone) || null;
      const email = str(r.contact_email) || null;
      const smsCheck = phone ? await customerCanReceiveSms(gate.admin, { phone }) : { ok: false, reason: 'No phone' };
      recipients.push({
        id: `opp-${str(r.id)}`,
        label: `${str(r.author_name) || str(r.title) || 'Lead'}`,
        phone,
        email,
        source: 'opportunity',
        canSms: smsCheck.ok,
        canEmail: Boolean(email?.includes('@')),
        smsBlocker: smsCheck.ok ? undefined : smsCheck.reason,
      });
    }
  }

  return { recipients };
}

export async function sendBulkOutboundAction(input: {
  recipientIds: string[];
  channel: 'sms' | 'email';
  body: string;
  subject?: string;
  scheduledFor?: string;
}): Promise<{ ok?: boolean; sent: number; skipped: number; errors: string[] }> {
  const gate = await requireStaff();
  if (!gate) return { sent: 0, skipped: 0, errors: ['Unauthorized'] };

  const resolved = await resolveBulkRecipientsByIds(gate.admin, [...new Set(input.recipientIds)].slice(0, 500));
  const seenDestinations = new Set<string>();
  const selected = resolved.filter((recipient) => {
    const raw = input.channel === 'sms' ? recipient.phone : recipient.email;
    const normalized = input.channel === 'sms' ? str(raw).replace(/\D/g, '').slice(-10) : str(raw).toLowerCase();
    if (!normalized || seenDestinations.has(normalized)) return false;
    seenDestinations.add(normalized);
    return true;
  });
  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (input.scheduledFor) {
    const { schedulePreviewedMessageAction } = await import('./outbound-message-actions');
    for (const r of selected) {
      const to = input.channel === 'sms' ? r.phone : r.email;
      if (!to) {
        skipped++;
        errors.push(`${r.label}: no ${input.channel} address`);
        continue;
      }
      if (input.channel === 'sms' && !r.canSms) {
        skipped++;
        errors.push(`${r.label}: ${r.smsBlocker ?? 'SMS blocked'}`);
        continue;
      }
      if (input.channel === 'email' && !r.canEmail) {
        skipped++;
        errors.push(`${r.label}: email not available`);
        continue;
      }
      const personalizedBody = input.body
        .replace(/\{\{customer\}\}/gi, r.label)
        .replace(/\{\{first_name\}\}/gi, r.label.split(/\s+/)[0] || r.label);
      const res = await schedulePreviewedMessageAction({
        channel: input.channel,
        to,
        body: personalizedBody,
        subject: input.subject,
        kind: 'bulk_outbound',
        scheduledFor: input.scheduledFor,
        customerId: r.customerId ?? undefined,
        entityType: r.source,
        entityId: r.id,
      });
      if (res.error) {
        skipped++;
        errors.push(`${r.label}: ${res.error}`);
      } else sent++;
    }
  } else {
    for (const r of selected) {
      const to = input.channel === 'sms' ? r.phone : r.email;
      if (!to) {
        skipped++;
        continue;
      }
      if (input.channel === 'sms' && !r.canSms) {
        skipped++;
        errors.push(`${r.label}: ${r.smsBlocker ?? 'SMS blocked'}`);
        continue;
      }
      if (input.channel === 'email' && !r.canEmail) {
        skipped++;
        continue;
      }
      const personalizedBody = input.body
        .replace(/\{\{customer\}\}/gi, r.label)
        .replace(/\{\{first_name\}\}/gi, r.label.split(/\s+/)[0] || r.label);
      const res =
        input.channel === 'sms'
          ? await sendPreviewedSmsAction({
              to,
              body: personalizedBody,
              kind: 'bulk_outbound',
              customerId: r.customerId ?? undefined,
              entityType: r.source,
              entityId: r.id,
            })
          : await sendPreviewedEmailAction({
              to,
              subject: input.subject ?? 'Gloss Boss ATX',
              body: personalizedBody,
              kind: 'bulk_outbound',
              customerId: r.customerId ?? undefined,
              entityType: r.source,
              entityId: r.id,
            });
      if (res.error) {
        skipped++;
        errors.push(`${r.label}: ${res.error}`);
      } else sent++;
    }
  }

  revalidatePath('/admin/notifications');
  return { ok: sent > 0, sent, skipped, errors };
}

export async function sendBulkTestToOwnerAction(input: {
  channel: 'sms' | 'email';
  body: string;
  subject?: string;
}): Promise<{ ok?: boolean; error?: string; destination?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };
  if (!input.body.trim()) return { error: 'Write the message before sending a test.' };
  if (input.channel === 'sms') {
    const { businessNotifyPhone } = await import('@/lib/business-booking-notify');
    const { sendCustomerSms } = await import('@/lib/sms-send');
    const to = businessNotifyPhone();
    if (!to) return { error: 'Add the owner notification phone in Settings first.' };
    const sent = await sendCustomerSms({
      db: gate.admin,
      kind: 'bulk_outbound_owner_test',
      template_key: 'bulk_outbound_owner_test',
      to,
      body: `[TEST — NOT A CAMPAIGN]\n${input.body}`,
      requireConsent: false,
      extraPayload: { test_send: true },
    });
    return sent.ok ? { ok: true, destination: `phone ending ${to.replace(/\D/g, '').slice(-4)}` } : { error: sent.error ?? 'Test SMS failed.' };
  }
  const { businessNotifyDestination, sendResendHtml } = await import('@/lib/email-send');
  const to = businessNotifyDestination();
  if (!to) return { error: 'Add the owner notification email in Settings first.' };
  const subject = `[TEST] ${input.subject?.trim() || 'Gloss Boss ATX campaign'}`;
  const safeBody = input.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
  const sent = await sendResendHtml({ to, subject, html: `<p><strong>Campaign test — no customer received this.</strong></p><p>${safeBody}</p>` });
  await gate.admin.from('notification_outbox').insert({
    kind: 'bulk_outbound_owner_test', channel: 'email', provider: 'resend', status: sent.ok ? 'sent' : 'failed',
    subject, provider_message_id: sent.emailId ?? null, error_message: sent.error ?? null,
    payload: { to, body: input.body, subject, test_send: true, resend_email_id: sent.emailId ?? null }, created_at: new Date().toISOString(),
  });
  return sent.ok ? { ok: true, destination: to.replace(/(^.).*(@.*$)/, '$1***$2') } : { error: sent.error ?? 'Test email failed.' };
}
