import type { SupabaseClient } from '@supabase/supabase-js';
import { glossBossEmailLayout } from '@/lib/email/templates/layout';
import { sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';
import { SMS_STOP_FOOTER } from '@/lib/sms-consent';

export type CadenceRuleKey =
  | 'welcome_booking'
  | 'appointment_reminder_24h'
  | 'appointment_enroute_2h'
  | 'post_service_thank_you'
  | 'post_service_referral'
  | 'post_service_review'
  | 'rebook_14d'
  | 'rebook_45d_exterior'
  | 'rebook_60d_detail'
  | 'rebook_90d_ceramic';

export type CadenceRule = {
  ruleKey: CadenceRuleKey | string;
  label: string;
  enabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  delayHours: number;
  delayDays: number;
  serviceTypeFilter: string | null;
  smsTemplate: string;
  emailSubject: string;
  emailBody: string;
  sortOrder: number;
};

export type CadenceVars = {
  customer?: string;
  vehicle?: string;
  time?: string;
  address?: string;
  book_link?: string;
  portal_link?: string;
  referral_link?: string;
  review_link?: string;
};

const BOOK_LINK = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com').replace(/\/$/, '') + '/book';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /notification_cadence|scheduled_messages|schema cache|does not exist/i.test(message);
}

export function renderCadenceTemplate(template: string, vars: CadenceVars): string {
  let out = template;
  for (const [key, val] of Object.entries(vars)) {
    out = out.replaceAll(`{{${key}}}`, val ?? '');
  }
  return out;
}

export function appendSmsCompliance(body: string): string {
  const trimmed = body.trim();
  if (/reply\s+stop/i.test(trimmed)) return trimmed;
  return `${trimmed} ${SMS_STOP_FOOTER}`.trim();
}

function mapRule(row: Record<string, unknown>): CadenceRule {
  return {
    ruleKey: str(row.rule_key),
    label: str(row.label) || str(row.rule_key),
    enabled: Boolean(row.enabled),
    smsEnabled: Boolean(row.sms_enabled),
    emailEnabled: Boolean(row.email_enabled),
    delayHours: Number(row.delay_hours ?? 0) || 0,
    delayDays: Number(row.delay_days ?? 0) || 0,
    serviceTypeFilter: str(row.service_type_filter) || null,
    smsTemplate: str(row.sms_template),
    emailSubject: str(row.email_subject),
    emailBody: str(row.email_body),
    sortOrder: Number(row.sort_order ?? 0) || 0,
  };
}

export async function loadCadenceRules(admin: SupabaseClient): Promise<{ rules: CadenceRule[]; tablesReady: boolean }> {
  const probe = await admin.from('notification_cadence_rules').select('rule_key').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return { rules: [], tablesReady: false };
  const { data } = await admin.from('notification_cadence_rules').select('*').order('sort_order', { ascending: true });
  return { rules: (data ?? []).map((r) => mapRule(r as Record<string, unknown>)), tablesReady: true };
}

