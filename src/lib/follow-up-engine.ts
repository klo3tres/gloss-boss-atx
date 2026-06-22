import type { SupabaseClient } from '@supabase/supabase-js';
import { glossBossEmailLayout, emailCtaButton } from '@/lib/email/templates/layout';
import { sendResendHtml } from '@/lib/email-send';
import { sendCustomerSms } from '@/lib/sms-send';

export type FollowUpTier = 30 | 60 | 90;
export type FollowUpStatus = 'pending' | 'sent' | 'skipped' | 'cancelled' | 'failed';

export type FollowUpSetting = {
  tier: FollowUpTier;
  enabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  smsTemplate: string;
  emailSubject: string;
  emailBody: string;
  promoCode: string | null;
};

export type CustomerFollowUpRow = {
  id: string;
  fingerprint: string;
  customerId: string | null;
  appointmentId: string | null;
  tier: FollowUpTier;
  dueAt: string;
  status: FollowUpStatus;
  channel: string | null;
  sentAt: string | null;
  skippedReason: string | null;
  snoozedUntil: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  vehicleDescription: string | null;
  createdAt: string;
};

export type FollowUpDashboard = {
  pending: number;
  dueToday: number;
  sentWeek: number;
  failed: number;
  queue: CustomerFollowUpRow[];
  recentRuns: Array<{
    id: string;
    startedAt: string;
    finishedAt: string | null;
    enqueuedCount: number;
    sentCount: number;
    skippedCount: number;
    failedCount: number;
    errorMessage: string | null;
  }>;
  settings: FollowUpSetting[];
  tablesReady: boolean;
};

const TIERS: FollowUpTier[] = [30, 60, 90];
const BOOK_LINK = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://glossbossatx.com/book';

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function isMissingTable(message: string) {
  return /follow_up|customer_follow|schema cache|does not exist|Could not find/i.test(message);
}

function mapSetting(row: Record<string, unknown>): FollowUpSetting {
  return {
    tier: Number(row.tier) as FollowUpTier,
    enabled: Boolean(row.enabled),
    smsEnabled: Boolean(row.sms_enabled),
    emailEnabled: Boolean(row.email_enabled),
    smsTemplate: str(row.sms_template),
    emailSubject: str(row.email_subject),
    emailBody: str(row.email_body),
    promoCode: str(row.promo_code) || null,
  };
}

function mapFollowUp(row: Record<string, unknown>): CustomerFollowUpRow {
  return {
    id: str(row.id),
    fingerprint: str(row.fingerprint),
    customerId: str(row.customer_id) || null,
    appointmentId: str(row.appointment_id) || null,
    tier: Number(row.tier) as FollowUpTier,
    dueAt: str(row.due_at),
    status: str(row.status) as FollowUpStatus,
    channel: str(row.channel) || null,
    sentAt: str(row.sent_at) || null,
    skippedReason: str(row.skipped_reason) || null,
    snoozedUntil: str(row.snoozed_until) || null,
    customerName: str(row.customer_name) || null,
    customerEmail: str(row.customer_email) || null,
    customerPhone: str(row.customer_phone) || null,
    vehicleDescription: str(row.vehicle_description) || null,
    createdAt: str(row.created_at),
  };
}

function renderTemplate(
  template: string,
  vars: { customer: string; vehicle: string; bookLink: string; promo: string },
) {
  return template
    .replaceAll('{{customer}}', vars.customer)
    .replaceAll('{{vehicle}}', vars.vehicle)
    .replaceAll('{{book_link}}', vars.bookLink)
    .replaceAll('{{promo}}', vars.promo);
}

export async function loadFollowUpSettings(admin: SupabaseClient): Promise<FollowUpSetting[]> {
  const probe = await admin.from('follow_up_settings').select('tier').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return [];

  const { data } = await admin.from('follow_up_settings').select('*').order('tier', { ascending: true });
  return (data ?? []).map((row) => mapSetting(row as Record<string, unknown>));
}

