import type { SupabaseClient } from '@supabase/supabase-js';
import type { OutreachKit } from '@/lib/titan/engines/outreach';

export type ScheduledTouch = {
  id: string;
  channel: string;
  message: string;
  dueAt: string;
  status: string;
  label: string;
  isOverdue: boolean;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function scheduleTouchesFromOutreach(
  admin: SupabaseClient,
  input: {
    prospectId?: string;
    dealId?: string;
    missionActionId?: string;
    kit: OutreachKit;
    contactedAt?: Date;
  },
): Promise<{ ok: boolean; error?: string; count?: number }> {
  const probe = await admin.from('titan_touch_schedule').select('id').limit(1);
  if (probe.error) return { ok: false, error: 'Migration 000096 required' };

  const base = input.contactedAt ?? new Date();
  const rows = input.kit.followUpSequence.map((step) => {
    const due = new Date(base);
    due.setDate(due.getDate() + step.day);
    return {
      prospect_id: input.prospectId ?? null,
      deal_id: input.dealId ?? null,
      mission_action_id: input.missionActionId ?? null,
      channel: step.channel.toLowerCase().includes('email') ? 'email' : 'sms',
      message: step.message,
      due_at: due.toISOString(),
      status: 'pending',
    };
  });

  if (rows.length === 0) return { ok: true, count: 0 };
  const { error } = await admin.from('titan_touch_schedule').insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: rows.length };
}

export async function scheduleDefaultCadence(
  admin: SupabaseClient,
  input: { missionActionId: string; label: string; smsTemplate: string; contactedAt?: Date },
): Promise<{ ok: boolean; error?: string }> {
  const probe = await admin.from('titan_touch_schedule').select('id').limit(1);
  if (probe.error) return { ok: false, error: 'Migration 000096 required' };

  const base = input.contactedAt ?? new Date();
  const steps = [
    { days: 2, msg: `Following up on ${input.label} — still interested? Reply or book anytime.` },
    { days: 4, msg: `Last check-in on ${input.label}. Happy to answer questions or send a quote.` },
  ];

  const rows = steps.map((s) => {
    const due = new Date(base);
    due.setDate(due.getDate() + s.days);
    return {
      mission_action_id: input.missionActionId,
      channel: 'sms',
      message: s.msg,
      due_at: due.toISOString(),
      status: 'pending',
    };
  });

  const { error } = await admin.from('titan_touch_schedule').insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function loadTouchSchedule(admin: SupabaseClient): Promise<{
  dueToday: ScheduledTouch[];
  upcoming: ScheduledTouch[];
  tablesReady: boolean;
}> {
  const probe = await admin.from('titan_touch_schedule').select('id').limit(1);
  if (probe.error) return { dueToday: [], upcoming: [], tablesReady: false };

  const now = new Date();
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  const weekOut = new Date(now.getTime() + 7 * 86400000);

  const { data } = await admin
    .from('titan_touch_schedule')
    .select('*')
    .eq('status', 'pending')
    .lte('due_at', weekOut.toISOString())
    .order('due_at', { ascending: true })
    .limit(20);

  const dueToday: ScheduledTouch[] = [];
  const upcoming: ScheduledTouch[] = [];

  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const dueAt = str(r.due_at);
    const due = new Date(dueAt);
    const touch: ScheduledTouch = {
      id: str(r.id),
      channel: str(r.channel),
      message: str(r.message),
      dueAt,
      status: str(r.status),
      label: str(r.mission_action_id) ? 'Mission follow-up' : 'Prospect touch',
      isOverdue: due < now,
    };
    if (due <= endOfDay) dueToday.push(touch);
    else upcoming.push(touch);
  }

  return { dueToday, upcoming, tablesReady: true };
}

export async function markTouchSent(admin: SupabaseClient, touchId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await admin
    .from('titan_touch_schedule')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', touchId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
