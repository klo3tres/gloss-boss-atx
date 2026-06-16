import { startOfMonthIso, fetchPaymentsSince, summarizePayments } from '@/lib/revenue-metrics';

type AdminDb = import('@supabase/supabase-js').SupabaseClient;

function rolling30StartIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Month-to-date operational metrics for admin goals progress. */
export type AdminGoalsMetrics = {
  monthRevenueCents: number;
  monthJobs: number;
  avgTicketCents: number;
};

export function currentValueForGoalType(goalType: string, m: AdminGoalsMetrics): number {
  switch (goalType) {
    case 'revenue_monthly':
    case 'profit_monthly':
      return m.monthRevenueCents;
    case 'revenue_weekly':
      return Math.round(m.monthRevenueCents * 0.28);
    case 'jobs_monthly':
    case 'technician_jobs':
      return m.monthJobs;
    case 'avg_ticket':
      return m.avgTicketCents;
    case 'reviews':
    case 'referrals':
      return 0;
    default:
      return 0;
  }
}

export async function loadAdminGoalsMetrics(admin: AdminDb): Promise<AdminGoalsMetrics> {
  const startIso = startOfMonthIso();
  const rollingIso = rolling30StartIso();
  const now = new Date().toISOString();

  const { data: appts } = await admin
    .from('appointments')
    .select('id, guest_email, guest_name, guest_phone, status, scheduled_start')
    .gte('scheduled_start', startIso)
    .eq('status', 'completed');

  const apptById = new Map(
    (appts ?? []).map((a) => {
      const row = a as { id: string; guest_email?: string | null; guest_name?: string | null; guest_phone?: string | null };
      return [row.id, row] as const;
    }),
  );

  const [monthPayments, rollingPayments] = await Promise.all([
    fetchPaymentsSince(admin, startIso, now),
    fetchPaymentsSince(admin, rollingIso, now),
  ]);
  const monthSummary = summarizePayments(monthPayments, { excludeTest: true, apptById, fromIso: startIso, toIso: now });
  const rollingSummary = summarizePayments(rollingPayments, { excludeTest: true, apptById, fromIso: rollingIso, toIso: now });
  const summary = monthSummary.grossCents > 0 ? monthSummary : rollingSummary;
  const monthRevenueCents = summary.grossCents;
  const monthJobs = appts?.length ?? 0;
  const avgTicketCents = summary.paymentCount > 0 ? Math.round(summary.grossCents / summary.paymentCount) : 0;

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
