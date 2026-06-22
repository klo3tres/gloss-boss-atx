import type { SupabaseClient } from '@supabase/supabase-js';

export type RebookOpportunity = {
  customerKey: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerId: string | null;
  avgIntervalDays: number;
  daysSinceLastService: number;
  rebookProbability: number;
  lastAppointmentId: string | null;
  queued: boolean;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function customerKey(email: string, phone: string, customerId: string) {
  return str(customerId) || str(email).toLowerCase() || str(phone).replace(/\D/g, '') || 'unknown';
}

function median(nums: number[]) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export async function detectRebookOpportunities(admin: SupabaseClient): Promise<RebookOpportunity[]> {
  const since = new Date(Date.now() - 730 * 86400000).toISOString();
  const { data } = await admin
    .from('appointments')
    .select('id, customer_id, guest_name, guest_email, guest_phone, status, scheduled_start, job_completed_at, updated_at')
    .eq('status', 'completed')
    .gte('scheduled_start', since)
    .order('scheduled_start', { ascending: true })
    .limit(4000);

  const byKey = new Map<string, Record<string, unknown>[]>();
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const key = customerKey(str(r.guest_email), str(r.guest_phone), str(r.customer_id));
    if (key === 'unknown') continue;
    const list = byKey.get(key) ?? [];
    list.push(r);
    byKey.set(key, list);
  }

  const opportunities: RebookOpportunity[] = [];

  for (const [key, jobs] of byKey.entries()) {
    if (jobs.length < 2) continue;

    const dates = jobs
      .map((j) => new Date(str(j.job_completed_at) || str(j.updated_at) || str(j.scheduled_start)).getTime())
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b);

    const intervals: number[] = [];
    for (let i = 1; i < dates.length; i++) {
      intervals.push((dates[i] - dates[i - 1]) / 86400000);
    }
    const avgInterval = median(intervals);
    if (avgInterval < 14 || avgInterval > 180) continue;

    const lastJob = jobs[jobs.length - 1];
    const lastAt = new Date(str(lastJob.job_completed_at) || str(lastJob.updated_at) || str(lastJob.scheduled_start)).getTime();
    const daysSince = (Date.now() - lastAt) / 86400000;
    const ratio = daysSince / avgInterval;
    if (ratio < 0.8) continue;

    const rebookProbability = Math.min(95, Math.round(ratio * 70 + (jobs.length > 3 ? 15 : 0)));

    opportunities.push({
      customerKey: key,
      customerName: str(lastJob.guest_name) || 'Customer',
      customerEmail: str(lastJob.guest_email) || null,
      customerPhone: str(lastJob.guest_phone) || null,
      customerId: str(lastJob.customer_id) || null,
      avgIntervalDays: Math.round(avgInterval),
      daysSinceLastService: Math.floor(daysSince),
      rebookProbability,
      lastAppointmentId: str(lastJob.id) || null,
      queued: false,
    });
  }

  return opportunities.sort((a, b) => b.rebookProbability - a.rebookProbability).slice(0, 50);
}

export async function queueOpportunityFollowUps(admin: SupabaseClient, opportunities: RebookOpportunity[]): Promise<number> {
  const probe = await admin.from('customer_follow_ups').select('id').limit(1);
  if (probe.error) return 0;

  const now = new Date().toISOString();
  let queued = 0;

  for (const opp of opportunities.slice(0, 25)) {
    if (opp.rebookProbability < 75) continue;
    const fingerprint = `opportunity:${opp.customerKey}`;
    const { data: existing } = await admin
      .from('customer_follow_ups')
      .select('id, status')
      .eq('fingerprint', fingerprint)
      .maybeSingle();
    if (existing?.id && str((existing as { status?: string }).status) !== 'cancelled') {
      opp.queued = str((existing as { status?: string }).status) === 'pending';
      continue;
    }

    const { error } = await admin.from('customer_follow_ups').insert({
      fingerprint,
      customer_id: opp.customerId,
      appointment_id: opp.lastAppointmentId,
      tier: 30,
      due_at: now,
      status: 'pending',
      customer_name: opp.customerName,
      customer_email: opp.customerEmail,
      customer_phone: opp.customerPhone,
      source: 'titan_opportunity',
      rebook_probability: opp.rebookProbability / 100,
      metadata: {
        avg_interval_days: opp.avgIntervalDays,
        days_since_last: opp.daysSinceLastService,
        probability: opp.rebookProbability,
      },
      created_at: now,
      updated_at: now,
    });
    if (!error) {
      queued += 1;
      opp.queued = true;
    }
  }

  return queued;
}

export async function runOpportunityEngine(admin: SupabaseClient) {
  const opportunities = await detectRebookOpportunities(admin);
  const queued = await queueOpportunityFollowUps(admin, opportunities);
  return { opportunities, queued };
}