export async function saveCadenceRule(
  admin: SupabaseClient,
  rule: CadenceRule,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin.from('notification_cadence_rules').upsert(
    {
      rule_key: rule.ruleKey,
      label: rule.label,
      enabled: rule.enabled,
      sms_enabled: rule.smsEnabled,
      email_enabled: rule.emailEnabled,
      delay_hours: rule.delayHours,
      delay_days: rule.delayDays,
      service_type_filter: rule.serviceTypeFilter,
      sms_template: rule.smsTemplate,
      email_subject: rule.emailSubject,
      email_body: rule.emailBody,
      sort_order: rule.sortOrder,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'rule_key' },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export function pickRebookRuleKey(serviceSlug: string): CadenceRuleKey {
  const s = serviceSlug.toLowerCase();
  if (s.includes('ceramic') || s.includes('coating') || s.includes('protection')) return 'rebook_90d_ceramic';
  if (s.includes('full') || s.includes('interior')) return 'rebook_60d_detail';
  if (s.includes('exterior') || s.includes('wash')) return 'rebook_45d_exterior';
  return 'rebook_14d';
}

export async function scheduleCadenceMessage(
  admin: SupabaseClient,
  input: {
    ruleKey: string;
    channel: 'sms' | 'email';
    recipient: string;
    body: string;
    subject?: string;
    scheduledFor: string;
    customerId?: string | null;
    appointmentId?: string | null;
    opportunityId?: string | null;
    entityType?: string;
    entityId?: string;
    createdBy?: string | null;
  },
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const probe = await admin.from('scheduled_messages').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return { ok: false, error: 'scheduled_messages table missing — run migration 000120' };

  const { data, error } = await admin
    .from('scheduled_messages')
    .insert({
      rule_key: input.ruleKey,
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject ?? null,
      body: input.body,
      scheduled_for: input.scheduledFor,
      customer_id: input.customerId ?? null,
      appointment_id: input.appointmentId ?? null,
      opportunity_id: input.opportunityId ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      created_by: input.createdBy ?? null,
      status: 'scheduled',
    })
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data?.id ? String(data.id) : undefined };
}

export async function enqueuePostServiceCadence(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    customerId?: string | null;
    customerName: string;
    customerEmail?: string | null;
    customerPhone?: string | null;
    serviceSlug: string;
    referralLink?: string | null;
    reviewLink?: string | null;
    portalLink?: string | null;
  },
): Promise<void> {
  const { rules } = await loadCadenceRules(admin);
  if (!rules.length) return;

  const vars: CadenceVars = {
    customer: input.customerName || 'there',
    book_link: BOOK_LINK,
    portal_link: input.portalLink ?? BOOK_LINK,
    referral_link: input.referralLink ?? BOOK_LINK,
    review_link: input.reviewLink ?? BOOK_LINK,
  };

  const postKeys: CadenceRuleKey[] = ['post_service_thank_you', 'post_service_referral', 'post_service_review'];
  const now = Date.now();

  for (const key of postKeys) {
    const rule = rules.find((r) => r.ruleKey === key && r.enabled);
    if (!rule) continue;
    const due = new Date(now + rule.delayHours * 3600000 + rule.delayDays * 86400000).toISOString();

    if (rule.smsEnabled && input.customerPhone) {
      await scheduleCadenceMessage(admin, {
        ruleKey: key,
        channel: 'sms',
        recipient: input.customerPhone,
        body: appendSmsCompliance(renderCadenceTemplate(rule.smsTemplate, vars)),
        scheduledFor: due,
        customerId: input.customerId,
        appointmentId: input.appointmentId,
      });
    }
    if (rule.emailEnabled && input.customerEmail?.includes('@')) {
      await scheduleCadenceMessage(admin, {
        ruleKey: key,
        channel: 'email',
        recipient: input.customerEmail,
        subject: renderCadenceTemplate(rule.emailSubject, vars),
        body: renderCadenceTemplate(rule.emailBody, vars),
        scheduledFor: due,
        customerId: input.customerId,
        appointmentId: input.appointmentId,
      });
    }
  }

  const rebookKey = pickRebookRuleKey(input.serviceSlug);
  const rebookRule = rules.find((r) => r.ruleKey === rebookKey && r.enabled);
  if (rebookRule) {
    const due = new Date(now + rebookRule.delayDays * 86400000 + rebookRule.delayHours * 3600000).toISOString();
    if (rebookRule.smsEnabled && input.customerPhone) {
      await scheduleCadenceMessage(admin, {
        ruleKey: rebookKey,
        channel: 'sms',
        recipient: input.customerPhone,
        body: appendSmsCompliance(renderCadenceTemplate(rebookRule.smsTemplate, vars)),
        scheduledFor: due,
        customerId: input.customerId,
        appointmentId: input.appointmentId,
      });
    }
  }
}

