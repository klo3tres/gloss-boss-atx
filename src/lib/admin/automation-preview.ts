import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import { MANUAL_AUTOMATIONS, type AutomationPreview, type AutomationRecipientPreview, type ManualAutomationKey } from '@/lib/admin/manual-automation-definitions';
import { buildToneVariants } from '@/lib/outbound-message-tones';

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function recipient(input: {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  reason: string;
  message: string;
  channel?: string;
  blockedReason?: string | null;
}): AutomationRecipientPreview {
  const tones = buildToneVariants(input.message);
  return {
    id: input.id,
    name: input.name,
    phone: input.phone,
    email: input.email,
    reason: input.reason,
    blockedReason: input.blockedReason,
    channel: input.channel ?? (input.phone ? 'SMS' : input.email ? 'Email' : 'None'),
    quick: tones.quick,
    professional: tones.professional,
    warm: tones.warm,
  };
}

async function lastRun(admin: SupabaseClient, key: ManualAutomationKey) {
  const { data } = await admin
    .from('titan_automation_runs')
    .select('finished_at, started_at, status, result, error_message')
    .eq('job_key', key)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { lastRunAt: null, lastResult: 'Not run yet' };
  const result = data.result && typeof data.result === 'object' ? data.result as Record<string, unknown> : {};
  const summary = Object.entries(result).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)).slice(0, 3).map(([name, value]) => `${name.replaceAll('_', ' ')} ${String(value)}`).join(' · ');
  return { lastRunAt: str(data.finished_at || data.started_at) || null, lastResult: str(data.error_message) || summary || str(data.status) || 'Completed' };
}

function nextSuggestion(key: ManualAutomationKey, count: number) {
  if (key === 'titan_daily_actions') return 'Automatically on the first Titan visit of the next Chicago business day';
  if (key === 'weather_campaign_engine') return count ? 'Review the current draft now' : 'After the next meaningful forecast change';
  if (key === 'missed_job_start_alerts') return count ? 'Review staff alerts now' : 'At the next scheduled appointment start';
  return count ? 'Review eligible records now' : 'When new eligible records appear';
}

