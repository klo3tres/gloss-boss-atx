import type { SupabaseClient } from '@supabase/supabase-js';
import { deliverableCustomerEmail } from '@/lib/customer-contact';

type CustomerAccountRow = {
  id: string;
  auth_user_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

export async function resolveAuthenticatedCustomer(
  admin: SupabaseClient,
  input: { authUserId: string; email: string; fullName?: string | null },
): Promise<CustomerAccountRow | null> {
  const authUserId = str(input.authUserId);
  const email = deliverableCustomerEmail(input.email);
  if (!authUserId || !email) return null;

  const byAuth = await admin
    .from('customers')
    .select('id, auth_user_id, email, full_name, phone')
    .eq('auth_user_id', authUserId)
    .limit(1)
    .maybeSingle();
  let customer = (byAuth.data ?? null) as CustomerAccountRow | null;

  if (!customer) {
    const byEmail = await admin
      .from('customers')
      .select('id, auth_user_id, email, full_name, phone')
      .ilike('email', email)
      .limit(1)
      .maybeSingle();
    customer = (byEmail.data ?? null) as CustomerAccountRow | null;
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
    customer = (inserted.data ?? null) as CustomerAccountRow | null;
  }

  if (!customer?.id) return null;

  const patch: Record<string, unknown> = {};
  if (!str(customer.auth_user_id)) patch.auth_user_id = authUserId;
  if (!deliverableCustomerEmail(customer.email)) patch.email = email;
  if (!str(customer.full_name) && str(input.fullName)) patch.full_name = str(input.fullName);
  if (Object.keys(patch).length) {
    patch.portal_account_linked_at = new Date().toISOString();
    patch.updated_at = new Date().toISOString();
    const updated = await admin
      .from('customers')
      .update(patch)
      .eq('id', customer.id)
      .select('id, auth_user_id, email, full_name, phone')
      .maybeSingle();
    if (updated.data) customer = updated.data as CustomerAccountRow;
  }

  return customer;
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
  if (jobCustomerId && jobCustomerId === customer.id) return true;
  const jobEmail = deliverableCustomerEmail(input.guestEmail);
  return Boolean(jobEmail && jobEmail === deliverableCustomerEmail(input.email));
}
