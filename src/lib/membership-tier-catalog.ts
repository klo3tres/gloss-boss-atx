export type MembershipTierKey = 'bronze' | 'silver' | 'gold';

export type MembershipTierMeta = {
  tier: MembershipTierKey;
  bestFor: string;
  tagline: string;
  discountPercent: number;
  quarterlyCreditCents: number;
  annualCreditCents: number;
  upgradeCreditCents: number;
  freeWashCreditCents: number;
  scheduling: string;
  perks: string[];
  monthlyAnchorCents: number;
  yearlyAnchorCents: number;
};

/** Presentation catalog — aligns with seed migrations; admin DB values win when present on plans. */
export const MEMBERSHIP_TIER_CATALOG: Record<MembershipTierKey, MembershipTierMeta> = {
  bronze: {
    tier: 'bronze',
    bestFor: 'Customers detailing 4–6 times per year',
    tagline: 'Steady shine on a smart budget',
    discountPercent: 10,
    quarterlyCreditCents: 0,
    annualCreditCents: 0,
    upgradeCreditCents: 0,
    freeWashCreditCents: 4500,
    scheduling: 'Priority scheduling',
    perks: [
      '10% off all services',
      '1 free maintenance exterior wash credit every 6 months',
      'Priority scheduling',
      'Digital punch card',
      'Member-only reminders',
    ],
    monthlyAnchorCents: 2400,
    yearlyAnchorCents: 24900,
  },
  silver: {
    tier: 'silver',
    bestFor: 'Monthly or bi-monthly customers',
    tagline: 'More savings, more included value',
    discountPercent: 15,
    quarterlyCreditCents: 3000,
    annualCreditCents: 0,
    upgradeCreditCents: 0,
    freeWashCreditCents: 4500,
    scheduling: 'Priority scheduling + member promos',
    perks: [
      '15% off all services',
      '$30 quarterly detail credit',
      '1 free maintenance exterior wash credit every 6 months',
      'Priority scheduling',
      'Member-only promos',
      'Digital punch card',
    ],
    monthlyAnchorCents: 4900,
    yearlyAnchorCents: 49900,
  },
  gold: {
    tier: 'gold',
    bestFor: 'Luxury vehicles, families, and high-frequency customers',
    tagline: 'VIP lane for showroom-level care',
    discountPercent: 20,
    quarterlyCreditCents: 0,
    annualCreditCents: 7500,
    upgradeCreditCents: 4000,
    freeWashCreditCents: 4500,
    scheduling: 'Front-of-line scheduling',
    perks: [
      '20% off all services',
      '$75 annual detail credit',
      '$40 quarterly upgrade credit',
      'Front-of-line scheduling',
      'VIP promos',
      'Digital punch card',
    ],
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

export function bestFitTierForVisits(visitsPerYear: number): MembershipTierKey {
  if (visitsPerYear >= 12) return 'gold';
  if (visitsPerYear >= 6) return 'silver';
  return 'bronze';
}
