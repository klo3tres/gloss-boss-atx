import type { RevenueLeak } from '@/lib/titan/revenue-engine';
import type { RecoveryEngine, RecoveryItem } from '@/lib/titan/engines/types';

const CATEGORY_LABELS: Record<RevenueLeak['category'], string> = {
  lapsed_customers: 'Old customers',
  open_estimates: 'Open estimates',
  memberships: 'Inactive memberships',
  open_balances: 'Unpaid invoices',
  failed_followups: 'Missed follow-ups',
};

const NEXT_ACTIONS: Record<RevenueLeak['category'], string> = {
  lapsed_customers: 'Queue win-back follow-up',
  open_estimates: 'Call to close estimate',
  memberships: 'Offer renewal or upgrade',
  open_balances: 'Send payment link or call',
  failed_followups: 'Retry failed SMS/email',
};

function toRecoveryItem(leak: RevenueLeak): RecoveryItem {
  return {
    id: leak.id,
    category: CATEGORY_LABELS[leak.category],
    title: leak.title,
    detail: leak.detail,
    recoverableCents: leak.potentialCents,
    count: leak.count,
    nextAction: NEXT_ACTIONS[leak.category],
    href: leak.href,
  };
}

export function buildRecoveryEngine(leaks: RevenueLeak[]): RecoveryEngine {
  const items = leaks.map(toRecoveryItem);
  return {
    recoverableTodayCents: items.reduce((s, i) => s + i.recoverableCents, 0),
    items,
  };
}