export async function loadFollowUpDashboard(admin: SupabaseClient): Promise<FollowUpDashboard> {
  const probe = await admin.from('customer_follow_ups').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return {
      pending: 0,
      dueToday: 0,
      sentWeek: 0,
      failed: 0,
      queue: [],
      recentRuns: [],
      settings: [],
      tablesReady: false,
    };
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString();

  const [settings, queueRes, pendingRes, dueTodayRes, sentWeekRes, failedRes, runsRes] = await Promise.all([
    loadFollowUpSettings(admin),
    admin
      .from('customer_follow_ups')
      .select('*')
      .in('status', ['pending', 'failed'])
      .order('due_at', { ascending: true })
      .limit(120),
    admin.from('customer_follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    admin
      .from('customer_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('due_at', startOfDay.toISOString())
      .lt('due_at', endOfDay.toISOString()),
    admin
      .from('customer_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sent')
      .gte('sent_at', weekAgo),
    admin.from('customer_follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
    admin.from('follow_up_runs').select('*').order('started_at', { ascending: false }).limit(12),
  ]);

  return {
    pending: pendingRes.count ?? 0,
    dueToday: dueTodayRes.count ?? 0,
    sentWeek: sentWeekRes.count ?? 0,
    failed: failedRes.count ?? 0,
    queue: (queueRes.data ?? []).map((row) => mapFollowUp(row as Record<string, unknown>)),
    recentRuns: (runsRes.data ?? []).map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: str(r.id),
        startedAt: str(r.started_at),
        finishedAt: str(r.finished_at) || null,
        enqueuedCount: Number(r.enqueued_count ?? 0),
        sentCount: Number(r.sent_count ?? 0),
        skippedCount: Number(r.skipped_count ?? 0),
        failedCount: Number(r.failed_count ?? 0),
        errorMessage: str(r.error_message) || null,
      };
    }),
    settings,
    tablesReady: true,
  };
}

function customerHasFutureBooking(
  apptRows: Record<string, unknown>[],
  email: string,
  phone: string,
  afterMs: number,
) {
  const emailKey = email.trim().toLowerCase();
  const phoneKey = phone.replace(/\D/g, '');
  return apptRows.some((other) => {
    const status = str(other.status).toLowerCase();
    if (['cancelled', 'deleted'].includes(status)) return false;
    const scheduled = new Date(str(other.scheduled_start)).getTime();
    if (scheduled <= afterMs || scheduled <= Date.now()) return false;
    const otherEmail = str(other.guest_email).trim().toLowerCase();
    const otherPhone = str(other.guest_phone).replace(/\D/g, '');
    if (emailKey && otherEmail === emailKey) return true;
    if (phoneKey.length >= 10 && otherPhone === phoneKey) return true;
    return false;
  });
}

export async function syncFollowUpQueue(admin: SupabaseClient): Promise<number> {
  const probe = await admin.from('customer_follow_ups').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return 0;

  const settings = await loadFollowUpSettings(admin);
  const enabledTiers = new Set(settings.filter((s) => s.enabled).map((s) => s.tier));
  if (enabledTiers.size === 0) return 0;

  const since = new Date(Date.now() - 400 * 86400000).toISOString();
  const { data: apptRows } = await admin
    .from('appointments')
    .select(
      'id, status, guest_name, guest_email, guest_phone, customer_id, vehicle_description, scheduled_start, job_completed_at, updated_at',
    )
    .gte('scheduled_start', since)
    .limit(5000);

  const rows = (apptRows ?? []) as Record<string, unknown>[];
  const now = new Date().toISOString();
  let enqueued = 0;

  for (const row of rows) {
    if (str(row.status).toLowerCase() !== 'completed') continue;
    const completedAt = new Date(str(row.job_completed_at) || str(row.updated_at) || str(row.scheduled_start)).getTime();
    if (!Number.isFinite(completedAt)) continue;

    const email = str(row.guest_email);
    const phone = str(row.guest_phone);
    if (!email && !phone) continue;

    if (customerHasFutureBooking(rows, email, phone, completedAt)) continue;

    for (const tier of TIERS) {
      if (!enabledTiers.has(tier)) continue;
      const dueAt = new Date(completedAt + tier * 86400000).toISOString();
      const fingerprint = `${str(row.id)}:${tier}`;
      const { data: existing } = await admin
        .from('customer_follow_ups')
        .select('id, status')
        .eq('fingerprint', fingerprint)
        .maybeSingle();

      if (existing?.id) continue;

      const { error } = await admin.from('customer_follow_ups').insert({
        fingerprint,
        customer_id: str(row.customer_id) || null,
        appointment_id: str(row.id),
        tier,
        due_at: dueAt,
        status: 'pending',
        customer_name: str(row.guest_name) || null,
        customer_email: email || null,
        customer_phone: phone || null,
        vehicle_description: str(row.vehicle_description) || null,
        created_at: now,
        updated_at: now,
      });
      if (!error) enqueued += 1;
    }
  }

  return enqueued;
}

