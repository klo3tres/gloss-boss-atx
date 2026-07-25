'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

export async function repairCustomerAccountLinkageAction(
  appointmentId: string,
): Promise<ActionResult> {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) {
    return actionErr('Only an owner or admin can repair customer linkage.');
  }

  const { data: appointment } = await admin
    .from('appointments')
    .select('id, customer_id, portal_link_last_opened_at, customer_claimed_account_at')
    .eq('id', appointmentId)
    .maybeSingle();
  const customerId = str(appointment?.customer_id);
  if (!appointment || !customerId) return actionErr('Work order or customer record not found.');

  const { data: customer } = await admin
    .from('customers')
    .select('id, auth_user_id, portal_account_linked_at')
    .eq('id', customerId)
    .maybeSingle();
  const authUserId = str(customer?.auth_user_id);
  if (!customer || !authUserId) return actionOk('Customer account linkage is already ready.');

  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', authUserId)
    .maybeSingle();
  const linkedRole = str(profile?.role);
  if (!['super_admin', 'admin', 'dispatcher', 'technician', 'viewer'].includes(linkedRole)) {
    return actionErr('Safe repair stopped: the linked account is not a staff account and needs manual review.');
  }

  const linkedAt = str(customer.portal_account_linked_at);
  const openedAt = str(appointment.portal_link_last_opened_at);
  const openedByStaffClaim =
    linkedAt &&
    openedAt &&
    Math.abs(new Date(linkedAt).getTime() - new Date(openedAt).getTime()) < 120_000;
  const now = new Date().toISOString();
  const beforeState = {
    customer_id: customerId,
    linked_to_staff_role: linkedRole,
    portal_open_contaminated: Boolean(openedByStaffClaim),
  };

  const customerUpdate = await admin
    .from('customers')
    .update({ auth_user_id: null, portal_account_linked_at: null, updated_at: now })
    .eq('id', customerId)
    .eq('auth_user_id', authUserId);
  if (customerUpdate.error) return actionErr(customerUpdate.error.message);

  const appointmentPatch: Record<string, unknown> = {
    customer_claimed_account_at: null,
    updated_at: now,
  };
  if (openedByStaffClaim) {
    appointmentPatch.portal_link_first_opened_at = null;
    appointmentPatch.portal_link_last_opened_at = null;
    appointmentPatch.portal_link_open_count = 0;
  }
  const appointmentUpdate = await admin
    .from('appointments')
    .update(appointmentPatch)
    .eq('id', appointmentId);
  if (appointmentUpdate.error) return actionErr(appointmentUpdate.error.message);

  await admin.from('business_integrity_repairs').insert({
    issue_key: `portal-staff-account-link:${appointmentId}`,
    related_records: [{ type: 'appointment', id: appointmentId }, { type: 'customer', id: customerId }],
    repair_action: 'Removed staff authentication identity from customer record and excluded the contaminated owner open.',
    status: 'completed',
    sensitive: true,
    before_state: beforeState,
    after_state: { customer_account_unclaimed: true, customer_open_count: openedByStaffClaim ? 0 : 'unchanged' },
    confirmed_by: session.user.id,
    confirmed_at: now,
    completed_at: now,
  });

  revalidatePath(`/admin/customer-preview/${appointmentId}`);
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  return actionOk('Staff account contamination removed. The customer can now claim the existing record safely.');
}
