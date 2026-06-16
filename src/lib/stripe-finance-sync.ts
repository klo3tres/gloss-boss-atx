import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { upsertLedgerFromBalanceTransaction } from '@/lib/financial-ledger';
import { resolveStripePaymentTarget, upsertMergedStripePayment } from '@/lib/stripe-payment-resolve';

export type StripeFinanceSnapshot = {
  paymentAvailableCents: number | null;
  paymentPendingCents: number | null;
  treasuryAvailableCents: number | null;
  treasuryPendingCents: number | null;
  treasuryUnavailableReason: string | null;
  issuingUnavailableReason: string | null;
  recentPayments: Array<{
    id: string;
    amount: number;
    status: string;
    created: number;
    description?: string | null;
    paymentIntentId?: string | null;
    checkoutSessionId?: string | null;
    customerEmail?: string | null;
    customerName?: string | null;
  }>;
  recentTransfers: Array<{ id: string; amount: number; created: number; destination?: string | null; description?: string | null }>;
  recentCardSpends: Array<{ id: string; amount: number; created: number; merchant?: string | null; status?: string | null }>;
};

function sumStripeMoney(rows: Array<{ amount: number; currency?: string | null }>) {
  return rows.filter((r) => (r.currency ?? 'usd').toLowerCase() === 'usd').reduce((s, r) => s + r.amount, 0);
}

function errorMessage(e: unknown) {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message) : 'Unavailable';
}

async function writeStripeChargePayment(
  db: SupabaseClient,
  stripe: Stripe,
  row: Record<string, unknown>,
  charge: Stripe.Charge,
) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id ?? charge.id;
  const sessionId = typeof charge.metadata?.checkout_session_id === 'string' ? charge.metadata.checkout_session_id : null;
  const paidAt = new Date(charge.created * 1000).toISOString();
  const amountCents = charge.amount;

  const target = await resolveStripePaymentTarget(db, stripe, {
    charge,
    paymentIntentId: piId,
    sessionId,
    chargeId: charge.id,
    amountCents,
    customerEmail: charge.billing_details?.email,
    metadata: charge.metadata,
  });

  const result = await upsertMergedStripePayment(db, stripe, {
    appointmentId: target.appointmentId ?? (typeof row.appointment_id === 'string' ? row.appointment_id : null),
    fallbackBookingId: target.fallbackBookingId ?? (typeof row.fallback_booking_id === 'string' ? row.fallback_booking_id : null),
    customerId: target.customerId,
    amountCents,
    status: 'succeeded',
    paymentKind: String(charge.metadata?.stripe_checkout_kind ?? row.payment_kind ?? 'stripe_charge'),
    stripeCheckoutSessionId: sessionId || (typeof row.stripe_checkout_session_id === 'string' ? row.stripe_checkout_session_id : null),
    stripePaymentIntentId: piId,
    stripeChargeId: charge.id,
    paidAt,
    email: charge.billing_details?.email ?? null,
    source: 'stripe_finance_sync',
    matchReason: target.matchReason,
    metadata: {
      stripe_charge_id: charge.id,
      customer_email: charge.billing_details?.email ?? null,
      customer_name: charge.billing_details?.name ?? null,
      receipt_url: charge.receipt_url ?? null,
    },
  });

  if (!result.ok) {
    return { error: { message: result.error ?? 'upsert failed' } };
  }
  return { error: null };
}