export async function cancelFollowUpsForRebookedCustomers(admin: SupabaseClient): Promise<number> {
  const { data: pendingRows } = await admin
    .from('customer_follow_ups')
    .select('id, customer_email, customer_phone, appointment_id')
    .eq('status', 'pending')
    .limit(500);

  if (!pendingRows?.length) return 0;

  const since = new Date(Date.now() - 400 * 86400000).toISOString();
  const { data: apptRows } = await admin
    .from('appointments')
    .select('guest_email, guest_phone, scheduled_start, status')
    .gte('scheduled_start', since)
    .limit(5000);

  const rows = (apptRows ?? []) as Record<string, unknown>[];
  const nowIso = new Date().toISOString();
  let cancelled = 0;

  for (const raw of pendingRows) {
    const email = str((raw as { customer_email?: string }).customer_email);
    const phone = str((raw as { customer_phone?: string }).customer_phone);
    if (customerHasFutureBooking(rows, email, phone, 0)) {
      const { error } = await admin
        .from('customer_follow_ups')
        .update({ status: 'cancelled', skipped_reason: 'rebooked', updated_at: nowIso })
        .eq('id', str((raw as { id: string }).id));
      if (!error) cancelled += 1;
    }
  }

  return cancelled;
}

export async function deliverFollowUp(
  admin: SupabaseClient,
  followUp: CustomerFollowUpRow,
  setting: FollowUpSetting,
): Promise<{ ok: boolean; channel?: string; error?: string; skippedReason?: string }> {
  const vars = {
    customer: followUp.customerName?.trim() || 'there',
    vehicle: followUp.vehicleDescription?.trim() || 'vehicle',
    bookLink: BOOK_LINK,
    promo: setting.promoCode || 'GLOSS10',
  };

  const smsBody = renderTemplate(setting.smsTemplate, vars);
  const emailSubject = renderTemplate(setting.emailSubject, vars);
  const emailPlain = renderTemplate(setting.emailBody, vars);

  if (setting.smsEnabled && followUp.customerPhone) {
    const res = await sendCustomerSms({
      db: admin,
      kind: 'follow_up',
      template_key: `follow_up_${followUp.tier}`,
      to: followUp.customerPhone,
      body: smsBody,
      appointment_id: followUp.appointmentId,
      customer_id: followUp.customerId,
      extraPayload: { tier: followUp.tier, fingerprint: followUp.fingerprint },
    });
    if (res.ok) return { ok: true, channel: 'sms' };
    if (!setting.emailEnabled || !followUp.customerEmail) {
      return { ok: false, error: res.error ?? 'SMS failed', skippedReason: res.skipped ? res.error : undefined };
    }
  }

  if (setting.emailEnabled && followUp.customerEmail) {
    const html = glossBossEmailLayout({
      title: emailSubject,
      preview: emailSubject,
      headline: emailSubject,
      bodyHtml:
        `<p style="color:#fafafa;font-size:15px;line-height:1.6;">${emailPlain.replace(/\n/g, '<br/>')}</p>` +
        emailCtaButton(BOOK_LINK, 'Book your next detail'),
    });
    const sent = await sendResendHtml({ to: followUp.customerEmail, subject: emailSubject, html });
    if (sent.ok) {
      await admin.from('notification_outbox').insert({
        kind: 'follow_up',
        channel: 'email',
        provider: 'resend',
        status: 'sent',
        appointment_id: followUp.appointmentId,
        customer_id: followUp.customerId,
        template_key: `follow_up_${followUp.tier}`,
        payload: { tier: followUp.tier, fingerprint: followUp.fingerprint },
        sent_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      });
      return { ok: true, channel: 'email' };
    }
    return { ok: false, error: sent.error ?? 'Email failed' };
  }

  return { ok: false, error: 'No reachable email or phone for follow-up.', skippedReason: 'missing_contact' };
}