export async function processDueScheduledMessages(admin: SupabaseClient): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const probe = await admin.from('scheduled_messages').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return { sent: 0, skipped: 0, failed: 0 };

  const now = new Date().toISOString();
  const { data } = await admin
    .from('scheduled_messages')
    .select('*')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now)
    .order('scheduled_for', { ascending: true })
    .limit(50);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const id = str(r.id);
    const channel = str(r.channel);
    const recipient = str(r.recipient);
    const body = str(r.body);
    const subject = str(r.subject);
    const customerId = str(r.customer_id) || null;
    const appointmentId = str(r.appointment_id) || null;
    const ruleKey = str(r.rule_key) || 'scheduled';
    const attemptCount = Number(r.attempt_count ?? 0) + 1;
    await admin.from('scheduled_messages').update({ status: 'sending', attempt_count: attemptCount, last_attempt_at: now, updated_at: now }).eq('id', id);

    if (!recipient || !body) {
      await admin.from('scheduled_messages').update({ status: 'skipped', skipped_reason: 'Missing recipient or body', updated_at: now }).eq('id', id);
      skipped++;
      continue;
    }

    try {
      if (channel === 'sms') {
        const res = await sendCustomerSms({
          db: admin,
          kind: ruleKey,
          to: recipient,
          body,
          customer_id: customerId,
          appointment_id: appointmentId,
          template_key: ruleKey,
        });
        if (res.ok) {
          await admin.from('scheduled_messages').update({ status: 'sent', sent_at: now, provider: 'twilio', provider_message_id: res.sid ?? null, updated_at: now }).eq('id', id);
          sent++;
        } else if (res.skipped) {
          await admin.from('scheduled_messages').update({ status: 'skipped', skipped_reason: res.error ?? 'skipped', updated_at: now }).eq('id', id);
          skipped++;
        } else {
          await admin.from('scheduled_messages').update({ status: 'failed', skipped_reason: res.error ?? 'send failed', updated_at: now }).eq('id', id);
          failed++;
        }
      } else {
        const html = glossBossEmailLayout({
          title: subject || 'Gloss Boss ATX',
          bodyHtml: body.replace(/\n/g, '<br/>'),
        });
        const res = await sendResendHtml({ to: recipient, subject: subject || 'Gloss Boss ATX', html });
        if (res.ok) {
          await admin.from('scheduled_messages').update({ status: 'sent', sent_at: now, provider: 'resend', provider_message_id: res.emailId ?? null, updated_at: now }).eq('id', id);
          sent++;
        } else {
          await admin.from('scheduled_messages').update({ status: 'failed', skipped_reason: res.error ?? 'email failed', updated_at: now }).eq('id', id);
          failed++;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await admin.from('scheduled_messages').update({ status: 'failed', skipped_reason: msg, updated_at: now }).eq('id', id);
      failed++;
    }
  }

  return { sent, skipped, failed };
}

async function enqueueRuleMessages(
  admin: SupabaseClient,
  ruleKey: CadenceRuleKey | string,
  input: {
    customerId?: string | null;
    appointmentId?: string | null;
    opportunityId?: string | null;
    customerName: string;
    customerPhone?: string | null;
    customerEmail?: string | null;
    vars?: CadenceVars;
    scheduledFor?: string;
    createdBy?: string | null;
  },
): Promise<void> {
  const { rules } = await loadCadenceRules(admin);
  const rule = rules.find((r) => r.ruleKey === ruleKey && r.enabled);
  if (!rule) return;

  const vars: CadenceVars = {
    customer: input.customerName || 'there',
    book_link: BOOK_LINK,
    portal_link: BOOK_LINK,
    ...input.vars,
  };
  const due =
    input.scheduledFor ??
    new Date(Date.now() + rule.delayHours * 3600000 + rule.delayDays * 86400000).toISOString();

  if (rule.smsEnabled && input.customerPhone) {
    await scheduleCadenceMessage(admin, {
      ruleKey,
      channel: 'sms',
      recipient: input.customerPhone,
      body: appendSmsCompliance(renderCadenceTemplate(rule.smsTemplate, vars)),
      scheduledFor: due,
      customerId: input.customerId,
      appointmentId: input.appointmentId,
      opportunityId: input.opportunityId,
      createdBy: input.createdBy,
    });
  }
  if (rule.emailEnabled && input.customerEmail?.includes('@')) {
    await scheduleCadenceMessage(admin, {
      ruleKey,
      channel: 'email',
      recipient: input.customerEmail,
      subject: renderCadenceTemplate(rule.emailSubject, vars),
      body: renderCadenceTemplate(rule.emailBody, vars),
      scheduledFor: due,
      customerId: input.customerId,
      appointmentId: input.appointmentId,
      opportunityId: input.opportunityId,
      createdBy: input.createdBy,
    });
  }
}

