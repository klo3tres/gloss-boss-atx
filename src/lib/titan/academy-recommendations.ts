import type { AcademyResource } from '@/lib/titan/business-academy';

export type AcademyRecommendation = {
  id: string;
  reason: string;
  priority: 'high' | 'medium';
  resources: AcademyResource[];
};

/** Lightweight Titan-style recommendations from business signals (no LLM). */
export function buildAcademyRecommendations(signals: {
  referralCount?: number;
  reviewCount?: number;
  monthRevenueCents?: number;
  revenueGoalCents?: number;
  bookingCount?: number;
}): AcademyRecommendation[] {
  const out: AcademyRecommendation[] = [];
  const referrals = signals.referralCount ?? 0;
  const reviews = signals.reviewCount ?? 0;
  const revenue = signals.monthRevenueCents ?? 0;
  const goal = signals.revenueGoalCents ?? 0;
  const bookings = signals.bookingCount ?? 0;

  if (referrals < 3) {
    out.push({
      id: 'weak-referrals',
      reason: "You're light on referrals — your lowest-cost growth channel.",
      priority: 'high',
      resources: [
        {
          id: 'rec-referral',
          title: 'Referral flywheel playbook',
          summary: 'Turn happy clients into your cheapest acquisition channel.',
          type: 'model',
          category: 'marketing',
          href: '/admin/referrals',
        },
        {
          id: 'rec-reviews',
          title: 'Review generation after every detail',
          summary: 'Reviews fuel referrals and local trust.',
          type: 'article',
          category: 'marketing',
          href: '/admin/reviews',
        },
      ],
    });
  }

  if (reviews < 5) {
    out.push({
      id: 'weak-reviews',
      reason: 'Google review velocity is low — social proof drives bookings.',
      priority: 'high',
      resources: [
        {
          id: 'rec-review-ops',
          title: 'Review request workflow',
          summary: 'Close every job with a review ask and track completion.',
          type: 'tool',
          category: 'operations',
          href: '/admin/cms?tab=hours',
        },
      ],
    });
  }

  if (goal > 0 && revenue < goal * 0.5) {
    out.push({
      id: 'revenue-gap',
      reason: `Revenue is behind target (${Math.round((revenue / goal) * 100)}% of goal).`,
      priority: 'high',
      resources: [
        {
          id: 'rec-revenue',
          title: 'Revenue mission center',
          summary: 'Recover and close outstanding balances today.',
          type: 'tool',
          category: 'finance',
          href: '/admin/revenue',
        },
        {
          id: 'rec-membership',
          title: 'Membership MRR ladder',
          summary: 'Recurring plans smooth revenue volatility.',
          type: 'model',
          category: 'finance',
          href: '/admin/memberships',
        },
      ],
    });
  }

  if (bookings < 8) {
    out.push({
      id: 'low-bookings',
      reason: 'Booking volume is soft — fill the calendar with outreach.',
      priority: 'medium',
      resources: [
        {
          id: 'rec-outreach',
          title: 'Titan outreach workspace',
          summary: 'Send targeted SMS to warm leads.',
          type: 'tool',
          category: 'ai',
          href: '/admin/titan?workspace=outreach',
        },
      ],
    });
  }

  return out.slice(0, 4);
}
