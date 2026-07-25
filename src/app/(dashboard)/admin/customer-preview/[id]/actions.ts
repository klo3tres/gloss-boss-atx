'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';

function str(value: unknown) {
  return value == null ? '' : String(value).trim();
}

async function requireOwnerAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { session, admin };
}

export async function createCustomerQaCloneAction(
  sourceAppointmentId: string,
): Promise<ActionResult & { cloneId?: string; previewUrl?: string }> {
  const gate = await requireOwnerAdmin();
  if (!gate) return actionErr('Only an owner or admin can create a QA clone.');
  const { data: source, error: sourceError } = await gate.admin
    .from('appointments')
    .select('*')
    .eq('id', sourceAppointmentId)
    .maybeSingle();
  if (sourceError || !source) return actionErr(sourceError?.message ?? 'Source work order not found.');

  const allowedKeys = [
    'service_slug', 'vehicle_description', 'vehicle_class', 'base_price_cents',
    'deposit_amount_cents', 'required_deposit_cents', 'scheduled_start', 'scheduled_end',
    'service_address', 'service_city', 'service_state', 'service_zip',
    'booking_pricing_breakdown', 'booking_vehicles', 'vehicles', 'promo_code',
    'payment_choice', 'duration_minutes', 'service_duration_minutes', 'flexible_arrival',
    'admin_final_total_cents', 'final_total_cents', 'balance_due_cents',
  ];
  const clone: Record<string, unknown> = {};
  const row = source as Record<string, unknown>;
  for (const key of allowedKeys) {
    if (row[key] !== undefined) clone[key] = row[key];
  }
  const now = new Date();
  const ownerEmail = str(gate.session.user!.email).toLowerCase();
  const at = ownerEmail.lastIndexOf('@');
  const qaEmail = at > 0
    ? `${ownerEmail.slice(0, at)}+gbqa-${now.getTime()}${ownerEmail.slice(at)}`
    : ownerEmail || null;
  Object.assign(clone, {
    guest_name: `[QA] ${str(row.guest_name) || 'Customer flow'}`,
    guest_email: qaEmail,
    guest_phone: null,
    customer_id: null,
    assigned_technician_id: null,
    access_token: randomBytes(24).toString('hex'),
    status: 'confirmed',
    payment_status: 'awaiting_payment',
    deposit_paid_cents: 0,
    total_paid_cents: 0,
    is_test: true,
    qa_source_appointment_id: sourceAppointmentId,
    qa_expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    exclude_from_automations: true,
    exclude_from_customer_communications: true,
    notes: 'Controlled owner QA clone. Never contact the production customer.',
    portal_link_created_at: now.toISOString(),
    portal_link_open_count: 0,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
  const { data: created, error } = await gate.admin
    .from('appointments')
    .insert(clone)
    .select('id')
    .maybeSingle();
  if (error || !created?.id) return actionErr(error?.message ?? 'QA clone could not be created.');

  revalidatePath('/admin/work-orders');
  return {
    ...actionOk('Controlled QA clone created. It is excluded from production communication and reporting.'),
    cloneId: String(created.id),
    previewUrl: `/admin/customer-preview/${encodeURIComponent(String(created.id))}`,
  };
}

export async function cleanupCustomerQaCloneAction(
  cloneAppointmentId: string,
): Promise<ActionResult> {
  const gate = await requireOwnerAdmin();
  if (!gate) return actionErr('Only an owner or admin can clean up a QA clone.');
  const { data: clone } = await gate.admin
    .from('appointments')
    .select('id, is_test, qa_source_appointment_id, customer_id')
    .eq('id', cloneAppointmentId)
    .maybeSingle();
  if (!clone || clone.is_test !== true || !clone.qa_source_appointment_id) {
    return actionErr('Cleanup stopped: this is not a controlled QA clone.');
  }
  const { error } = await gate.admin.from('appointments').delete().eq('id', cloneAppointmentId);
  if (error) return actionErr(error.message);
  if (clone.customer_id) {
    const { data: qaCustomer } = await gate.admin
      .from('customers')
      .select('id, email, auth_user_id, is_test')
      .eq('id', clone.customer_id)
      .maybeSingle();
    if (qaCustomer?.is_test === true && str(qaCustomer.email).includes('+gbqa-')) {
      await gate.admin
        .from('customers')
        .update({ auth_user_id: null })
        .eq('id', qaCustomer.id);
      if (qaCustomer.auth_user_id) {
        await gate.admin.auth.admin.deleteUser(String(qaCustomer.auth_user_id));
      }
      await gate.admin.from('customers').delete().eq('id', qaCustomer.id);
    }
  }
  revalidatePath('/admin/work-orders');
  return actionOk('QA clone and its cascaded test events were removed.');
}

export async function repairCustomerAccountLinkageAction(
  appointmentId: string,
): Promise<ActionResult> {
  const gate = await requireOwnerAdmin();
  if (!gate) {
    return actionErr('Only an owner or admin can repair customer linkage.');
  }
  const { session, admin } = gate;

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
    confirmed_by: session.user!.id,
    confirmed_at: now,
    completed_at: now,
  });

  revalidatePath(`/admin/customer-preview/${appointmentId}`);
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  return actionOk('Staff account contamination removed. The customer can now claim the existing record safely.');
}
