export type MembershipTierKey = 'bronze' | 'silver' | 'gold';

export type MembershipTierMeta = {
  tier: MembershipTierKey;
  bestFor: string;
  tagline: string;
  discountPercent: number;
  punchMultiplier: number;
  quarterlyCreditCents: number;
  annualCreditCents: number;
  upgradeCreditCents: number;
  scheduling: string;
  loyaltyNote: string;
  monthlyAnchorCents: number;
  yearlyAnchorCents: number;
};

/** Presentation catalog — aligns with seed migrations; admin DB values win when present on plans. */
export const MEMBERSHIP_TIER_CATALOG: Record<MembershipTierKey, MembershipTierMeta> = {
  bronze: {
    tier: 'bronze',
    bestFor: 'Drivers who want predictable maintenance without VIP overhead',
    tagline: 'Steady shine on a smart budget',
    discountPercent: 10,
    punchMultiplier: 1,
    quarterlyCreditCents: 0,
    annualCreditCents: 0,
    upgradeCreditCents: 0,
    scheduling: 'Priority booking window',
    loyaltyNote: 'Standard punch-card progress (5 services → reward)',
    monthlyAnchorCents: 2400,
    yearlyAnchorCents: 24900,
  },
  silver: {
    tier: 'silver',
    bestFor: 'Weekly commuters and families with repeat detailing needs',
    tagline: 'More savings, faster rewards',
    discountPercent: 15,
    punchMultiplier: 1.25,
    quarterlyCreditCents: 2500,
    annualCreditCents: 0,
    upgradeCreditCents: 0,
    scheduling: 'Priority scheduling + member slots',
    loyaltyNote: '1.25× loyalty stamps on every completed detail',
    monthlyAnchorCents: 4900,
    yearlyAnchorCents: 49900,
  },
  gold: {
    tier: 'gold',
    bestFor: 'Collectors, luxury vehicles, and clients who want front-of-line service',
    tagline: 'VIP lane for showroom-level care',
    discountPercent: 20,
    punchMultiplier: 1.5,
    quarterlyCreditCents: 0,
    annualCreditCents: 7500,
    upgradeCreditCents: 5000,
    scheduling: 'Front-of-line scheduling',
    loyaltyNote: '1.5× stamps + premium reward menu',
    monthlyAnchorCents: 7900,
    yearlyAnchorCents: 79900,
  },
};

export function resolveTierKey(tier: string, name?: string, slug?: string): MembershipTierKey | null {
  const hay = `${tier} ${name ?? ''} ${slug ?? ''}`.toLowerCase();
  if (hay.includes('gold') || hay.includes('platinum')) return 'gold';
  if (hay.includes('silver')) return 'silver';
  if (hay.includes('bronze')) return 'bronze';
  return null;
}

export function tierMetaForPlan(plan: { tier: string; name?: string; slug?: string }): MembershipTierMeta | null {
  const key = resolveTierKey(plan.tier, plan.name, plan.slug);
  return key ? MEMBERSHIP_TIER_CATALOG[key] : null;
}

export function formatCredit(cents: number) {
  if (cents <= 0) return '—';
  return `$${(cents / 100).toFixed(0)}`;
}
