import type { SupabaseClient } from '@supabase/supabase-js';

export type TitanActivityKind =
  | 'lead_discovered'
  | 'prospect_discovered'
  | 'follow_up_sent'
  | 'customer_booked'
  | 'forecast_updated'
  | 'outreach_sent'
  | 'command_executed'
  | 'review_generated'
  | 'opportunity_queued'
  | 'revenue_leak_scan'
  | 'daily_action_dismissed'
  | 'daily_action_sent'
  | 'staff_invite_created'
  | 'staff_invite_sent'
  | 'staff_invite_resent'
  | 'staff_invite_revoked'
  | 'staff_invite_accepted'
  | 'staff_role_changed'
  | 'staff_profile_repaired'
  | 'staff_account_verified'
  | 'staff_auth_created'
  | 'staff_reset_link_sent'
  | 'referral_settings_changed'
  | 'referral_reward_issued'
  | 'referral_reward_redeemed'
  | 'tech_job_assigned'
  | 'payment_link_clicked'
  | 'payment_received'
  | 'agreement_signed';

export type TitanActivityEvent = {
  id: string;
  kind: TitanActivityKind;
  title: string;
  detail: string | null;
  impactCents: number;
  href: string | null;
  occurredAt: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isMissingTable(message: string) {
  return /titan_activity|schema cache|does not exist/i.test(message);
}

export async function logTitanActivity(
  admin: SupabaseClient,
  event: {
    kind: TitanActivityKind;
    title: string;
    detail?: string;
    impactCents?: number;
    href?: string;
    metadata?: Record<string, unknown>;
    occurredAt?: string;
  },
): Promise<void> {
  const probe = await admin.from('titan_activity_events').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) return;

  await admin.from('titan_activity_events').insert({
    kind: event.kind,
    title: event.title,
    detail: event.detail ?? null,
    impact_cents: event.impactCents ?? 0,
    href: event.href ?? null,
    metadata: event.metadata ?? {},
    occurred_at: event.occurredAt ?? new Date().toISOString(),
  });
}

export async function loadTitanActivityFeed(admin: SupabaseClient, limit = 25): Promise<{
  events: TitanActivityEvent[];
  tablesReady: boolean;
}> {
  const probe = await admin.from('titan_activity_events').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { events: [], tablesReady: false };
  }

  const { data } = await admin
    .from('titan_activity_events')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);

  const events: TitanActivityEvent[] = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: str(r.id),
      kind: str(r.kind) as TitanActivityKind,
      title: str(r.title),
      detail: str(r.detail) || null,
      impactCents: Number(r.impact_cents ?? 0),
      href: str(r.href) || null,
      occurredAt: str(r.occurred_at),
    };
  });

  return { events, tablesReady: true };
}

/** Seed timeline from recent ops when feed is empty (first visit). */
export async function hydrateActivityFeedIfEmpty(admin: SupabaseClient): Promise<void> {
  const { events, tablesReady } = await loadTitanActivityFeed(admin, 1);
  if (!tablesReady || events.length > 0) return;

  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const [prospects, followUps, runs] = await Promise.all([
    admin
      .from('titan_prospects')
      .select('company_name, score, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5),
    admin
      .from('customer_follow_ups')
      .select('customer_name, sent_at, status')
      .eq('status', 'sent')
      .gte('sent_at', since)
      .order('sent_at', { ascending: false })
      .limit(5),
    admin
      .from('titan_discovery_runs')
      .select('new_count, discovered_count, finished_at')
      .gte('started_at', since)
      .order('started_at', { ascending: false })
      .limit(3),
  ]);

  for (const row of prospects.data ?? []) {
    const p = row as Record<string, unknown>;
    await logTitanActivity(admin, {
      kind: 'prospect_discovered',
      title: 'Lead discovered',
      detail: `${str(p.company_name)} · score ${p.score ?? '—'}`,
      occurredAt: str(p.created_at),
      href: '/admin/super',
    });
  }

  for (const row of followUps.data ?? []) {
    const f = row as Record<string, unknown>;
    await logTitanActivity(admin, {
      kind: 'follow_up_sent',
      title: 'Follow-up sent',
      detail: str(f.customer_name) || 'Customer win-back message',
      occurredAt: str(f.sent_at),
      href: '/admin/follow-ups',
    });
  }

  for (const row of runs.data ?? []) {
    const r = row as Record<string, unknown>;
    if (Number(r.new_count ?? 0) <= 0) continue;
    await logTitanActivity(admin, {
      kind: 'prospect_discovered',
      title: 'Lead Radar scan completed',
      detail: `${r.new_count} new opportunities within service radius`,
      occurredAt: str(r.finished_at) || new Date().toISOString(),
      href: '/admin/super',
    });
  }
}
