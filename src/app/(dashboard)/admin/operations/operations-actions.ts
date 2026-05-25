'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id };
}

export async function addBusinessExpenseActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate) return actionErr('Forbidden');

  const amountDollars = Number(formData.get('amountDollars'));
  const category = String(formData.get('category') ?? '').trim() || 'general';
  const note = String(formData.get('note') ?? '').trim() || null;
  const incurredOn = String(formData.get('incurredOn') ?? '').trim() || new Date().toISOString().slice(0, 10);
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) return actionErr('Enter a valid amount.');

  const { error } = await gate.admin.from('business_expenses').insert({
    amount_cents: Math.round(amountDollars * 100),
    category,
    note,
    incurred_on: incurredOn,
    created_by: gate.userId,
  });
  if (error) return actionErr(error.message);
  revalidatePath('/admin/operations');
  return actionOk('Expense recorded.');
}

export async function addJobMileageLogActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate) return actionErr('Forbidden');

  const miles = Number(formData.get('miles'));
  const appointmentId = String(formData.get('appointmentId') ?? '').trim() || null;
  const note = String(formData.get('note') ?? '').trim() || null;
  const loggedOn = String(formData.get('loggedOn') ?? '').trim() || new Date().toISOString().slice(0, 10);
  if (!Number.isFinite(miles) || miles <= 0) return actionErr('Enter valid miles.');

  const { error } = await gate.admin.from('job_mileage_logs').insert({
    miles,
    appointment_id: appointmentId,
    note,
    logged_on: loggedOn,
    created_by: gate.userId,
  });
  if (error) return actionErr(error.message);
  revalidatePath('/admin/operations');
  return actionOk('Mileage logged.');
}

export async function addBusinessExpenseAction(formData: FormData) {
  return addBusinessExpenseActionState(null, formData);
}

export async function addJobMileageLogAction(formData: FormData) {
  return addJobMileageLogActionState(null, formData);
}