export async function getStripeFinanceSnapshot(stripe: Stripe): Promise<StripeFinanceSnapshot> {
  let paymentAvailableCents: number | null = null;
  let paymentPendingCents: number | null = null;
  let treasuryAvailableCents: number | null = null;
  let treasuryPendingCents: number | null = null;
  let treasuryUnavailableReason: string | null = null;
  let issuingUnavailableReason: string | null = null;
  let recentPayments: StripeFinanceSnapshot['recentPayments'] = [];
  let recentTransfers: StripeFinanceSnapshot['recentTransfers'] = [];
  let recentCardSpends: StripeFinanceSnapshot['recentCardSpends'] = [];

  try {
    const balance = await stripe.balance.retrieve();
    paymentAvailableCents = sumStripeMoney(balance.available);
    paymentPendingCents = sumStripeMoney(balance.pending);
  } catch (e) {
    paymentAvailableCents = null;
    paymentPendingCents = null;
  }

  try {
    const charges = await stripe.charges.list({ limit: 25 });
    recentPayments = charges.data.map((c) => ({
      id: c.id,
      amount: c.amount,
      status: c.status,
      created: c.created,
      description: c.description ?? c.billing_details?.name ?? null,
      paymentIntentId: typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id ?? null,
      checkoutSessionId: typeof c.metadata?.checkout_session_id === 'string' ? c.metadata.checkout_session_id : null,
      customerEmail: c.billing_details?.email ?? null,
      customerName: c.billing_details?.name ?? null,
    }));
  } catch {
    recentPayments = [];
  }

  try {
    const transfers = await stripe.transfers.list({ limit: 10 });
    recentTransfers = transfers.data.map((t) => ({
      id: t.id,
      amount: t.amount,
      created: t.created,
      destination: typeof t.destination === 'string' ? t.destination : null,
      description: t.description ?? null,
    }));
  } catch {
    recentTransfers = [];
  }

  const syncTreasury = process.env.STRIPE_ENABLE_TREASURY_SYNC === 'true';
  const syncIssuing = process.env.STRIPE_ENABLE_ISSUING_SYNC === 'true';

  if (!syncTreasury) {
    treasuryUnavailableReason =
      'Card/Treasury sync disabled — set STRIPE_ENABLE_TREASURY_SYNC=true in Vercel after Stripe Treasury is enabled on your account.';
  }

  if (!syncIssuing) {
    issuingUnavailableReason =
      'Issuing card spend sync disabled — set STRIPE_ENABLE_ISSUING_SYNC=true in Vercel after Stripe Issuing is enabled.';
  }

  if (syncTreasury) {
    try {
      const treasury = (stripe as unknown as { treasury?: { financialAccounts?: { list: (args: { limit: number }) => Promise<{ data: Array<{ id: string; balance?: { cash?: { usd?: number }; inbound_pending?: { usd?: number }; outbound_pending?: { usd?: number } } }> }> } } }).treasury;
      if (!treasury?.financialAccounts?.list) throw new Error('Stripe Treasury API is not enabled for this key.');
      const accounts = await treasury.financialAccounts.list({ limit: 10 });
      treasuryAvailableCents = accounts.data.reduce((s, a) => s + (a.balance?.cash?.usd ?? 0), 0);
      treasuryPendingCents = accounts.data.reduce((s, a) => s + (a.balance?.inbound_pending?.usd ?? 0) - Math.abs(a.balance?.outbound_pending?.usd ?? 0), 0);
    } catch (e) {
      treasuryUnavailableReason = `Stripe Treasury/financial account access unavailable: ${errorMessage(e)}`;
    }
  }

  if (syncIssuing) {
    try {
      const issuing = (stripe as unknown as { issuing?: { transactions?: { list: (args: { limit: number }) => Promise<{ data: Array<{ id: string; amount: number; created: number; merchant_data?: { name?: string | null }; status?: string | null }> }> } } }).issuing;
      if (!issuing?.transactions?.list) throw new Error('Stripe Issuing API is not enabled for this key.');
      const txs = await issuing.transactions.list({ limit: 20 });
      recentCardSpends = txs.data.map((tx) => ({
        id: tx.id,
        amount: tx.amount,
        created: tx.created,
        merchant: tx.merchant_data?.name ?? null,
        status: tx.status ?? null,
      }));
    } catch (e) {
      issuingUnavailableReason = `Stripe Treasury/Issuing access unavailable: ${errorMessage(e)}`;
    }
  }

  return {
    paymentAvailableCents,
    paymentPendingCents,
    treasuryAvailableCents,
    treasuryPendingCents,
    treasuryUnavailableReason,
    issuingUnavailableReason,
    recentPayments,
    recentTransfers,
    recentCardSpends,
  };
}

export async function syncRecentStripeFinance(stripe: Stripe, db: SupabaseClient) {
  const summary = {
    balanceTransactions: 0,
    charges: 0,
    issuingTransactions: 0,
    errors: [] as string[],
  };
  try {
    const balanceTxs = await stripe.balanceTransactions.list({ limit: 100 });
    for (const tx of balanceTxs.data) {
      await upsertLedgerFromBalanceTransaction(db, tx);
      summary.balanceTransactions += 1;
    }
  } catch (e) {
    summary.errors.push(`Balance transactions: ${errorMessage(e)}`);
    console.warn('[stripe-finance-sync] balance transactions sync failed or unavailable', e);
  }

  try {
    const charges = await stripe.charges.list({ limit: 100 });
    for (const charge of charges.data) {
      if (charge.status !== 'succeeded' || charge.amount <= 0) continue;
      const up = await writeStripeChargePayment(db, stripe, {}, charge);
      if (up.error) {
        summary.errors.push(`Charge ${charge.id}: ${up.error.message}`);
        console.warn('[stripe-finance-sync] charge payment upsert failed', charge.id, up.error.message);
      } else {
        summary.charges += 1;
      }
    }
  } catch (e) {
    summary.errors.push(`Charges: ${errorMessage(e)}`);
    console.warn('[stripe-finance-sync] failed to sync charges into payments', e);
  }

  if (process.env.STRIPE_ENABLE_ISSUING_SYNC !== 'true') return summary;

  try {
    const issuing = (stripe as unknown as { issuing?: { transactions?: { list: (args: { limit: number }) => Promise<{ data: Array<Record<string, unknown> & { id: string; amount: number; created: number; merchant_data?: { name?: string | null } }> }> } } }).issuing;
    const txs = issuing?.transactions ? await issuing.transactions.list({ limit: 100 }) : { data: [] };
    for (const tx of txs.data) {
      await db.from('financial_ledger').upsert(
        {
          source: 'stripe',
          type: 'expense',
          amount: tx.amount,
          gross_amount: tx.amount,
          fee_amount: 0,
          net_amount: tx.amount,
          description: tx.merchant_data?.name ?? 'Stripe card spend',
          category: 'stripe_card_spend',
          stripe_issuing_transaction_id: tx.id,
          occurred_at: new Date(tx.created * 1000).toISOString(),
          metadata: tx,
        },
        { onConflict: 'stripe_issuing_transaction_id' },
      );
      summary.issuingTransactions += 1;
    }
  } catch (e) {
    summary.errors.push(`Issuing card spend: ${errorMessage(e)}`);
    console.warn('[stripe-finance-sync] issuing sync unavailable', e);
  }
  return summary;
}
