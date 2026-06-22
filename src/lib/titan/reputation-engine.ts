import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomerReputation = {
  customerId: string | null;
  customerName: string;
  customerEmail: string | null;
  tier: 'vip' | 'solid' | 'risk';
  score: number;
  lifetimeSpendCents: number;
  tipsCents: number;
  reviewCount: number;
  avgRating: number | null;
  cancellationCount: number;
  completedJobs: number;
  reasons: string[];
  href: string;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function loadCustomerReputationScores(admin: SupabaseClient): Promise<{
  vip: CustomerReputation[];
  risk: CustomerReputation[];
}> {
  const since = new Date(Date.now() - 365 * 86400000).toISOString();

  const [customersRes, paymentsRes, reviewsRes, apptsRes] = await Promise.all([
    admin.from('customers').select('id, full_name, email').limit(500),
    admin
      .from('payments')
      .select('customer_id, amount_cents, tip_amount_cents, appointment_id, status')
      .gte('created_at', since)
      .in('status', ['succeeded', 'paid', 'completed'])
      .limit(5000),
    admin.from('customer_reviews').select('customer_id, customer_email, rating').limit(2000),
    admin
      .from('appointments')
      .select('id, customer_id, guest_email, guest_name, status')
      .gte('scheduled_start', since)
      .limit(5000),
  ]);

  type Agg = {
    customerId: string | null;
    name: string;
    email: string | null;
    spend: number;
    tips: number;
    ratings: number[];
    cancellations: number;
    completed: number;
  };

  const byKey = new Map<string, Agg>();

  function ensure(key: string, name: string, email: string | null, customerId: string | null) {
    if (!byKey.has(key)) {
      byKey.set(key, { customerId, name, email, spend: 0, tips: 0, ratings: [], cancellations: 0, completed: 0 });
    }
    return byKey.get(key)!;
  }

  for (const c of customersRes.data ?? []) {
    const row = c as { id: string; full_name?: string; email?: string };
    ensure(str(row.id), str(row.full_name) || 'Customer', str(row.email) || null, str(row.id));
  }

  for (const row of paymentsRes.data ?? []) {
    const p = row as Record<string, unknown>;
    const cid = str(p.customer_id);
    const key = cid || str(p.appointment_id);
    if (!key) continue;
    const agg = ensure(key, 'Customer', null, cid || null);
    agg.spend += cents(p.amount_cents);
    agg.tips += cents(p.tip_amount_cents);
  }

  for (const row of reviewsRes.data ?? []) {
    const r = row as Record<string, unknown>;
    const cid = str(r.customer_id);
    const email = str(r.customer_email).toLowerCase();
    const key = cid || email;
    if (!key) continue;
    const agg = ensure(key, 'Customer', email || null, cid || null);
    agg.ratings.push(cents(r.rating) || 5);
  }

  for (const row of apptsRes.data ?? []) {
    const a = row as Record<string, unknown>;
    const cid = str(a.customer_id);
    const email = str(a.guest_email).toLowerCase();
    const key = cid || email || str(a.id);
    const agg = ensure(key, str(a.guest_name) || 'Customer', email || null, cid || null);
    const status = str(a.status).toLowerCase();
    if (status === 'cancelled') agg.cancellations += 1;
    if (status === 'completed') agg.completed += 1;
  }

  const scored: CustomerReputation[] = [];

  for (const [, agg] of byKey) {
    if (agg.spend < 5000 && agg.completed < 1) continue;

    const avgRating = agg.ratings.length ? agg.ratings.reduce((s, n) => s + n, 0) / agg.ratings.length : null;
    let score = 50;
    const reasons: string[] = [];

    if (agg.spend >= 200000) {
      score += 25;
      reasons.push(`Spent $${(agg.spend / 100).toFixed(0)}`);
    } else if (agg.spend >= 100000) {
      score += 15;
      reasons.push(`Spent $${(agg.spend / 100).toFixed(0)}`);
    }

    if (agg.tips >= 5000) {
      score += 15;
      reasons.push('Tips well');
    }
    if (avgRating != null && avgRating >= 4.5) {
      score += 15;
      reasons.push(`${avgRating.toFixed(1)}★ reviews`);
    } else if (avgRating != null && avgRating < 3.5) {
      score -= 20;
      reasons.push('Low review scores');
    }
    if (agg.cancellations >= 3) {
      score -= 25;
      reasons.push(`${agg.cancellations} cancellations`);
    }
    if (agg.completed >= 3 && agg.ratings.length === 0) {
      score -= 10;
      reasons.push('Never leaves reviews');
    }

    let tier: CustomerReputation['tier'] = 'solid';
    if (score >= 75) tier = 'vip';
    else if (score < 40) tier = 'risk';

    scored.push({
      customerId: agg.customerId,
      customerName: agg.name,
      customerEmail: agg.email,
      tier,
      score: Math.max(0, Math.min(100, score)),
      lifetimeSpendCents: agg.spend,
      tipsCents: agg.tips,
      reviewCount: agg.ratings.length,
      avgRating: avgRating != null ? Math.round(avgRating * 10) / 10 : null,
      cancellationCount: agg.cancellations,
      completedJobs: agg.completed,
      reasons,
      href: agg.customerId ? `/admin/customers/${agg.customerId}` : `/admin/customers?search=${encodeURIComponent(agg.email ?? agg.name)}`,
    });
  }

  return {
    vip: scored.filter((s) => s.tier === 'vip').sort((a, b) => b.lifetimeSpendCents - a.lifetimeSpendCents).slice(0, 12),
    risk: scored.filter((s) => s.tier === 'risk').sort((a, b) => a.score - b.score).slice(0, 12),
  };
}