export async function processDueFollowUps(admin: SupabaseClient): Promise<{
  sent: number;
  skipped: number;
  failed: number;
}> {
  const probe = await admin.from('customer_follow_ups').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return { sent: 0, skipped: 0, failed: 0 };

  const settings = await loadFollowUpSettings(admin);
  const settingsByTier = new Map(settings.map((s) => [s.tier, s]));
  const nowIso = new Date().toISOString();

  const { data: dueRows } = await admin
    .from('customer_follow_ups')
    .select('*')
    .eq('status', 'pending')
    .lte('due_at', nowIso)
    .order('due_at', { ascending: true })
    .limit(40);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const raw of dueRows ?? []) {
    const followUp = mapFollowUp(raw as Record<string, unknown>);
    const setting = settingsByTier.get(followUp.tier);
    const snoozedUntil = followUp.snoozedUntil ? new Date(followUp.snoozedUntil).getTime() : 0;
    if (snoozedUntil > Date.now()) {
      skipped += 1;
      continue;
    }
    if (!setting?.enabled) {
      await admin
        .from('customer_follow_ups')
        .update({ status: 'skipped', skipped_reason: 'tier_disabled', updated_at: nowIso })
        .eq('id', followUp.id);
      skipped += 1;
      continue;
    }

    const result = await deliverFollowUp(admin, followUp, setting);
    if (result.ok) {
      await admin
        .from('customer_follow_ups')
        .update({
          status: 'sent',
          channel: result.channel ?? null,
          sent_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', followUp.id);
      sent += 1;
    } else if (result.skippedReason) {
      await admin
        .from('customer_follow_ups')
        .update({
          status: 'skipped',
          skipped_reason: result.skippedReason,
          updated_at: nowIso,
        })
        .eq('id', followUp.id);
      skipped += 1;
    } else {
      await admin
        .from('customer_follow_ups')
        .update({
          status: 'failed',
          skipped_reason: result.error ?? 'send_failed',
          updated_at: nowIso,
        })
        .eq('id', followUp.id);
      failed += 1;
    }
  }

  return { sent, skipped, failed };
}

export async function runFollowUpEngine(admin: SupabaseClient) {
  const startedAt = new Date().toISOString();
  const { data: runRow, error: runErr } = await admin
    .from('follow_up_runs')
    .insert({ started_at: startedAt })
    .select('id')
    .maybeSingle();

  if (runErr && isMissingTable(runErr.message)) {
    return { tablesMissing: true as const };
  }

  try {
    const enqueued = await syncFollowUpQueue(admin);
    await cancelFollowUpsForRebookedCustomers(admin);
    const delivery = await processDueFollowUps(admin);
    const finishedAt = new Date().toISOString();

    if (runRow?.id) {
      await admin
        .from('follow_up_runs')
        .update({
          finished_at: finishedAt,
          enqueued_count: enqueued,
          sent_count: delivery.sent,
          skipped_count: delivery.skipped,
          failed_count: delivery.failed,
        })
        .eq('id', runRow.id);
    }

    if (delivery.sent > 0) {
      const { logTitanActivity } = await import('@/lib/titan/activity-feed');
      await logTitanActivity(admin, {
        kind: 'follow_up_sent',
        title: 'Follow-up messages sent',
        detail: `${delivery.sent} customer win-back message${delivery.sent === 1 ? '' : 's'}`,
        href: '/admin/follow-ups',
      });
    }

    return {
      enqueued,
      ...delivery,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Follow-up engine failed';
    if (runRow?.id) {
      await admin
        .from('follow_up_runs')
        .update({ finished_at: new Date().toISOString(), error_message: message })
        .eq('id', runRow.id);
    }
    throw e;
  }
}

export async function sendFollowUpNow(
  admin: SupabaseClient,
  followUpId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { data } = await admin.from('customer_follow_ups').select('*').eq('id', followUpId).maybeSingle();
  if (!data) return { ok: false, error: 'Follow-up not found' };

  const followUp = mapFollowUp(data as Record<string, unknown>);
  const settings = await loadFollowUpSettings(admin);
  const setting = settings.find((s) => s.tier === followUp.tier);
  if (!setting) return { ok: false, error: 'Follow-up settings missing' };

  const result = await deliverFollowUp(admin, followUp, setting);
  const nowIso = new Date().toISOString();
  if (result.ok) {
    await admin
      .from('customer_follow_ups')
      .update({ status: 'sent', channel: result.channel ?? null, sent_at: nowIso, updated_at: nowIso })
      .eq('id', followUpId);
    return { ok: true };
  }
  await admin
    .from('customer_follow_ups')
    .update({ status: 'failed', skipped_reason: result.error ?? 'send_failed', updated_at: nowIso })
    .eq('id', followUpId);
  return { ok: false, error: result.error ?? 'Send failed' };
}

export async function sendAdHocFollowUp(
  admin: SupabaseClient,
  input: { email?: string; phone?: string; customerName?: string; tier?: FollowUpTier },
): Promise<{ ok: boolean; error?: string }> {
  const settings = await loadFollowUpSettings(admin);
  const tier = input.tier ?? 60;
  const setting = settings.find((s) => s.tier === tier) ?? settings[0];
  if (!setting) {
    return sendLegacyFollowUp(admin, input);
  }

  const followUp: CustomerFollowUpRow = {
    id: 'adhoc',
    fingerprint: 'adhoc',
    customerId: null,
    appointmentId: null,
    tier: setting.tier,
    dueAt: new Date().toISOString(),
    status: 'pending',
    channel: null,
    sentAt: null,
    skippedReason: null,
    snoozedUntil: null,
    customerName: input.customerName ?? null,
    customerEmail: input.email ?? null,
    customerPhone: input.phone ?? null,
    vehicleDescription: null,
    createdAt: new Date().toISOString(),
  };

  const result = await deliverFollowUp(admin, followUp, setting);
  if (result.ok) return { ok: true };
  return { ok: false, error: result.error ?? 'Follow-up failed' };
}

async function sendLegacyFollowUp(
  admin: SupabaseClient,
  input: { email?: string; phone?: string; customerName?: string },
) {
  const name = String(input.customerName ?? 'there').trim() || 'there';
  const smsBody = `Hi ${name}, it's Gloss Boss ATX. It's been a while since your last detail — reply to book your next appointment or visit ${BOOK_LINK}.`;
  const phone = String(input.phone ?? '').trim();
  const email = String(input.email ?? '').trim();

  if (phone) {
    const res = await sendCustomerSms({
      db: admin,
      kind: 'follow_up',
      template_key: 'follow_up',
      to: phone,
      body: smsBody,
    });
    if (!res.ok) return { ok: false, error: res.error ?? 'SMS follow-up failed' };
    return { ok: true };
  }
  if (email) {
    const html = glossBossEmailLayout({
      title: 'Time for your next Gloss Boss detail?',
      preview: 'Time for your next Gloss Boss detail?',
      headline: 'Time for your next Gloss Boss detail?',
      bodyHtml: `<p style="color:#fafafa;font-size:15px;">Hi ${name},<br/><br/>We noticed it's been a while since your last Gloss Boss ATX service. We'd love to get you back on the schedule.</p>${emailCtaButton(BOOK_LINK, 'Book online')}`,
    });
    const sent = await sendResendHtml({ to: email, subject: 'Time for your next Gloss Boss detail?', html });
    if (!sent.ok) return { ok: false, error: sent.error ?? 'Email follow-up failed' };
    return { ok: true };
  }
  return { ok: false, error: 'No email or phone available for follow-up.' };
}

export async function snoozeFollowUp(admin: SupabaseClient, followUpId: string, days: number) {
  const until = new Date(Date.now() + days * 86400000).toISOString();
  await admin
    .from('customer_follow_ups')
    .update({ snoozed_until: until, updated_at: new Date().toISOString() })
    .eq('id', followUpId);
}

export async function skipFollowUp(admin: SupabaseClient, followUpId: string, reason = 'manual_skip') {
  await admin
    .from('customer_follow_ups')
    .update({
      status: 'skipped',
      skipped_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', followUpId);
}

export async function updateFollowUpTierEnabled(admin: SupabaseClient, tier: FollowUpTier, enabled: boolean) {
  await admin.from('follow_up_settings').update({ enabled, updated_at: new Date().toISOString() }).eq('tier', tier);
}
