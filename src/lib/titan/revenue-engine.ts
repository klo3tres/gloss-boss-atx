import type { SupabaseClient } from '@supabase/supabase-js';

export type RevenueLeak = {
  id: string;
  category: 'lapsed_customers' | 'open_estimates' | 'memberships' | 'open_balances' | 'failed_followups';
  title: string;
  detail: string;
  count: number;
  potentialCents: number;
  href: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function scanRevenueLeaks(admin: SupabaseClient, avgJobCents: number): Promise<{
  leaks: RevenueLeak[];
  totalPotentialCents: number;
}> {
  const leaks: RevenueLeak[] = [];
  const since = new Date(Date.now() - 400 * 86400000).toISOString();

  const [apptsRes, estimatesRes, membershipsRes, balancesRes, followUpsRes] = await Promise.all([
    admin
      .from('appointments')
      .select('id, guest_email, guest_phone, status, job_completed_at, updated_at, scheduled_start')
      .eq('status', 'completed')
      .gte('scheduled_start', since)
      .limit(3000),
    admin
      .from('service_estimates')
      .select('id, total_cents, status')
      .in('status', ['draft', 'sent', 'approved'])
      .limit(500),
    admin
      .from('customer_memberships')
      .select('id, status, ends_at, membership_plan_id')
      .in('status', ['expired', 'cancelled', 'past_due', 'inactive'])
      .limit(200),
    admin
      .from('appointments')
      .select('id, balance_due_cents, payment_status')
      .gt('balance_due_cents', 0)
      .not('status', 'eq', 'cancelled')
      .limit(200),
    admin.from('customer_follow_ups').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);

  const rows = (apptsRes.data ?? []) as Record<string, unknown>[];
  const lapsedKeys = new Set<string>();
  for (const row of rows) {
    const completedAt = new Date(str(row.job_completed_at) || str(row.updated_at)).getTime();
    const daysSince = (Date.now() - completedAt) / 86400000;
    if (daysSince < 90) continue;
    const email = str(row.guest_email).toLowerCase();
    const phone = str(row.guest_phone).replace(/\D/g, '');
    const hasFuture = rows.some((other) => {
      if (str(other.id) === str(row.id)) return false;
      if (['cancelled', 'deleted', 'completed'].includes(str(other.status).toLowerCase())) return false;
      if (new Date(str(other.scheduled_start)).getTime() <= Date.now()) return false;
      const oe = str(other.guest_email).toLowerCase();
      const op = str(other.guest_phone).replace(/\D/g, '');
      return (email && oe === email) || (phone.length >= 10 && op === phone);
    });
    if (hasFuture) continue;
    lapsedKeys.add(email || phone || str(row.id));
  }

  const lapsedCount = lapsedKeys.size;
  if (lapsedCount > 0) {
    leaks.push({
      id: 'lapsed-90',
      category: 'lapsed_customers',
      title: `${lapsedCount} customer${lapsedCount === 1 ? '' : 's'} haven't booked in 90+ days`,
      detail: 'Maintenance and win-back follow-ups recover this revenue.',
      count: lapsedCount,
      potentialCents: lapsedCount * avgJobCents,
      href: '/admin/follow-ups',
    });
  }

  let estimateCents = 0;
  const estimateCount = estimatesRes.data?.length ?? 0;
  for (const row of estimatesRes.data ?? []) {
    estimateCents += cents((row as { total_cents?: number }).total_cents);
  }
  if (estimateCount > 0 && !estimatesRes.error) {
    leaks.push({
      id: 'open-estimates',
      category: 'open_estimates',
      title: `${estimateCount} unfinished estimate${estimateCount === 1 ? '' : 's'}`,
      detail: 'Awaiting approval or deposit.',
      count: estimateCount,
      potentialCents: estimateCents || estimateCount * avgJobCents,
      href: '/admin/leads',
    });
  }

  const expiredMemberships = (membershipsRes.data ?? []).filter((m) => {
    const row = m as { ends_at?: string; status?: string };
    const ended = row.ends_at ? new Date(str(row.ends_at)).getTime() < Date.now() : true;
    return ended || ['expired', 'cancelled', 'past_due', 'inactive'].includes(str(row.status).toLowerCase());
  });
  if (expiredMemberships.length > 0) {
    leaks.push({
      id: 'memberships',
      category: 'memberships',
      title: `${expiredMemberships.length} membership${expiredMemberships.length === 1 ? '' : 's'} expired or inactive`,
      detail: 'Recurring revenue at risk — renewal outreach.',
      count: expiredMemberships.length,
      potentialCents: expiredMemberships.length * 18000,
      href: '/admin/memberships',
    });
  }

  let balanceCents = 0;
  for (const row of balancesRes.data ?? []) {
    balanceCents += cents((row as { balance_due_cents?: number }).balance_due_cents);
  }
  const balanceCount = balancesRes.data?.length ?? 0;
  if (balanceCount > 0) {
    leaks.push({
      id: 'balances',
      category: 'open_balances',
      title: `${balanceCount} job${balanceCount === 1 ? '' : 's'} with open balance`,
      detail: 'Collect before month close.',
      count: balanceCount,
      potentialCents: balanceCents,
      href: '/admin/payments',
    });
  }

  const failedFollowUps = followUpsRes.count ?? 0;
  if (failedFollowUps > 0 && !followUpsRes.error) {
    leaks.push({
      id: 'failed-followups',
      category: 'failed_followups',
      title: `${failedFollowUps} failed follow-up send${failedFollowUps === 1 ? '' : 's'}`,
      detail: 'Retry SMS/email or update contact info.',
      count: failedFollowUps,
      potentialCents: failedFollowUps * avgJobCents,
      href: '/admin/follow-ups',
    });
  }

  const totalPotentialCents = leaks.reduce((s, l) => s + l.potentialCents, 0);
  return { leaks: leaks.sort((a, b) => b.potentialCents - a.potentialCents), totalPotentialCents };
}

export async function logRevenueLeakSnapshot(admin: SupabaseClient, totalCents: number) {
  const probe = await admin.from('titan_nightly_runs').select('id').limit(1);
  if (probe.error) return;
  await admin.from('titan_nightly_runs').insert({ revenue_leak_cents: totalCents, started_at: new Date().toISOString(), finished_at: new Date().toISOString() });
}
