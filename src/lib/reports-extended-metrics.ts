import type { SupabaseClient } from '@supabase/supabase-js';
import { displayMoney } from '@/lib/display-format';

export type ExtendedReportMetrics = {
  avgTicketCents: number;
  avgTicketLabel: string;
  customerLtvCents: number;
  customerLtvLabel: string;
  referralRevenueCents: number;
  referralRevenueLabel: string;
  referralConversionRate: number;
  membershipMrrCents: number;
  membershipMrrLabel: string;
  fleetPipelineCents: number;
  fleetPipelineLabel: string;
  upsellOpportunityCount: number;
};

export async function loadExtendedReportMetrics(
  admin: SupabaseClient,
  range: { startIso: string; endIso: string },
): Promise<ExtendedReportMetrics> {
  const { startIso, endIso } = range;

  const [payments, customers, referralEvents, memberships, fleetInquiries] = await Promise.all([
    admin
      .from('payments')
      .select('amount_cents')
      .eq('status', 'succeeded')
      .gte('paid_at', startIso)
      .lte('paid_at', endIso),
    admin.from('customers').select('id, lifetime_value_cents').limit(5000),
    admin.from('referral_events').select('id, status, reward_value_cents').gte('created_at', startIso).lte('created_at', endIso),
    admin
      .from('customer_memberships')
      .select('price_cents, billing_interval, status')
      .in('status', ['active', 'trialing', 'past_due']),
    admin
      .from('fleet_inquiries')
      .select('quote_amount_cents, status')
      .in('status', ['quoted', 'negotiating', 'new']),
  ]);

  let opportunityRows: Record<string, unknown>[] = [];
  try {
    const oppRes = await admin
      .from('titan_revenue_opportunities')
      .select('id, estimated_revenue_cents, status')
      .in('status', ['new', 'follow_up', 'quoted']);
    opportunityRows = (oppRes.data ?? []) as Record<string, unknown>[];
  } catch {
    opportunityRows = [];
  }

  const payAmounts = (payments.data ?? []).map((p) => Number((p as { amount_cents?: number }).amount_cents ?? 0)).filter((n) => n > 0);
  const avgTicketCents = payAmounts.length ? Math.round(payAmounts.reduce((a, b) => a + b, 0) / payAmounts.length) : 0;

  const ltvValues = (customers.data ?? [])
    .map((c) => Number((c as { lifetime_value_cents?: number }).lifetime_value_cents ?? 0))
    .filter((n) => n > 0);
  const customerLtvCents = ltvValues.length ? Math.round(ltvValues.reduce((a, b) => a + b, 0) / ltvValues.length) : 0;

  const refRows = referralEvents.data ?? [];
  const completed = refRows.filter((e) => ['completed', 'reward_issued', 'booked'].includes(String((e as { status?: string }).status)));
  const referralRevenueCents = completed.reduce((s, e) => s + Number((e as { reward_value_cents?: number }).reward_value_cents ?? 0), 0);
  const referralConversionRate = refRows.length ? Math.round((completed.length / refRows.length) * 100) : 0;

  const mrr = (memberships.data ?? []).reduce((s, m) => {
    const cents = Number((m as { price_cents?: number }).price_cents ?? 0);
    const interval = String((m as { billing_interval?: string }).billing_interval ?? 'monthly');
    if (interval === 'yearly') return s + Math.round(cents / 12);
    if (interval === 'weekly') return s + cents * 4;
    if (interval === 'biweekly') return s + cents * 2;
    return s + cents;
  }, 0);

  const fleetPipelineCents = (fleetInquiries.data ?? []).reduce(
    (s, f) => s + Number((f as { quote_amount_cents?: number }).quote_amount_cents ?? 0),
    0,
  );

  const upsellOpportunityCount = opportunityRows.length;

  return {
    avgTicketCents,
    avgTicketLabel: displayMoney(avgTicketCents),
    customerLtvCents,
    customerLtvLabel: displayMoney(customerLtvCents),
    referralRevenueCents,
    referralRevenueLabel: displayMoney(referralRevenueCents),
    referralConversionRate,
    membershipMrrCents: mrr,
    membershipMrrLabel: displayMoney(mrr),
    fleetPipelineCents,
    fleetPipelineLabel: displayMoney(fleetPipelineCents),
    upsellOpportunityCount,
  };
}
