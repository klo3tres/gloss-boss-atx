import { NextResponse } from 'next/server';
import { resolveTierKey } from '@/lib/membership-tier-catalog';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

const PUBLIC_TIERS = ['bronze', 'silver', 'gold'] as const;

function normalizeTier(plan: { tier?: string; name?: string; slug?: string }) {
  const hay = `${plan.tier ?? ''} ${plan.name ?? ''} ${plan.slug ?? ''}`.toLowerCase();
  return PUBLIC_TIERS.find((t) => hay.includes(t)) ?? null;
}

export async function GET() {
  const admin = tryCreateAdminSupabase();
  if (!admin) return NextResponse.json({ plans: [] });

  const { data } = await admin
    .from('membership_plans')
    .select('id, name, slug, tier, price_cents, price_monthly_cents, price_yearly_cents, price_biweekly_cents, discount_percent, benefits, included_services, billing_interval')
    .eq('archived', false);

  const byTier = new Map<string, Record<string, unknown>>();
  for (const row of data ?? []) {
    const tier = normalizeTier(row as { tier: string; name: string; slug: string });
    if (!tier) continue;
    const current = byTier.get(tier);
    const plan = row as Record<string, unknown>;
    const hasPrice = Boolean(plan.price_monthly_cents || plan.price_biweekly_cents || plan.price_yearly_cents || plan.price_cents);
    const currentHasPrice = current
      ? Boolean(current.price_monthly_cents || current.price_biweekly_cents || current.price_yearly_cents || current.price_cents)
      : false;
    if (!current || (hasPrice && !currentHasPrice)) byTier.set(tier, plan);
  }

  const plans = PUBLIC_TIERS.map((t) => byTier.get(t))
    .filter(Boolean)
    .map((row) => {
      const plan = row as Record<string, unknown>;
      const name = String(plan.name ?? '');
      const slug = String(plan.slug ?? '');
      const tierKey = resolveTierKey(String(plan.tier ?? ''), name, slug) ?? String(plan.tier ?? '');
      return {
        id: String(plan.id ?? ''),
        name,
        slug,
        tier: tierKey,
        price_monthly_cents: Number(plan.price_monthly_cents ?? plan.price_cents ?? 0),
        price_yearly_cents: Number(plan.price_yearly_cents ?? 0),
        price_biweekly_cents: Number(plan.price_biweekly_cents ?? 0),
        price_cents: Number(plan.price_cents ?? 0),
        discount_percent: Number(plan.discount_percent ?? 0),
        benefits: Array.isArray(plan.benefits) ? plan.benefits.map(String) : [],
        included_services: Array.isArray(plan.included_services) ? plan.included_services.map(String) : [],
      };
    });
  return NextResponse.json({ plans });
}
