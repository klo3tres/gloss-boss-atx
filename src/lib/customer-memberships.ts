import type { SupabaseClient } from '@supabase/supabase-js';

export type CustomerMembershipListItem = {
  id: string;
  status: string;
  started_at: string | null;
  ends_at: string | null;
  current_period_end: string | null;
  billing_interval: string | null;
  price_cents: number;
  credit_balance_cents: number;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  membership_plans: {
    id: string;
    name: string;
    tier: string;
    discount_percent: number;
    benefits: string[];
    included_services: string[];
  } | null;
};

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split('\n').map((item) => item.trim()).filter(Boolean);
  }
}

export async function listCustomerMemberships(
  admin: SupabaseClient,
  customerId: string,
): Promise<CustomerMembershipListItem[]> {
  const memberships = await admin
    .from('customer_memberships')
    .select(
      'id, membership_plan_id, status, started_at, ends_at, current_period_end, billing_interval, price_cents, credit_balance_cents, stripe_subscription_id, stripe_checkout_session_id, created_at',
    )
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(50);
  let rows: Array<Record<string, unknown>>;
  if (memberships.error && /column|schema cache/i.test(memberships.error.message)) {
    const fallback = await admin
      .from('customer_memberships')
      .select(
        'id, membership_plan_id, status, started_at, ends_at, stripe_subscription_id, stripe_checkout_session_id, created_at',
      )
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (fallback.error) throw new Error(fallback.error.message);
    rows = (fallback.data ?? []) as Array<Record<string, unknown>>;
  } else {
    if (memberships.error) throw new Error(memberships.error.message);
    rows = (memberships.data ?? []) as Array<Record<string, unknown>>;
  }
  const planIds = [...new Set(rows.map((row) => String(row.membership_plan_id ?? '')).filter(Boolean))];
  const plans = planIds.length
    ? await admin
        .from('membership_plans')
        .select('id, name, tier, discount_percent, benefits, included_services')
        .in('id', planIds)
    : { data: [], error: null };
  if (plans.error) throw new Error(plans.error.message);
  const byId = new Map(
    ((plans.data ?? []) as Array<Record<string, unknown>>).map((plan) => [String(plan.id), plan]),
  );

  return rows.map((row) => {
    const plan = byId.get(String(row.membership_plan_id ?? ''));
    return {
      id: String(row.id),
      status: String(row.status ?? 'unknown'),
      started_at: typeof row.started_at === 'string' ? row.started_at : null,
      ends_at: typeof row.ends_at === 'string' ? row.ends_at : null,
      current_period_end: typeof row.current_period_end === 'string' ? row.current_period_end : null,
      billing_interval: typeof row.billing_interval === 'string' ? row.billing_interval : null,
      price_cents: Number(row.price_cents ?? 0),
      credit_balance_cents: Number(row.credit_balance_cents ?? 0),
      stripe_subscription_id:
        typeof row.stripe_subscription_id === 'string' ? row.stripe_subscription_id : null,
      stripe_checkout_session_id:
        typeof row.stripe_checkout_session_id === 'string' ? row.stripe_checkout_session_id : null,
      membership_plans: plan
        ? {
            id: String(plan.id),
            name: String(plan.name ?? 'Gloss Boss membership'),
            tier: String(plan.tier ?? 'member'),
            discount_percent: Number(plan.discount_percent ?? 0),
            benefits: list(plan.benefits),
            included_services: list(plan.included_services),
          }
        : null,
    };
  });
}
