import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';

export type FinancialSummary = {
  grossRevenueCents: number;
  refundsCents: number;
  stripeFeesCents: number;
  expensesCents: number;
  netProfitCents: number;
  payoutsCents: number;
};

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export async function upsertLedgerFromBalanceTransaction(
  db: SupabaseClient | null | undefined,
  tx: Stripe.BalanceTransaction,
  refs?: {
    paymentIntentId?: string | null;
    chargeId?: string | null;
    payoutId?: string | null;
    paymentId?: string | null;
    workOrderId?: string | null;
  },
) {
  if (!db) return;
  const fee = cents(tx.fee);
  const gross = cents(tx.amount);
  const net = cents(tx.net);
  const type =
    tx.type === 'refund' ? 'refund' :
    tx.type === 'stripe_fee' ? 'fee' :
    tx.type === 'payout' ? 'payout' :
    gross < 0 ? 'expense' :
    'revenue';
  const { error } = await db.from('financial_ledger').upsert(
    {
      source: 'stripe',
      type,
      amount: gross,
      gross_amount: gross,
      fee_amount: fee,
      net_amount: net,
      description: tx.description ?? tx.type,
      category: tx.type,
      stripe_payment_intent_id: refs?.paymentIntentId ?? null,
      stripe_charge_id: refs?.chargeId ?? null,
      stripe_balance_transaction_id: tx.id,
      stripe_payout_id: refs?.payoutId ?? null,
      work_order_id: refs?.workOrderId ?? null,
      payment_id: refs?.paymentId ?? null,
      occurred_at: new Date(tx.created * 1000).toISOString(),
      metadata: tx as unknown as Record<string, unknown>,
    },
    { onConflict: 'stripe_balance_transaction_id' },
  );
  if (error) console.warn('[financial-ledger] upsert balance transaction skipped', error.message);
}

export async function fetchFinancialSummary(
  db: SupabaseClient,
  fromIso: string,
  toIso: string,
  opts?: { includeTest?: boolean },
): Promise<FinancialSummary> {
  const [ledgerRes, expensesRes] = await Promise.all([
    db
      .from('financial_ledger')
      .select('type, gross_amount, fee_amount, net_amount, amount, is_test, exclude_from_reports')
      .gte('occurred_at', fromIso)
      .lte('occurred_at', toIso)
      .limit(10000),
    db
      .from('expenses')
      .select('amount_cents, is_test, exclude_from_reports')
      .gte('occurred_at', fromIso)
      .lte('occurred_at', toIso)
      .limit(10000),
  ]);

  const summary: FinancialSummary = {
    grossRevenueCents: 0,
    refundsCents: 0,
    stripeFeesCents: 0,
    expensesCents: 0,
    netProfitCents: 0,
    payoutsCents: 0,
  };

  for (const row of ledgerRes.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!opts?.includeTest && r.is_test === true) continue;
    if (r.exclude_from_reports === true) continue;
    const type = String(r.type ?? '');
    if (type === 'revenue') summary.grossRevenueCents += Math.max(0, cents(r.gross_amount || r.amount));
    if (type === 'refund') summary.refundsCents += Math.abs(cents(r.gross_amount || r.amount));
    if (type === 'fee') summary.stripeFeesCents += Math.abs(cents(r.fee_amount || r.amount));
    if (type === 'expense') summary.expensesCents += Math.abs(cents(r.amount));
    if (type === 'payout') summary.payoutsCents += Math.abs(cents(r.amount));
    if (type === 'revenue') summary.stripeFeesCents += Math.max(0, cents(r.fee_amount));
  }

  for (const row of expensesRes.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!opts?.includeTest && r.is_test === true) continue;
    if (r.exclude_from_reports === true) continue;
    summary.expensesCents += Math.max(0, cents(r.amount_cents));
  }

  summary.netProfitCents =
    summary.grossRevenueCents - summary.refundsCents - summary.stripeFeesCents - summary.expensesCents;
  return summary;
}
