import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAgreementLink } from '@/lib/agreements/send';
import { resolveAgreementSigned } from '@/lib/agreement-signed';
import { loadCadenceRules } from '@/lib/customer-notification-cadence';
import { agreementUrl } from '@/lib/auth/action-link-registry';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

const AGREEMENT_RULES = [
  'agreement_immediate',
  'agreement_24h_before',
  'agreement_2h_before',
  'agreement_60m_before',
] as const;

/**
 * After booking confirmed / paid: enqueue agreement reminder schedule.
 * Stops once signed; skips past appointment start.
 */
export async function enqueueAgreementReminderCadence(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    customerId?: string | null;
    scheduledStart?: string | null;
    accessToken?: string | null;
  },
): Promise<{ ok: boolean; queued: number }> {
  const signed = await resolveAgreementSigned(admin, input.appointmentId, false, null);
  if (signed) return { ok: true, queued: 0 };

  const start = input.scheduledStart ? new Date(input.scheduledStart) : null;
  if (start && start.getTime() <= Date.now()) return { ok: true, queued: 0 };

  const { rules } = await loadCadenceRules(admin);
  const byKey = new Map(rules.map((r) => [r.ruleKey, r]));
  let queued = 0;

  for (const key of AGREEMENT_RULES) {
    const rule = byKey.get(key);
    if (!rule?.enabled) continue;

    let scheduledFor: Date;
    if (key === 'agreement_immediate') {
      scheduledFor = new Date();
    } else if (!start) {
      continue;
    } else {
      const hours = rule.delayHours || (key === 'agreement_24h_before' ? 24 : key === 'agreement_2h_before' ? 2 : 1);
      scheduledFor = new Date(start.getTime() - hours * 3600_000);
    }

    if (scheduledFor.getTime() < Date.now() - 60_000) continue;
    if (start && scheduledFor.getTime() >= start.getTime()) continue;

    const link =
      input.accessToken
        ? agreementUrl({ appointmentId: input.appointmentId, token: input.accessToken })
        : '';

    try {
      // Dedupe: skip if pending identical rule already exists
      const { data: existing } = await admin
        .from('scheduled_messages')
        .select('id')
        .eq('appointment_id', input.appointmentId)
        .eq('rule_key', key)
        .eq('status', 'pending')
        .maybeSingle();
      if (existing?.id) continue;

      const channel = rule.smsEnabled ? 'sms' : rule.emailEnabled ? 'email' : 'sms';
      const { error } = await admin.from('scheduled_messages').insert({
        rule_key: key,
        appointment_id: input.appointmentId,
        customer_id: input.customerId ?? null,
        channel,
        status: 'pending',
        scheduled_for: scheduledFor.toISOString(),
        payload: {
          agreement_link: link,
          sms_template: rule.smsTemplate,
          email_subject: rule.emailSubject,
          email_body: rule.emailBody,
        },
      });
      if (!error) queued += 1;
    } catch (e) {
      console.warn('[agreement-reminders] enqueue', key, e);
    }
  }

  return { ok: true, queued };
}

/** Process due agreement_* scheduled messages by sending the agreement link. */
export async function processDueAgreementReminders(admin: SupabaseClient): Promise<{ sent: number; skipped: number }> {
  const now = new Date().toISOString();
  const { data: due } = await admin
    .from('scheduled_messages')
    .select('*')
    .like('rule_key', 'agreement_%')
    .eq('status', 'pending')
    .lte('scheduled_for', now)
    .limit(50);

  let sent = 0;
  let skipped = 0;

  for (const row of due ?? []) {
    const r = row as Record<string, unknown>;
    const appointmentId = str(r.appointment_id);
    if (!appointmentId) {
      skipped += 1;
      continue;
    }

    const signed = await resolveAgreementSigned(admin, appointmentId, false, null);
    if (signed) {
      await admin.from('scheduled_messages').update({ status: 'canceled', updated_at: now }).eq('id', r.id);
      skipped += 1;
      continue;
    }

    const { data: appt } = await admin
      .from('appointments')
      .select('scheduled_start, status')
      .eq('id', appointmentId)
      .maybeSingle();
    const start = str((appt as { scheduled_start?: string } | null)?.scheduled_start);
    if (start && new Date(start).getTime() <= Date.now()) {
      await admin.from('scheduled_messages').update({ status: 'canceled', updated_at: now }).eq('id', r.id);
      skipped += 1;
      continue;
    }
    if (/cancel/i.test(str((appt as { status?: string } | null)?.status))) {
      await admin.from('scheduled_messages').update({ status: 'canceled', updated_at: now }).eq('id', r.id);
      skipped += 1;
      continue;
    }

    const channelRaw = str(r.channel);
    const channel = channelRaw === 'email' ? 'email' : channelRaw === 'both' ? 'both' : 'sms';
    const result = await sendAgreementLink(admin, { appointmentId, channel, tone: 'professional' });
    await admin
      .from('scheduled_messages')
      .update({
        status: result.ok ? 'sent' : 'failed',
        updated_at: now,
        last_error: result.error ?? null,
      })
      .eq('id', r.id);
    if (result.ok) sent += 1;
    else skipped += 1;
  }

  return { sent, skipped };
}

export async function cancelAgreementRemindersForAppointment(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<void> {
  const now = new Date().toISOString();
  await admin
    .from('scheduled_messages')
    .update({ status: 'canceled', updated_at: now })
    .eq('appointment_id', appointmentId)
    .like('rule_key', 'agreement_%')
    .eq('status', 'pending');
}

export async function rescheduleAgreementReminders(
  admin: SupabaseClient,
  input: { appointmentId: string; scheduledStart: string; customerId?: string | null; accessToken?: string | null },
): Promise<void> {
  await cancelAgreementRemindersForAppointment(admin, input.appointmentId);
  await enqueueAgreementReminderCadence(admin, {
    appointmentId: input.appointmentId,
    customerId: input.customerId,
    scheduledStart: input.scheduledStart,
    accessToken: input.accessToken,
  });
}
