import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPaymentsSince, startOfMonthIso, summarizePayments } from '@/lib/revenue-metrics';
import { isValidTimerForAnalytics, timerDurationSeconds } from '@/lib/timer-integrity';

export type TechnicianScorecard = {
  technicianId: string;
  name: string;
  revenueCents: number;
  completedJobs: number;
  scheduledJobs: number;
  attendancePercent: number;
  upsellJobs: number;
  upsellRatePercent: number;
  tipsCents: number;
  reviewCount: number;
  avgReviewRating: number | null;
  avgJobMinutes: number | null;
  compositeScore: number;
  badge: 'top' | 'solid' | 'developing' | null;
  summary: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function countUpsellLines(customLineItems: unknown): number {
  if (!Array.isArray(customLineItems)) return 0;
  return customLineItems.filter((item) => {
    const row = item as Record<string, unknown>;
    const kind = str(row.kind).toLowerCase();
    const amount = cents(row.amountCents ?? row.amount_cents);
    return amount > 0 && kind !== 'discount_adjustment' && kind !== 'discount';
  }).length;
}

export async function loadTechnicianScorecards(admin: SupabaseClient): Promise<TechnicianScorecard[]> {
  const monthStart = startOfMonthIso();
  const now = new Date().toISOString();

  const { data: techProfiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('role', ['technician', 'admin', 'super_admin']);

  const techs = (techProfiles ?? []).filter((p) => str((p as { id: string }).id));
  if (!techs.length) return [];

  const techIds = techs.map((t) => str((t as { id: string }).id));

  const [apptsRes, paymentsRes, reviewsRes, timersRes] = await Promise.all([
    admin
      .from('appointments')
      .select('id, assigned_technician_id, status, scheduled_start, custom_line_items, base_price_cents')
      .gte('scheduled_start', monthStart)
      .in('assigned_technician_id', techIds)
      .limit(3000),
    admin
      .from('payments')
      .select('amount_cents, tip_amount_cents, appointment_id, technician_id, status, created_at')
      .gte('created_at', monthStart)
      .in('status', ['succeeded', 'paid', 'completed'])
      .limit(5000),
    admin.from('customer_reviews').select('appointment_id, rating').gte('created_at', monthStart).limit(1000),
    admin.from('tech_job_timers').select('technician_id, duration_seconds, appointment_id, running, status').limit(3000),
  ]);

  const appts = (apptsRes.data ?? []) as Record<string, unknown>[];
  const apptById = new Map(appts.map((a) => [str(a.id), a]));
  const reviewsByAppt = new Map<string, number[]>();
  for (const row of reviewsRes.data ?? []) {
    const r = row as { appointment_id?: string; rating?: number };
    const aid = str(r.appointment_id);
    if (!aid) continue;
    const list = reviewsByAppt.get(aid) ?? [];
    list.push(cents(r.rating) || 5);
    reviewsByAppt.set(aid, list);
  }

  const cards: TechnicianScorecard[] = [];

  for (const tech of techs) {
    const technicianId = str((tech as { id: string }).id);
    const name = str((tech as { full_name?: string }).full_name) || 'Technician';
    const techAppts = appts.filter((a) => str(a.assigned_technician_id) === technicianId);
    const completed = techAppts.filter((a) => str(a.status).toLowerCase() === 'completed');
    const scheduled = techAppts.filter((a) => !['cancelled', 'deleted'].includes(str(a.status).toLowerCase()));
    const attendancePercent =
      scheduled.length > 0 ? Math.round((completed.length / scheduled.length) * 100) : 100;

    let revenueCents = 0;
    let tipsCents = 0;
    for (const row of paymentsRes.data ?? []) {
      const p = row as Record<string, unknown>;
      const tid = str(p.technician_id);
      const aid = str(p.appointment_id);
      const apptTech = aid ? str(apptById.get(aid)?.assigned_technician_id) : '';
      if (tid !== technicianId && apptTech !== technicianId) continue;
      revenueCents += cents(p.amount_cents);
      tipsCents += cents(p.tip_amount_cents);
    }

    let upsellJobs = 0;
    for (const a of completed) {
      if (countUpsellLines(a.custom_line_items) > 0) upsellJobs += 1;
    }
    const upsellRatePercent = completed.length > 0 ? Math.round((upsellJobs / completed.length) * 100) : 0;

    const ratings: number[] = [];
    for (const a of completed) {
      const rs = reviewsByAppt.get(str(a.id));
      if (rs) ratings.push(...rs);
    }
    const avgReviewRating = ratings.length ? Math.round((ratings.reduce((s, n) => s + n, 0) / ratings.length) * 10) / 10 : null;

    const durations: number[] = [];
    for (const row of timersRes.data ?? []) {
      const t = row as Record<string, unknown>;
      if (str(t.technician_id) !== technicianId || !isValidTimerForAnalytics(t)) continue;
      const sec = timerDurationSeconds(t);
      if (sec && sec > 0) durations.push(sec);
    }
    const avgJobMinutes = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60) : null;

    const revenueScore = Math.min(40, Math.round(revenueCents / 6000));
    const upsellScore = Math.min(20, Math.round(upsellRatePercent / 5));
    const reviewScore = avgReviewRating != null ? Math.min(20, Math.round(avgReviewRating * 4)) : 5;
    const attendanceScore = Math.min(20, Math.round(attendancePercent / 5));
    const compositeScore = revenueScore + upsellScore + reviewScore + attendanceScore;

    let badge: TechnicianScorecard['badge'] = 'developing';
    if (compositeScore >= 75) badge = 'top';
    else if (compositeScore >= 50) badge = 'solid';

    const summaryParts = [
      `$${(revenueCents / 100).toFixed(0)} revenue MTD`,
      upsellRatePercent > 0 ? `${upsellRatePercent}% upsell rate` : null,
      avgReviewRating != null ? `${avgReviewRating}★ avg review` : null,
      avgJobMinutes != null ? `${avgJobMinutes} min avg job` : null,
    ].filter(Boolean);

    cards.push({
      technicianId,
      name,
      revenueCents,
      completedJobs: completed.length,
      scheduledJobs: scheduled.length,
      attendancePercent,
      upsellJobs,
      upsellRatePercent,
      tipsCents,
      reviewCount: ratings.length,
      avgReviewRating,
      avgJobMinutes,
      compositeScore,
      badge,
      summary: summaryParts.join(' · ') || 'No jobs this month yet',
    });
  }

  return cards.sort((a, b) => b.compositeScore - a.compositeScore || b.revenueCents - a.revenueCents);
}
