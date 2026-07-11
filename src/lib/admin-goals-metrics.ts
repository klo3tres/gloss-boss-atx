import { startOfMonthIso, fetchPaymentsSince, summarizePayments } from '@/lib/revenue-metrics';

type AdminDb = import('@supabase/supabase-js').SupabaseClient;

function rolling30StartIso() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function startOfWeekIso() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Month-to-date operational metrics for admin goals progress. */
export type AdminGoalsMetrics = {
  monthRevenueCents: number;
  monthJobs: number;
  avgTicketCents: number;
  monthReviews: number;
  monthReferrals: number;
};

export type TechnicianGoalsMetrics = {
  monthJobs: number;
  weekRevenueCents: number;
  monthRevenueCents: number;
};

export function currentValueForGoalType(goalType: string, m: AdminGoalsMetrics, tech?: TechnicianGoalsMetrics): number {
  switch (goalType) {
    case 'revenue_monthly':
    case 'profit_monthly':
      return tech ? tech.monthRevenueCents : m.monthRevenueCents;
    case 'revenue_weekly':
      return tech ? tech.weekRevenueCents : Math.round(m.monthRevenueCents * 0.28);
    case 'jobs_monthly':
      return tech ? tech.monthJobs : m.monthJobs;
    case 'technician_jobs':
      return tech ? tech.monthJobs : m.monthJobs;
    case 'avg_ticket':
      return m.avgTicketCents;
    case 'reviews':
      return m.monthReviews;
    case 'referrals':
      return m.monthReferrals;
    default:
      return 0;
  }
}

export async function loadAdminGoalsMetrics(admin: AdminDb): Promise<AdminGoalsMetrics> {
  const startIso = startOfMonthIso();
  const rollingIso = rolling30StartIso();
  const now = new Date().toISOString();

  const [{ data: appts }, reviewsRes, referralsRes] = await Promise.all([
    admin
      .from('appointments')
      .select('id, guest_email, guest_name, guest_phone, status, scheduled_start')
      .gte('scheduled_start', startIso)
      .eq('status', 'completed'),
    admin
      .from('customer_reviews')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso),
    admin
      .from('referral_events')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startIso),
  ]);

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
  const avgTicketCents =
    monthJobs > 0 && summary.paymentCount > 0 ? Math.round(summary.grossCents / monthJobs) : 0;

  return {
    monthRevenueCents,
    monthJobs,
    avgTicketCents,
    monthReviews: reviewsRes.count ?? 0,
    monthReferrals: referralsRes.count ?? 0,
  };
}

export async function loadTechnicianGoalsMetrics(admin: AdminDb, technicianId: string): Promise<TechnicianGoalsMetrics> {
  const startIso = startOfMonthIso();
  const weekIso = startOfWeekIso();
  const now = new Date().toISOString();

  const { data: appts } = await admin
    .from('appointments')
    .select('id, status, job_completed_at, updated_at, base_price_cents')
    .eq('assigned_technician_id', technicianId)
    .eq('status', 'completed')
    .gte('job_completed_at', startIso);

  const monthJobs = appts?.length ?? 0;
  let weekRevenueCents = 0;
  let monthRevenueCents = 0;
  const ids = (appts ?? []).map((a) => String((a as { id: string }).id)).filter(Boolean);

  if (ids.length > 0) {
    const { data: pays } = await admin
      .from('payments')
      .select('amount_cents, created_at, appointment_id')
      .in('appointment_id', ids)
      .eq('status', 'succeeded');
    for (const p of pays ?? []) {
      const row = p as { amount_cents?: number; created_at?: string };
      const cents = typeof row.amount_cents === 'number' ? row.amount_cents : 0;
      const t = new Date(String(row.created_at ?? '')).getTime();
      if (Number.isNaN(t)) continue;
      if (t >= new Date(startIso).getTime()) monthRevenueCents += cents;
      if (t >= new Date(weekIso).getTime()) weekRevenueCents += cents;
    }
  }

  if (monthRevenueCents === 0) {
    for (const row of appts ?? []) {
      const r = row as { base_price_cents?: number; job_completed_at?: string; updated_at?: string };
      const cents = typeof r.base_price_cents === 'number' ? r.base_price_cents : 0;
      const completed = r.job_completed_at ?? r.updated_at ?? '';
      const t = new Date(completed).getTime();
      if (Number.isNaN(t)) continue;
      if (t >= new Date(startIso).getTime()) monthRevenueCents += cents;
      if (t >= new Date(weekIso).getTime()) weekRevenueCents += cents;
    }
  }

  return { monthJobs, weekRevenueCents, monthRevenueCents };
}

export async function syncAdminGoalsCurrentValues(admin: AdminDb, metrics: AdminGoalsMetrics): Promise<void> {
  const { data: goals } = await admin
    .from('admin_goals')
    .select('id, goal_type, status, current_value, technician_id, assigned_to')
    .order('created_at', { ascending: false })
    .limit(80);

  const techCache = new Map<string, TechnicianGoalsMetrics>();
  const now = new Date().toISOString();

  for (const g of goals ?? []) {
    if (String(g.status ?? '') !== 'active') continue;
    const goalType = String(g.goal_type ?? '');
    const techId = String(g.technician_id ?? g.assigned_to ?? '').trim() || null;
    let techMetrics: TechnicianGoalsMetrics | undefined;
    if (techId) {
      if (!techCache.has(techId)) {
        techCache.set(techId, await loadTechnicianGoalsMetrics(admin, techId));
      }
      techMetrics = techCache.get(techId);
    }
    const next = currentValueForGoalType(goalType, metrics, techMetrics);
    const prev = Number(g.current_value ?? 0);
    if (prev === next) continue;
    await admin.from('admin_goals').update({ current_value: next, updated_at: now }).eq('id', String(g.id));
  }
}
