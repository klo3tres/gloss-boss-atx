'use server';

import { revalidatePath } from 'next/cache';
import Stripe from 'stripe';
import { getSessionWithProfile } from '@/lib/auth/session';
import { normalizeSmsConsentStatus } from '@/lib/sms-consent';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import type { ThemePreference } from '@/components/theme/theme-provider';
import { resolveAuthenticatedCustomer } from '@/lib/customer-account';
import { insertCustomerVehicle, updateCustomerVehicle, type CrmVehicleRow } from '@/lib/crm-vehicles-db';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { deliverableCustomerEmail } from '@/lib/customer-contact';
import { appOrigin } from '@/lib/auth/action-link-registry';

export type CustomerSettingsActionResult =
  | { ok: true; message: string; vehicle?: CrmVehicleRow }
  | { ok: false; error: string };

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

async function authenticatedCustomer() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  const email = session.user?.email?.trim().toLowerCase() ?? '';
  if (!session.user?.id || !email || !admin) return null;
  const customer = await resolveAuthenticatedCustomer(admin, {
    authUserId: session.user.id,
    email,
    fullName: session.profile?.full_name,
  });
  if (!customer?.id) return null;
  return { session, admin, customer };
}

export async function updateThemePreferenceAction(preference: ThemePreference) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user?.id || !admin) return;
  if (!['light', 'dark', 'system'].includes(preference)) return;
  await admin.from('profiles').update({ theme_preference: preference }).eq('id', session.user.id);
  revalidatePath('/dashboard/settings');
}

export async function updateCustomerSmsPreferencesAction(formData: FormData) {
  const context = await authenticatedCustomer();
  if (!context) return;
  const { admin, customer } = context;

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
    .eq('id', customer.id);

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
}