export async function enqueueWelcomeCadence(
  admin: SupabaseClient,
  input: {
    customerId?: string | null;
    appointmentId?: string | null;
    customerName: string;
    customerPhone?: string | null;
    customerEmail?: string | null;
    portalLink?: string | null;
    whenLabel?: string | null;
    address?: string | null;
  },
): Promise<void> {
  await enqueueRuleMessages(admin, 'welcome_booking', {
    customerId: input.customerId,
    appointmentId: input.appointmentId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    vars: {
      portal_link: input.portalLink ?? BOOK_LINK,
      time: input.whenLabel ?? '',
      address: input.address ?? '',
    },
  });
}

export async function enqueueEnrouteCadence(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    customerId?: string | null;
    customerName: string;
    customerPhone?: string | null;
    customerEmail?: string | null;
    scheduledStart: string;
  },
): Promise<void> {
  const apptTime = new Date(input.scheduledStart).getTime();
  const twoHoursBefore = apptTime - 2 * 3600000;
  const scheduledFor = new Date(Math.max(Date.now(), twoHoursBefore)).toISOString();

  const { data: existing } = await admin
    .from('scheduled_messages')
    .select('id')
    .eq('appointment_id', input.appointmentId)
    .eq('rule_key', 'appointment_enroute_2h')
    .in('status', ['scheduled', 'sent'])
    .limit(1);
  if ((existing ?? []).length > 0) return;

  const time = new Date(input.scheduledStart).toLocaleString('en-US', { timeZone: 'America/Chicago' });
  await enqueueRuleMessages(admin, 'appointment_enroute_2h', {
    appointmentId: input.appointmentId,
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    scheduledFor,
    vars: { time },
  });
}

export async function processAppointmentReminders(admin: SupabaseClient): Promise<{ sent: number; skipped: number }> {
  const { rules, tablesReady } = await loadCadenceRules(admin);
  if (!tablesReady) return { sent: 0, skipped: 0 };

  const rule24 = rules.find((r) => r.ruleKey === 'appointment_reminder_24h' && r.enabled);
  if (!rule24) return { sent: 0, skipped: 0 };

  const windowStart = new Date(Date.now() + 23 * 3600000).toISOString();
  const windowEnd = new Date(Date.now() + 25 * 3600000).toISOString();

  const { data: appts } = await admin
    .from('appointments')
    .select('id, guest_name, guest_email, guest_phone, scheduled_start, service_address, service_city, customer_id, service_slug')
    .gte('scheduled_start', windowStart)
    .lte('scheduled_start', windowEnd)
    .not('status', 'in', '("cancelled","completed")')
    .limit(100);

  let sent = 0;
  let skipped = 0;

  for (const appt of appts ?? []) {
    const a = appt as Record<string, unknown>;
    const name = str(a.guest_name) || 'there';
    const time = new Date(str(a.scheduled_start)).toLocaleString('en-US', { timeZone: 'America/Chicago' });
    const address = [a.service_address, a.service_city].filter(Boolean).join(', ');
    const vars: CadenceVars = { customer: name, time, address, book_link: BOOK_LINK };

    if (rule24.smsEnabled && str(a.guest_phone)) {
      const res = await sendCustomerSms({
        db: admin,
        kind: 'appointment_reminder_24h',
        to: str(a.guest_phone),
        body: appendSmsCompliance(renderCadenceTemplate(rule24.smsTemplate, vars)),
        appointment_id: str(a.id),
        customer_id: str(a.customer_id) || null,
        template_key: 'appointment_reminder_24h',
      });
      if (res.ok) sent++;
      else skipped++;
    }
  }

  return { sent, skipped };
}
