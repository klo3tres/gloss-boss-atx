import {
  MEMBERSHIP_TIER_CATALOG,
  type MembershipTierKey,
  type MembershipTierMeta,
} from '@/lib/membership-tier-catalog';

export type MembershipRoiBreakdown = {
  tier: MembershipTierKey;
  meta: MembershipTierMeta;
  annualDues: number;
  grossSpend: number;
  memberDiscount: number;
  quarterlyCredits: number;
  annualCredits: number;
  upgradeCredits: number;
  freeWashValue: number;
  birthdayPerkValue: number;
  totalCredits: number;
  netSavings: number;
  breakEvenVisits: number;
};

const BIRTHDAY_PERK_CENTS: Record<MembershipTierKey, number> = {
  bronze: 2500,
  silver: 4000,
  gold: 6000,
};

export function computeMembershipRoi(
  tier: MembershipTierKey,
  visitsPerYear: number,
  avgTicket: number,
  planOverrides?: { discount_percent?: number; price_yearly_cents?: number },
): MembershipRoiBreakdown {
  const meta = MEMBERSHIP_TIER_CATALOG[tier];
  const visits = Math.min(24, Math.max(1, visitsPerYear));
  const ticket = Math.min(2000, Math.max(50, avgTicket));
  const discount = planOverrides?.discount_percent ?? meta.discountPercent;
  const annualDues = (planOverrides?.price_yearly_cents ?? meta.yearlyAnchorCents) / 100;

  const grossSpend = visits * ticket;
  const memberDiscount = Math.round(grossSpend * (discount / 100));
  const quarterlyCredits = meta.quarterlyCreditCents ? (meta.quarterlyCreditCents / 100) * 4 : 0;
  const annualCredits = meta.annualCreditCents ? meta.annualCreditCents / 100 : 0;
  const upgradeCredits = meta.upgradeCreditCents ? (meta.upgradeCreditCents / 100) * 4 : 0;
  const freeWashValue = (meta.freeWashCreditCents / 100) * 2;
  const birthdayPerkValue = BIRTHDAY_PERK_CENTS[tier] / 100;
  const totalCredits = quarterlyCredits + annualCredits + upgradeCredits + freeWashValue + birthdayPerkValue;
  const netSavings = memberDiscount + totalCredits - annualDues;

  const perVisitValue = ticket * (discount / 100) + totalCredits / visits;
  const breakEvenVisits = perVisitValue > 0 ? Math.ceil(annualDues / perVisitValue) : 99;

  return {
    tier,
    meta,
    annualDues,
    grossSpend,
    memberDiscount,
    quarterlyCredits,
    annualCredits,
    upgradeCredits,
    freeWashValue,
    birthdayPerkValue,
    totalCredits,
    netSavings,
    breakEvenVisits,
  };
}

export function recommendMembershipTier(
  visitsPerYear: number,
  avgTicket: number,
  plans?: Array<{ tier: string; discount_percent?: number; price_yearly_cents?: number }>,
): { best: MembershipRoiBreakdown; all: MembershipRoiBreakdown[]; explanation: string } {
  const tiers: MembershipTierKey[] = ['bronze', 'silver', 'gold'];
  const all = tiers.map((t) => {
    const plan = plans?.find((p) => p.tier.toLowerCase().includes(t));
    return computeMembershipRoi(t, visitsPerYear, avgTicket, {
      discount_percent: plan?.discount_percent,
      price_yearly_cents: plan?.price_yearly_cents,
    });
  });

  const positive = all.filter((r) => r.netSavings >= 0);
  const pool = positive.length > 0 ? positive : all;
  const best = [...pool].sort((a, b) => b.netSavings - a.netSavings)[0]!;

  const explanation =
    best.netSavings >= 0
      ? `At ${visitsPerYear} visits/year (~$${avgTicket} avg), ${best.meta.tier.toUpperCase()} pays for itself in about ${best.breakEvenVisits} visits. You keep roughly $${Math.round(best.netSavings)} net value annually after the $${best.annualDues.toFixed(0)}/yr membership.`
      : `At ${visitsPerYear} visits/year, membership may not beat pay-as-you-go yet. Try ${best.breakEvenVisits}+ visits or a higher avg ticket before joining.`;

  return { best, all, explanation };
}
