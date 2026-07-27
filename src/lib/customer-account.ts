import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverableCustomerEmail } from '@/lib/customer-contact';

export type CustomerAccountRow = {
  id: string;
  auth_user_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

export type CustomerAccountResolution =
  | { status: 'resolved'; customer: CustomerAccountRow }
  | { status: 'conflict'; customer: null }
  | { status: 'unavailable'; customer: null };

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

export async function resolveAuthenticatedCustomerAccount(
  admin: SupabaseClient,
  input: { authUserId: string; email: string; fullName?: string | null },
): Promise<CustomerAccountResolution> {
  const authUserId = str(input.authUserId);
  const email = deliverableCustomerEmail(input.email);
  if (!authUserId || !email) return { status: 'unavailable', customer: null };

  const byAuth = await admin
    .from('customers')
    .select('id, auth_user_id, email, full_name, phone')
    .eq('auth_user_id', authUserId)
    .limit(1)
    .maybeSingle();
  if (byAuth.error) return { status: 'unavailable', customer: null };
  let customer = (byAuth.data ?? null) as CustomerAccountRow | null;

  if (!customer) {
    const byEmail = await admin
      .from('customers')
      .select('id, auth_user_id, email, full_name, phone')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (byEmail.error) return { status: 'unavailable', customer: null };
    customer = (byEmail.data ?? null) as CustomerAccountRow | null;
    const existingOwner = str(customer?.auth_user_id);
    if (existingOwner && existingOwner !== authUserId) {
      return { status: 'conflict', customer: null };
    }
  }

  if (!customer) {
    let inserted = await admin
      .from('customers')
      .insert({
        auth_user_id: authUserId,
        email,
        full_name: str(input.fullName) || null,
        portal_account_linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id, auth_user_id, email, full_name, phone')
      .maybeSingle();
    if (inserted.error && /column|schema cache/i.test(inserted.error.message)) {
      inserted = await admin
        .from('customers')
        .insert({ email, full_name: str(input.fullName) || null })
        .select('id, email, full_name, phone')
        .maybeSingle();
    }
    if (inserted.error) return { status: 'unavailable', customer: null };
    customer = (inserted.data ?? null) as CustomerAccountRow | null;
  }

  if (!customer?.id) return { status: 'unavailable', customer: null };

  const patch: Record<string, unknown> = {};
  if (!str(customer.auth_user_id)) patch.auth_user_id = authUserId;
  if (deliverableCustomerEmail(customer.email) !== email) {
    const emailOwner = await admin
      .from('customers')
      .select('id, auth_user_id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    if (emailOwner.error) return { status: 'unavailable', customer: null };
    if (emailOwner.data?.id && String(emailOwner.data.id) !== customer.id) {
      return { status: 'conflict', customer: null };
    }
    patch.email = email;
  }
  if (!str(customer.full_name) && str(input.fullName)) patch.full_name = str(input.fullName);
  if (Object.keys(patch).length) {
    patch.portal_account_linked_at = new Date().toISOString();
    patch.updated_at = new Date().toISOString();
    const updated = await admin
      .from('customers')
      .update(patch)
      .eq('id', customer.id)
      .or(`auth_user_id.is.null,auth_user_id.eq.${authUserId}`)
      .select('id, auth_user_id, email, full_name, phone')
      .maybeSingle();
    if (updated.error) return { status: 'unavailable', customer: null };
    if (!updated.data) return { status: 'conflict', customer: null };
    customer = updated.data as CustomerAccountRow;
  }

  if (deliverableCustomerEmail(customer.email) === email) {
    await admin
      .from('profiles')
      .update({ email })
      .eq('id', authUserId);
    await admin
      .from('appointments')
      .update({ guest_email: email, updated_at: new Date().toISOString() })
      .eq('customer_id', customer.id)
      .not('status', 'in', '("cancelled","canceled","completed","no_show","deleted","archived")');
  }

  return { status: 'resolved', customer };
}

export async function resolveAuthenticatedCustomer(
  admin: SupabaseClient,
  input: { authUserId: string; email: string; fullName?: string | null },
): Promise<CustomerAccountRow | null> {
  const resolution = await resolveAuthenticatedCustomerAccount(admin, input);
  return resolution.status === 'resolved' ? resolution.customer : null;
}

export async function customerOwnsWorkOrder(
  admin: SupabaseClient,
  input: { authUserId: string; email: string; customerId?: unknown; guestEmail?: unknown },
) {
  const customer = await resolveAuthenticatedCustomer(admin, {
    authUserId: input.authUserId,
    email: input.email,
  });
  if (!customer) return false;
  const jobCustomerId = str(input.customerId);
  if (jobCustomerId) return jobCustomerId === customer.id;
  const jobEmail = deliverableCustomerEmail(input.guestEmail);
  return Boolean(jobEmail && jobEmail === deliverableCustomerEmail(input.email));
}
