import type { SupabaseClient } from '@supabase/supabase-js';
import type { ActionOutcome, LearningInsight, OutcomeRecord } from '@/lib/titan/engines/action-outcomes';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export async function recordMissionOutcome(
  admin: SupabaseClient,
  actionId: string,
  outcome: ActionOutcome,
  notes?: string,
  attributedRevenueCents?: number,
): Promise<{ ok: boolean; error?: string }> {
  if (actionId.startsWith('local-')) return { ok: true };
  const probe = await admin.from('titan_mission_actions').select('id').limit(1);
  if (probe.error) return { ok: false, error: 'Migration 000096 required' };

  const now = new Date().toISOString();
  const revenue = attributedRevenueCents ?? 0;
  const completed = ['booked', 'became_customer', 'revenue_collected'].includes(outcome);

  const { error } = await admin
    .from('titan_mission_actions')
    .update({
      outcome,
      outcome_notes: notes ?? null,
      outcome_at: now,
      attributed_revenue_cents: revenue,
      ...(completed ? { status: 'completed', completed_at: now } : {}),
    })
    .eq('id', actionId);

  if (error) return { ok: false, error: error.message };

  if (revenue > 0) {
    const { data } = await admin.from('titan_mission_actions').select('title').eq('id', actionId).maybeSingle();
    await admin.from('titan_kpi_events').insert({
      kind: 'revenue_generated',
      amount_cents: revenue,
      label: str((data as { title?: string })?.title),
      source_id: actionId,
      metadata: { outcome },
    });
  }

  return { ok: true };
}

export async function loadOutcomeRecords(admin: SupabaseClient, missionDate?: string): Promise<OutcomeRecord[]> {
  const probe = await admin.from('titan_mission_actions').select('id').limit(1);
  if (probe.error) return [];

  let q = admin.from('titan_mission_actions').select('*').order('created_at', { ascending: true });
  if (missionDate) q = q.eq('mission_date', missionDate);

  const { data } = await q.limit(20);
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      actionId: str(r.id),
      title: str(r.title),
      outcome: (str(r.outcome) || null) as OutcomeRecord['outcome'],
      outcomeNotes: str(r.outcome_notes) || null,
      outcomeAt: str(r.outcome_at) || null,
      attributedRevenueCents: Number(r.attributed_revenue_cents ?? 0),
      status: str(r.status),
    };
  });
}

export function buildLearningInsights(
  rows: { outcome: string; title: string; revenue: number }[],
): LearningInsight[] {
  if (rows.length === 0) {
    return [
      {
        id: 'seed-1',
        category: 'outreach',
        insight: 'Log outcomes after every touch — Titan learns which messages convert.',
        confidencePercent: 100,
      },
    ];
  }

  const byOutcome = new Map<string, number>();
  let totalRevenue = 0;
  for (const r of rows) {
    byOutcome.set(r.outcome, (byOutcome.get(r.outcome) ?? 0) + 1);
    totalRevenue += r.revenue;
  }

  const insights: LearningInsight[] = [];
  const booked = byOutcome.get('booked') ?? 0;
  const replied = byOutcome.get('replied') ?? 0;
  const noResponse = byOutcome.get('no_response') ?? 0;
  const total = rows.length;

  if (booked > 0) {
    insights.push({
      id: 'learn-booked',
      category: 'conversion',
      insight: `${Math.round((booked / total) * 100)}% of logged actions resulted in bookings.`,
      confidencePercent: Math.min(95, 50 + booked * 10),
    });
  }
  if (noResponse > replied && noResponse >= 3) {
    insights.push({
      id: 'learn-noreply',
      category: 'cadence',
      insight: `${noResponse} touches got no response — schedule follow-ups on day 2 and day 5.`,
      confidencePercent: 70,
    });
  }
  if (totalRevenue > 0) {
    insights.push({
      id: 'learn-revenue',
      category: 'attribution',
      insight: `Titan attributed $${(totalRevenue / 100).toFixed(0)} to your actions this quarter.`,
      confidencePercent: 85,
    });
  }

  const askedPrice = byOutcome.get('asked_price') ?? 0;
  if (askedPrice >= 2) {
    insights.push({
      id: 'learn-price',
      category: 'objection',
      insight: `${askedPrice} prospects asked price — send a clear menu + book link within 1 hour.`,
      confidencePercent: 75,
    });
  }

  return insights.length > 0 ? insights : buildLearningInsights([]);
}

export async function loadLearningInsights(admin: SupabaseClient): Promise<LearningInsight[]> {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  const { data: actions, error } = await admin
    .from('titan_mission_actions')
    .select('outcome, title, attributed_revenue_cents')
    .not('outcome', 'is', null)
    .gte('outcome_at', since);

  if (error) return buildLearningInsights([]);

  return buildLearningInsights(
    (actions ?? []).map((r) => ({
      outcome: str((r as { outcome?: string }).outcome),
      title: str((r as { title?: string }).title),
      revenue: Number((r as { attributed_revenue_cents?: number }).attributed_revenue_cents ?? 0),
    })),
  );
}
