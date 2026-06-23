import type { SupabaseClient } from '@supabase/supabase-js';
import type { OutreachKit } from '@/lib/titan/engines/outreach';
import type { RealDailyAction } from '@/lib/titan/engines/real-daily-actions';

export type DailyMissionAction = {
  id: string;
  title: string;
  reason: string;
  potentialCents: number;
  status: 'pending' | 'completed' | 'skipped';
  outreach?: OutreachKit;
  href: string;
  recipient: string;
  recipientPhone: string | null;
  recipientEmail: string | null;
  messagePreview: string;
};

export type DailyAutonomy = {
  missionDate: string;
  morningPotentialCents: number;
  topActions: DailyMissionAction[];
  evening: {
    completed: number;
    total: number;
    revenueGeneratedCents: number;
    revenueMissedCents: number;
  };
};

function todayChicago(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function ensureDailyMission(
  admin: SupabaseClient,
  input: {
    potentialCents: number;
    actions: RealDailyAction[];
  },
): Promise<DailyAutonomy> {
  const missionDate = todayChicago();
  const probe = await admin.from('titan_mission_actions').select('id').limit(1);
  if (probe.error) {
    return fallbackMission(missionDate, input);
  }

  const { data: existing } = await admin
    .from('titan_mission_actions')
    .select('*')
    .eq('mission_date', missionDate)
    .order('created_at', { ascending: true });

  if (!existing?.length && input.actions.length > 0) {
    const rows = input.actions.slice(0, 3).map((a) => ({
      mission_date: missionDate,
      title: a.title,
      potential_cents: a.potentialCents,
      source_id: a.id,
      outreach_json: a.outreach ?? { sms: a.messagePreview },
      status: 'pending',
    }));
    await admin.from('titan_mission_actions').insert(rows);
  }

  const { data: actions } = await admin
    .from('titan_mission_actions')
    .select('*')
    .eq('mission_date', missionDate)
    .order('created_at', { ascending: true });

  const actionByTitle = new Map(input.actions.map((a) => [a.title, a]));

  const topActions: DailyMissionAction[] = (actions ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const title = str(r.title);
    const src = actionByTitle.get(title);
    const outreach = (r.outreach_json as OutreachKit) ?? src?.outreach;
    return {
      id: str(r.id),
      title,
      reason: src?.reason ?? 'Revenue action from today\'s briefing',
      potentialCents: Number(r.potential_cents ?? 0),
      status: str(r.status) as DailyMissionAction['status'],
      outreach,
      href: src?.href ?? '/admin',
      recipient: src?.recipient ?? 'Customer',
      recipientPhone: src?.recipientPhone ?? null,
      recipientEmail: src?.recipientEmail ?? null,
      messagePreview: outreach?.sms ?? src?.messagePreview ?? '',
    };
  });

  const completed = topActions.filter((a) => a.status === 'completed').length;
  const total = topActions.length;
  const revenueGeneratedCents = topActions
    .filter((a) => a.status === 'completed')
    .reduce((s, a) => s + a.potentialCents, 0);
  const revenueMissedCents = topActions
    .filter((a) => a.status === 'pending')
    .reduce((s, a) => s + a.potentialCents, 0);

  return {
    missionDate,
    morningPotentialCents: input.potentialCents,
    topActions,
    evening: { completed, total, revenueGeneratedCents, revenueMissedCents },
  };
}

function fallbackMission(
  missionDate: string,
  input: { potentialCents: number; actions: RealDailyAction[] },
): DailyAutonomy {
  const topActions = input.actions.slice(0, 3).map((a, i) => ({
    id: `local-${i}`,
    title: a.title,
    reason: a.reason,
    potentialCents: a.potentialCents,
    status: 'pending' as const,
    outreach: a.outreach,
    href: a.href,
    recipient: a.recipient,
    recipientPhone: a.recipientPhone,
    recipientEmail: a.recipientEmail,
    messagePreview: a.messagePreview,
  }));
  return {
    missionDate,
    morningPotentialCents: input.potentialCents,
    topActions,
    evening: { completed: 0, total: topActions.length, revenueGeneratedCents: 0, revenueMissedCents: topActions.reduce((s, a) => s + a.potentialCents, 0) },
  };
}

export async function markMissionAction(
  admin: SupabaseClient,
  actionId: string,
  status: 'completed' | 'skipped',
): Promise<{ ok: boolean; error?: string }> {
  if (actionId.startsWith('local-')) return { ok: true };
  const probe = await admin.from('titan_mission_actions').select('id').limit(1);
  if (probe.error) return { ok: false, error: 'Migration 000095 required' };

  const { error } = await admin
    .from('titan_mission_actions')
    .update({
      status,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', actionId);

  if (error) return { ok: false, error: error.message };

  if (status === 'completed') {
    const { data } = await admin.from('titan_mission_actions').select('potential_cents, title').eq('id', actionId).maybeSingle();
    await admin.from('titan_kpi_events').insert({
      kind: 'revenue_generated',
      amount_cents: Number((data as { potential_cents?: number })?.potential_cents ?? 0),
      label: str((data as { title?: string })?.title),
      source_id: actionId,
    });
  }

  return { ok: true };
}

export async function syncDealsFromProspects(admin: SupabaseClient): Promise<void> {
  const probe = await admin.from('titan_deals').select('id').limit(1);
  if (probe.error) return;

  const { data: prospects } = await admin
    .from('titan_prospects')
    .select('id, company_name, status, estimated_monthly_cents, contact_name, phone, email, last_contacted_at, updated_at')
    .not('status', 'in', '("won","lost")')
    .limit(50);

  for (const row of prospects ?? []) {
    const p = row as Record<string, unknown>;
    const sourceId = str(p.id);
    const { data: existing } = await admin.from('titan_deals').select('id').eq('source_id', sourceId).maybeSingle();
    if (existing?.id) continue;

    const statusMap: Record<string, string> = {
      new: 'new',
      contacted: 'contacted',
      qualified: 'proposal',
    };
    await admin.from('titan_deals').insert({
      title: str(p.company_name),
      source_type: 'prospect',
      source_id: sourceId,
      potential_value_cents: Number(p.estimated_monthly_cents ?? 0) * 12,
      status: statusMap[str(p.status)] ?? 'new',
      last_touch_at: str(p.last_contacted_at) || str(p.updated_at) || null,
      next_action: str(p.status) === 'new' ? 'Send outreach package' : 'Follow up',
      contact_name: str(p.contact_name) || null,
      contact_phone: str(p.phone) || null,
      contact_email: str(p.email) || null,
    });
  }
}

export async function loadDeals(admin: SupabaseClient) {
  const probe = await admin.from('titan_deals').select('id').limit(1);
  if (probe.error) return [];

  const { data } = await admin
    .from('titan_deals')
    .select('*')
    .not('status', 'in', '("won","lost")')
    .order('potential_value_cents', { ascending: false })
    .limit(12);

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id),
      title: str(r.title),
      potentialValueCents: Number(r.potential_value_cents ?? 0),
      status: str(r.status),
      lastTouchAt: str(r.last_touch_at) || null,
      nextAction: str(r.next_action) || 'Contact',
      contactName: str(r.contact_name) || null,
    };
  });
}
