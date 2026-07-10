import type { SupabaseClient } from '@supabase/supabase-js';
import { MEMBERSHIP_TIER_CATALOG, type MembershipTierKey } from '@/lib/membership-tier-catalog';

function tierFromName(name: string): MembershipTierKey | null {
  const n = name.toLowerCase();
  if (n.includes('gold')) return 'gold';
  if (n.includes('silver')) return 'silver';
  if (n.includes('bronze')) return 'bronze';
  return null;
}

/** Backfill yearly (and monthly) anchor prices from catalog when DB values are missing. */
export async function syncMembershipAnnualPrices(admin: SupabaseClient): Promise<{ updated: number }> {
  const { data: plans } = await admin.from('membership_plans').select('*').eq('archived', false);
  let updated = 0;

  for (const raw of plans ?? []) {
    const plan = raw as Record<string, unknown>;
    const tier = tierFromName(String(plan.tier ?? plan.name ?? ''));
    if (!tier) continue;
    const meta = MEMBERSHIP_TIER_CATALOG[tier];
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    let changed = false;

    if (!Number(plan.price_yearly_cents) && meta.yearlyAnchorCents > 0) {
      patch.price_yearly_cents = meta.yearlyAnchorCents;
      changed = true;
    }
    if (!Number(plan.price_monthly_cents) && meta.monthlyAnchorCents > 0) {
      patch.price_monthly_cents = meta.monthlyAnchorCents;
      changed = true;
    }

    if (changed) {
      await admin.from('membership_plans').update(patch).eq('id', plan.id);
      updated += 1;
    }
  }

  return { updated };
}
