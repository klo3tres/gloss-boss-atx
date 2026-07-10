import { displayMoney } from '@/lib/display-format';

export type ContextualMessageInput = {
  customerName: string;
  vehicle?: string | null;
  service?: string | null;
  balanceCents?: number;
  paymentUrl?: string | null;
  visitCount?: number;
  avgTicketCents?: number;
  daysSinceLastVisit?: number | null;
  membershipTier?: string | null;
  recommendedTier?: string;
  projectedAnnualSavingsCents?: number;
  reviewUrl?: string;
  bookUrl?: string;
  referralUrl?: string;
  weatherNote?: string | null;
  businessName?: string;
  fleetSize?: number | null;
};

function first(name: string) {
  const n = name.trim().split(/\s+/)[0];
  return n || 'there';
}

export function buildContextualMessage(
  type: 'balance' | 'membership' | 'review' | 'rebook' | 'referral' | 'follow_up' | 'lead' | 'fleet' | 'payment_reminder',
  ctx: ContextualMessageInput,
): string {
  const who = first(ctx.customerName);
  const vehicle = ctx.vehicle?.trim() || 'your vehicle';
  const service = ctx.service?.replace(/-/g, ' ') || 'detail';
  const book = ctx.bookUrl ?? 'https://www.glossbossatx.com/book';

  switch (type) {
    case 'balance':
    case 'payment_reminder': {
      const amt = displayMoney(ctx.balanceCents ?? 0);
      if (ctx.paymentUrl) {
        return `Hi ${who} — your Gloss Boss ATX balance for ${vehicle} is ${amt}. Pay securely here: ${ctx.paymentUrl} Thank you!`;
      }
      return `Hi ${who} — Gloss Boss ATX balance of ${amt} is due for ${vehicle}. Reply when ready and we'll send a secure pay link.`;
    }
    case 'membership': {
      const tier = ctx.recommendedTier ?? 'Silver';
      const visits = ctx.visitCount ?? 0;
      const avg = ctx.avgTicketCents ? displayMoney(ctx.avgTicketCents) : '$175';
      const savings =
        ctx.projectedAnnualSavingsCents && ctx.projectedAnnualSavingsCents > 0
          ? ` Projected savings ~${displayMoney(ctx.projectedAnnualSavingsCents)}/yr.`
          : '';
      if (ctx.membershipTier) {
        return `Hi ${who} — thanks for being a ${ctx.membershipTier} member. Your ${vehicle} is due for care — book with member pricing: ${book}`;
      }
      return `Hi ${who} — with ${visits} visits (avg ${avg}) on ${vehicle}, ${tier} membership fits your schedule.${savings} See plans: ${book.replace('/book', '/memberships')}`;
    }
    case 'review': {
      const url = ctx.reviewUrl ?? book;
      return `Hi ${who}! Thanks for trusting Gloss Boss with ${vehicle}. A quick Google review helps us grow: ${url}`;
    }
    case 'rebook': {
      const days = ctx.daysSinceLastVisit;
      const timing = days != null && days > 0 ? ` It's been about ${days} days since your last ${service}.` : '';
      const weather = ctx.weatherNote ? ` ${ctx.weatherNote}` : '';
      return `Hi ${who} — time for your next Gloss Boss ${service} on ${vehicle}?${timing}${weather} Book: ${book}`;
    }
    case 'referral': {
      const link = ctx.referralUrl ?? book;
      return `Hi ${who}! Know someone who'd love a shine on their ride? Share Gloss Boss ATX: ${link}`;
    }
    case 'follow_up': {
      return `Hi ${who} — Gloss Boss ATX checking in on ${vehicle}. Ready for your next ${service}? ${book}`;
    }
    case 'fleet': {
      const biz = ctx.businessName ?? 'your fleet';
      const count = ctx.fleetSize ? ` (~${ctx.fleetSize} vehicles)` : '';
      return `Hi — Kyle with Gloss Boss ATX. We maintain fleets${count} on-site in Austin. Would a quick quote for ${biz} help this month?`;
    }
    case 'lead':
    default:
      return `Hi ${who}! Gloss Boss ATX mobile detail — we'd love to earn your business on ${vehicle}. Book or reply with questions: ${book}`;
  }
}