export async function updateCustomerEmailPreferencesAction(formData: FormData) {
  const context = await authenticatedCustomer();
  if (!context) return;
  const { admin, customer, session } = context;

  const emailMarketingOptIn = formData.get('email_marketing_opt_in') === 'on';
  const { data: existing } = await admin.from('customers').select('id, email_marketing_opt_in').eq('id', customer.id).maybeSingle();
  const prev = (existing as { email_marketing_opt_in?: boolean | null } | null)?.email_marketing_opt_in;

  await admin
    .from('customers')
    .update({
      email_marketing_opt_in: emailMarketingOptIn,
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id);

  const customerId = (existing as { id?: string } | null)?.id;
  if (customerId) {
    const { logSmsConsentChange } = await import('@/lib/sms-consent');
    await logSmsConsentChange(admin, {
      customerId,
      changedBy: session.user!.id,
      source: 'customer_profile',
      previousConsent: prev === true,
      newConsent: emailMarketingOptIn,
      note: `Email marketing opt-in: ${emailMarketingOptIn ? 'yes' : 'no'}`,
    });
  }

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
}

export async function updateCustomerProfileAction(input: {
  fullName: string;
  email: string;
  phone: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}): Promise<CustomerSettingsActionResult> {
  const context = await authenticatedCustomer();
  if (!context) return { ok: false, error: 'Your account could not be loaded. Please sign in again.' };
  const { admin, customer, session } = context;
  const fullName = str(input.fullName).slice(0, 120);
  const nextEmail = deliverableCustomerEmail(input.email);
  const currentEmail = deliverableCustomerEmail(session.user?.email);
  const phone = str(input.phone).slice(0, 40);
  if (!fullName) return { ok: false, error: 'Name is required.' };
  if (!nextEmail) return { ok: false, error: 'Enter a valid email address.' };
  if (nextEmail !== currentEmail) {
    const { data: emailOwner } = await admin
      .from('customers')
      .select('id')
      .ilike('email', nextEmail)
      .limit(1)
      .maybeSingle();
    if (emailOwner?.id && String(emailOwner.id) !== customer.id) {
      return { ok: false, error: 'That email is already connected to another customer account.' };
    }
  }

  const patch = {
    full_name: fullName,
    phone: phone || null,
    address_line1: str(input.addressLine1).slice(0, 200) || null,
    address_line2: str(input.addressLine2).slice(0, 200) || null,
    city: str(input.city).slice(0, 100) || null,
    state: str(input.state).slice(0, 40) || null,
    postal_code: str(input.postalCode).slice(0, 20) || null,
    updated_at: new Date().toISOString(),
  };
  let update = await admin.from('customers').update(patch).eq('id', customer.id);
  if (update.error && /column|schema cache/i.test(update.error.message)) {
    update = await admin
      .from('customers')
      .update({ full_name: fullName, phone: phone || null, updated_at: new Date().toISOString() })
      .eq('id', customer.id);
  }
  if (update.error) return { ok: false, error: 'Your profile could not be saved. Please try again.' };

  await admin.from('profiles').update({ full_name: fullName }).eq('id', session.user!.id);
  await admin
    .from('appointments')
    .update({
      guest_name: fullName,
      guest_phone: phone || null,
      updated_at: new Date().toISOString(),
    })
    .eq('customer_id', customer.id)
    .not('status', 'in', '("cancelled","canceled","completed","no_show","deleted","archived")');

  let message = 'Profile saved.';
  if (nextEmail !== currentEmail) {
    const authClient = await createSupabaseServerClient();
    if (!authClient) return { ok: false, error: 'Email changes are temporarily unavailable.' };
    const redirectTo = `${appOrigin()}/auth/callback?next=${encodeURIComponent('/dashboard/settings?email_changed=1')}&type=email`;
    const emailChange = await authClient.auth.updateUser(
      { email: nextEmail },
      { emailRedirectTo: redirectTo },
    );
    if (emailChange.error) {
      return { ok: false, error: 'Your profile was saved, but the email change could not be started. Please try again.' };
    }
    message = 'Profile saved. Check your email to confirm the new address.';
  }
  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  return { ok: true, message };
}

export async function addCustomerVehicleAction(input: {
  description: string;
  notes?: string;
}): Promise<CustomerSettingsActionResult> {
  const context = await authenticatedCustomer();
  if (!context) return { ok: false, error: 'Your account could not be loaded. Please sign in again.' };
  const description = str(input.description).slice(0, 160);
  if (!description) return { ok: false, error: 'Enter the vehicle year, make, and model.' };
  try {
    const inserted = await insertCustomerVehicle(context.admin, {
      customerId: context.customer.id,
      description,
      notes: str(input.notes).slice(0, 1000),
    });
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/settings');
    return {
      ok: true,
      message: 'Vehicle added to your garage.',
      vehicle: {
        id: inserted.id,
        customer_id: context.customer.id,
        description,
        notes: str(input.notes).slice(0, 1000) || null,
        created_at: new Date().toISOString(),
      },
    };
  } catch {
    return { ok: false, error: 'The vehicle could not be added. Please try again.' };
  }
}

export async function updateCustomerVehicleAction(input: {
  vehicleId: string;
  description: string;
  notes?: string;
}): Promise<CustomerSettingsActionResult> {
  const context = await authenticatedCustomer();
  if (!context) return { ok: false, error: 'Your account could not be loaded. Please sign in again.' };
  const vehicleId = str(input.vehicleId);
  const description = str(input.description).slice(0, 160);
  if (!vehicleId || !description) return { ok: false, error: 'Vehicle information is incomplete.' };
  try {
    await updateCustomerVehicle(context.admin, {
      customerId: context.customer.id,
      vehicleId,
      description,
      notes: str(input.notes).slice(0, 1000),
    });
    revalidatePath('/dashboard');
    revalidatePath('/dashboard/settings');
    return { ok: true, message: 'Vehicle updated.' };
  } catch {
    return { ok: false, error: 'The vehicle could not be updated. Please try again.' };
  }
}

export async function cancelCustomerMembershipAction(formData: FormData) {
  const context = await authenticatedCustomer();
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!context || !membershipId) return;
  const { admin, customer } = context;
  const customerId = customer.id;

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

export async function pauseCustomerMembershipAction(formData: FormData) {
  const context = await authenticatedCustomer();
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!context || !membershipId) return;
  const { admin, customer } = context;
  const customerId = customer.id;

  const { data: membership } = await admin
    .from('customer_memberships')
    .select('id, stripe_subscription_id')
    .eq('id', membershipId)
    .eq('customer_id', customerId)
    .maybeSingle();
  const subId = String((membership as { stripe_subscription_id?: string } | null)?.stripe_subscription_id ?? '').trim();
  if (subId) {
    const secrets = await getStripeSecrets(admin);
    if (secrets.secretKey) {
      try {
        const stripe = new Stripe(secrets.secretKey);
        await stripe.subscriptions.update(subId, { pause_collection: { behavior: 'mark_uncollectible' } });
      } catch (e) {
        console.warn('[customer-settings] pause membership', e);
      }
    }
  }
  await admin.from('customer_memberships').update({ status: 'paused', updated_at: new Date().toISOString() }).eq('id', membershipId).eq('customer_id', customerId);
  revalidatePath('/dashboard/settings');
}

export async function resumeCustomerMembershipAction(formData: FormData) {
  const context = await authenticatedCustomer();
  const membershipId = String(formData.get('membershipId') ?? '').trim();
  if (!context || !membershipId) return;
  const { admin, customer } = context;
  const customerId = customer.id;

  const { data: membership } = await admin
    .from('customer_memberships')
    .select('id, stripe_subscription_id')
    .eq('id', membershipId)
    .eq('customer_id', customerId)
    .maybeSingle();
  const subId = String((membership as { stripe_subscription_id?: string } | null)?.stripe_subscription_id ?? '').trim();
  if (subId) {
    const secrets = await getStripeSecrets(admin);
    if (secrets.secretKey) {
      try {
        const stripe = new Stripe(secrets.secretKey);
        await stripe.subscriptions.update(subId, { pause_collection: '' });
      } catch (e) {
        console.warn('[customer-settings] resume membership', e);
      }
    }
  }
  await admin.from('customer_memberships').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', membershipId).eq('customer_id', customerId);
  revalidatePath('/dashboard/settings');
}