export async function loadAutomationPreview(admin: SupabaseClient, key: ManualAutomationKey): Promise<AutomationPreview> {
  let recipients: AutomationRecipientPreview[] = [];
  const now = new Date();

  if (key === 'follow_up_engine') {
    const { loadFollowUpDashboard } = await import('@/lib/follow-up-engine');
    const dashboard = await loadFollowUpDashboard(admin);
    recipients = dashboard.queue.filter((item) => item.status === 'pending' && Date.parse(item.dueAt) <= now.getTime()).slice(0, 100).map((item) => {
      const setting = dashboard.settings.find((candidate) => candidate.tier === item.tier);
      const base = setting?.smsTemplate || `Hi ${item.customerName || 'there'}, it may be time for your next Gloss Boss detail. View openings: https://www.glossbossatx.com/book`;
      const message = base.replaceAll('{{customer}}', item.customerName || 'there').replaceAll('{{book_link}}', 'https://www.glossbossatx.com/book');
      return recipient({ id: item.id, name: item.customerName || 'Customer', phone: item.customerPhone, email: item.customerEmail, reason: `${item.tier}-day follow-up is due`, message, blockedReason: !item.customerPhone && !item.customerEmail ? 'No phone or email on file' : null });
    });
  } else if (key === 'notification_engine') {
    const { data } = await admin.from('scheduled_messages').select('id, recipient, channel, body, subject, rule_key, customer_id, scheduled_for, status').eq('status', 'scheduled').lte('scheduled_for', now.toISOString()).order('scheduled_for').limit(100);
    recipients = (data ?? []).map((raw) => {
      const row = raw as Record<string, unknown>;
      const channel = str(row.channel);
      const address = str(row.recipient);
      return recipient({ id: str(row.id), name: channel === 'staff' ? 'Staff notification' : 'Customer', phone: channel === 'sms' ? address : null, email: channel === 'email' ? address : null, reason: `${str(row.rule_key).replaceAll('_', ' ')} became due`, message: str(row.body), channel: channel === 'staff' ? 'Staff alert' : channel.toUpperCase(), blockedReason: !address || !str(row.body) ? 'Missing recipient or message body' : null });
    });
  } else if (key === 'review_request_engine' || key === 'payment_reminder_engine' || key === 'titan_daily_actions') {
    const { loadOrBuildDailyActionPlan } = await import('@/lib/titan/daily-action-plan');
    const plan = await loadOrBuildDailyActionPlan(admin);
    const wanted = key === 'review_request_engine' ? new Set(['review']) : key === 'payment_reminder_engine' ? new Set(['balance']) : null;
    recipients = plan.actions.filter((action) => !wanted || wanted.has(action.actionType)).map((action) => recipient({ id: action.id, name: action.involvedNames || action.title, phone: action.contactPhone, email: action.contactEmail, reason: action.reason, message: action.messageScript || action.title, channel: key === 'titan_daily_actions' ? 'Internal only' : undefined, blockedReason: action.canSend || key === 'titan_daily_actions' ? null : action.sendBlocker || 'No deliverable contact on file' }));
  } else if (key === 'referral_engine') {
    const { loadReferralEngine } = await import('@/lib/titan/engines/referral');
    const engine = await loadReferralEngine(admin);
    recipients = engine.candidates.map((candidate) => recipient({ id: candidate.id, name: candidate.customerName, reason: candidate.nextAction, message: candidate.outreach.sms, channel: 'Draft only' }));
  } else if (key === 'weather_campaign_engine') {
    const { data } = await admin.from('customer_campaigns').select('id, name, meta, created_at').contains('meta', { kind: 'weather_campaign' }).order('created_at', { ascending: false }).limit(1).maybeSingle();
    const meta = data?.meta && typeof data.meta === 'object' ? data.meta as Record<string, unknown> : {};
    const profiles = Array.isArray(meta.profiles) ? meta.profiles as Array<Record<string, unknown>> : [];
    recipients = profiles.map((profile, index) => recipient({ id: str(profile.customerId) || `${data?.id ?? 'weather'}-${index}`, name: str(profile.firstName) || 'Customer', reason: str(profile.qualification) || str(meta.reason) || 'Weather and service history match', message: `Hey {{first_name}}, ${str(profile.weatherEvent).replaceAll('_', ' ')} created a good window for ${str(profile.serviceRecommendation)}. ${str(profile.availableTimes)}. Book: https://www.glossbossatx.com/book`, channel: 'SMS / Email draft' }));
  } else if (key === 'opportunity_follow_up_engine') {
    const { data } = await admin.from('titan_opportunities').select('id, title, author_name, contact_phone, contact_email, recommended_action, suggested_reply, suggested_dm, status, next_follow_up_at, follow_up_cadence_paused').eq('follow_up_cadence_paused', false).in('status', ['new', 'seeded', 'contacted', 'follow_up', 'quoted']).lte('next_follow_up_at', now.toISOString()).limit(100);
    recipients = (data ?? []).map((raw) => { const row = raw as Record<string, unknown>; return recipient({ id: str(row.id), name: str(row.author_name) || str(row.title) || 'Opportunity', phone: str(row.contact_phone) || null, email: str(row.contact_email) || null, reason: str(row.recommended_action) || 'Follow-up date is due', message: str(row.suggested_reply) || str(row.suggested_dm) || 'Hi, this is Gloss Boss ATX following up on your detailing request.', blockedReason: !str(row.contact_phone) && !str(row.contact_email) ? 'No verified contact information' : null }); });
  } else if (key === 'appointment_reminder_engine') {
    const start = new Date(now.getTime() + 23 * 3600000).toISOString();
    const end = new Date(now.getTime() + 25 * 3600000).toISOString();
    const { data } = await admin.from('appointments').select('id, guest_name, guest_phone, guest_email, scheduled_start, service_slug, status').gte('scheduled_start', start).lte('scheduled_start', end).not('status', 'in', '("cancelled","completed")').limit(100);
    recipients = (data ?? []).map((raw) => { const row = raw as Record<string, unknown>; const name = str(row.guest_name) || 'Customer'; return recipient({ id: str(row.id), name, phone: str(row.guest_phone) || null, email: str(row.guest_email) || null, reason: `Appointment is in the 24-hour reminder window`, message: `Hi ${name}, this is a reminder that your Gloss Boss ATX appointment is tomorrow.`, blockedReason: !str(row.guest_phone) ? 'No SMS-capable phone on file' : null }); });
  } else if (key === 'missed_job_start_alerts') {
    const cutoff = new Date(now.getTime() - 15 * 60000).toISOString();
    const startDay = new Date(now.getTime() - 12 * 3600000).toISOString();
    const { data } = await admin.from('appointments').select('id, guest_name, service_slug, scheduled_start, status, assigned_technician_id, job_started_at, flexible_arrival, delay_approved_by_owner_at, delay_approved_by_customer_at').gte('scheduled_start', startDay).lte('scheduled_start', cutoff).is('job_started_at', null).not('status', 'in', '("cancelled","completed")').limit(100);
    recipients = (data ?? []).map((raw) => { const row = raw as Record<string, unknown>; const approved = row.flexible_arrival === true || Boolean(row.delay_approved_by_owner_at || row.delay_approved_by_customer_at); return recipient({ id: str(row.id), name: str(row.guest_name) || 'Appointment', reason: 'Scheduled start passed without a job-start timestamp', message: `${str(row.guest_name) || 'Appointment'} has not started.`, channel: 'Staff alert', blockedReason: approved ? 'Flexible arrival or approved delay' : !str(row.assigned_technician_id) ? 'No technician assigned' : null }); });
  }

  const eligible = recipients.filter((item) => !item.blockedReason);
  const blocked = recipients.filter((item) => item.blockedReason);
  const run = await lastRun(admin, key);
  return { key, eligibleCount: eligible.length, blockedCount: blocked.length, recipients, ...run, nextSuggestedRun: nextSuggestion(key, eligible.length) };
}

export async function loadAutomationOverview(admin: SupabaseClient): Promise<AutomationPreview[]> {
  return Promise.all(MANUAL_AUTOMATIONS.map((automation) => loadAutomationPreview(admin, automation.key)));
}
