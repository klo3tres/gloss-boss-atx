'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { upsertLedgerFromBalanceTransaction } from '@/lib/financial-ledger';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function resyncStripeTransactionsAction() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return;
  const secrets = await getStripeSecrets(admin);
  if (!secrets.secretKey) return;
  const stripe = new Stripe(secrets.secretKey);
  const txs = await stripe.balanceTransactions.list({ limit: 100 });
  for (const tx of txs.data) {
    await upsertLedgerFromBalanceTransaction(admin, tx);
  }
  await admin.from('financial_ledger').insert({
    source: 'stripe',
    type: 'adjustment',
    amount: 0,
    gross_amount: 0,
    fee_amount: 0,
    net_amount: 0,
    description: 'Manual Stripe resync completed',
    category: 'sync_marker',
    occurred_at: new Date().toISOString(),
  });
  revalidatePath('/admin/stripe-sync');
  revalidatePath('/admin/revenue');
}
