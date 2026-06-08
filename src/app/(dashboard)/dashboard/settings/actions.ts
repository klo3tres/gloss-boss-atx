'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { normalizeSmsConsentStatus } from '@/lib/sms-consent';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function updateCustomerSmsPreferencesAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  const email = session.user?.email?.trim().toLowerCase();
  if (!session.user || !email || !admin) return;

  const smsConsent = formData.get('sms_consent') === 'on';
  await admin
    .from('customers')
    .update({
      sms_consent: smsConsent,
      sms_status: normalizeSmsConsentStatus(smsConsent),
      sms_consent_source: 'customer_dashboard_settings',
      sms_consent_timestamp: new Date().toISOString(),
      sms_opt_out_timestamp: smsConsent ? null : new Date().toISOString(),
    })
    .ilike('email', email);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
}

export async function cancelCustomerMembershipAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  const email = session.user?.email?.trim().toLowerCase();
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!session.user || !email || !membershipId || !admin) return;

  const { data: customer } = await admin.from('customers').select('id').ilike('email', email).maybeSingle();
  const customerId = (customer as { id?: string } | null)?.id;
  if (!customerId) return;

  const { data: membership } = await admin
    .from('customer_memberships')
    .select('id, customer_id, stripe_subscription_id')
    .eq('id', membershipId)
    .eq('customer_id', customerId)
    .maybeSingle();
  const row = membership as { stripe_subscription_id?: string | null } | null;
  if (!row) return;

  const stripeSubscriptionId = String(row.stripe_subscription_id ?? '').trim();
  if (stripeSubscriptionId) {
    const secrets = await getStripeSecrets(admin);
    if (secrets.secretKey) {
      try {
        const stripe = new Stripe(secrets.secretKey);
        await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
      } catch (e) {
        console.warn('[customer-settings] stripe membership cancellation skipped', e instanceof Error ? e.message : e);
      }
    }
  }

  await admin
    .from('customer_memberships')
    .update({
      status: stripeSubscriptionId ? 'canceling' : 'canceled',
      ends_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', membershipId)
    .eq('customer_id', customerId);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath('/admin/memberships');
}
