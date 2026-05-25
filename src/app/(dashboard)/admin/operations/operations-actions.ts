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
  const notes = String(formData.get('note') ?? formData.get('notes') ?? '').trim() || null;
  const incurredAt = String(formData.get('incurredOn') ?? formData.get('incurredAt') ?? '').trim() || new Date().toISOString();
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) return actionErr('Enter a valid amount.');

  const row = {
    amount_cents: Math.round(amountDollars * 100),
    category,
    notes,
    incurred_at: incurredAt,
    created_by: gate.userId,
  };
  let { error } = await gate.admin.from('business_expenses').insert(row);
  if (error && /incurred_at|notes|column/i.test(error.message)) {
    ({ error } = await gate.admin.from('business_expenses').insert({
      amount_cents: row.amount_cents,
      category: row.category,
      created_by: gate.userId,
    }));
  }
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
  if (!Number.isFinite(miles) || miles <= 0) return actionErr('Enter valid miles.');

  const row = {
    total_miles: miles,
    appointment_id: appointmentId,
    notes: note,
    created_by: gate.userId,
  };
  let { error } = await gate.admin.from('job_mileage_logs').insert(row);
  if (error && /total_miles|notes|column/i.test(error.message)) {
    ({ error } = await gate.admin.from('job_mileage_logs').insert({
      estimated_miles: miles,
      appointment_id: appointmentId,
      created_by: gate.userId,
    }));
  }
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
