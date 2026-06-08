'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { syncRecentStripeFinance } from '@/lib/stripe-finance-sync';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function resyncStripeTransactionsAction(formData?: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return;
  const secrets = await getStripeSecrets(admin);
  if (!secrets.secretKey) return;
  const stripe = new Stripe(secrets.secretKey);
  await syncRecentStripeFinance(stripe, admin);
  const scope = String(formData?.get('scope') ?? 'all').trim() || 'all';
  await admin.from('financial_ledger').insert({
    source: 'stripe',
    type: 'adjustment',
    amount: 0,
    gross_amount: 0,
    fee_amount: 0,
    net_amount: 0,
    description: `Manual Stripe resync completed (${scope})`,
    category: 'sync_marker',
    occurred_at: new Date().toISOString(),
  });
  revalidatePath('/admin/stripe-sync');
  revalidatePath('/admin/revenue');
}

export async function addManualExpenseAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return;
  const description = String(formData.get('description') ?? '').trim();
  const amount = Math.round(Number(String(formData.get('amount') ?? '0')) * 100);
  if (!description || amount <= 0) return;
  const category = String(formData.get('category') ?? 'other').trim() || 'other';
  const occurredAt = String(formData.get('occurred_at') ?? '').trim();
  const occurred_at = occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : new Date().toISOString();
  const isTest = formData.get('is_test') === 'on';
  const exclude = formData.get('exclude_from_reports') === 'on';
  const { data } = await admin.from('expenses').insert({
    description,
    category,
    amount_cents: amount,
    payment_method: String(formData.get('payment_method') ?? 'other'),
    occurred_at,
    is_test: isTest,
    exclude_from_reports: exclude,
    created_by: session.user.id,
  }).select('id').maybeSingle();
  await admin.from('financial_ledger').insert({
    source: 'manual',
    type: 'expense',
    amount: -Math.abs(amount),
    gross_amount: -Math.abs(amount),
    fee_amount: 0,
    net_amount: -Math.abs(amount),
    description,
    category,
    is_test: isTest,
    exclude_from_reports: exclude,
    occurred_at,
    metadata: { expense_id: data?.id ?? null },
  });
  revalidatePath('/admin/stripe-sync');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
}
