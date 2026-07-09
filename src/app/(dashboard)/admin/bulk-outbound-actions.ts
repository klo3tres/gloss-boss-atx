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

  const search = await searchBulkRecipientsAction({ source: 'all' });
  const selected = search.recipients.filter((r) => input.recipientIds.includes(r.id));
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
      const res = await schedulePreviewedMessageAction({
        channel: input.channel,
        to,
        body: input.body,
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
      const res =
        input.channel === 'sms'
          ? await sendPreviewedSmsAction({
              to,
              body: input.body,
              kind: 'bulk_outbound',
              customerId: r.customerId ?? undefined,
              entityType: r.source,
              entityId: r.id,
            })
          : await sendPreviewedEmailAction({
              to,
              subject: input.subject ?? 'Gloss Boss ATX',
              body: input.body,
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
