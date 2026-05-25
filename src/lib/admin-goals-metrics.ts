import type { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

/** Month-to-date operational metrics for admin goals progress. */
export type AdminGoalsMetrics = {
  monthRevenueCents: number;
  monthJobs: number;
  avgTicketCents: number;
};

type AdminDb = NonNullable<ReturnType<typeof tryCreateAdminSupabase>>;

export function currentValueForGoalType(goalType: string, m: AdminGoalsMetrics): number {
  switch (goalType) {
    case 'revenue_monthly':
      return m.monthRevenueCents;
    case 'jobs_monthly':
      return m.monthJobs;
    case 'avg_ticket':
      return m.avgTicketCents;
    case 'reviews':
      return 0;
    default:
      return 0;
  }
}

export async function loadAdminGoalsMetrics(admin: AdminDb): Promise<AdminGoalsMetrics> {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const startIso = start.toISOString();

  let monthRevenueCents = 0;
  let monthJobs = 0;

  const { data: appts } = await admin
    .from('appointments')
    .select('base_price_cents, booking_pricing_breakdown, status, scheduled_start')
    .gte('scheduled_start', startIso)
    .eq('status', 'completed');

  for (const a of appts ?? []) {
    const row = a as {
      base_price_cents?: number;
      booking_pricing_breakdown?: Record<string, unknown> | null;
    };
    const b = row.booking_pricing_breakdown;
    const fromBreakdown =
      typeof b?.finalTotalCents === 'number'
        ? b.finalTotalCents
        : typeof b?.adminOverrideFinalTotalCents === 'number'
          ? b.adminOverrideFinalTotalCents
          : null;
    const cents = fromBreakdown ?? (typeof row.base_price_cents === 'number' ? row.base_price_cents : 0);
    monthRevenueCents += cents;
    monthJobs += 1;
  }

  const avgTicketCents = monthJobs > 0 ? Math.round(monthRevenueCents / monthJobs) : 0;
  return { monthRevenueCents, monthJobs, avgTicketCents };
}

export async function syncAdminGoalsCurrentValues(admin: AdminDb, metrics: AdminGoalsMetrics): Promise<void> {
  const { data: goals } = await admin
    .from('admin_goals')
    .select('id, goal_type, status, current_value')
    .order('created_at', { ascending: false })
    .limit(50);

  const now = new Date().toISOString();
  for (const g of goals ?? []) {
    if (String(g.status ?? '') !== 'active') continue;
    const goalType = String(g.goal_type ?? '');
    const next = currentValueForGoalType(goalType, metrics);
    const prev = Number(g.current_value ?? 0);
    if (prev === next) continue;
    await admin
      .from('admin_goals')
      .update({ current_value: next, updated_at: now })
      .eq('id', String(g.id));
  }
}
