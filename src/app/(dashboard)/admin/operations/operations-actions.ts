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
    incurred_on: incurredAt,
    created_by: gate.userId,
  };
  let { error } = await gate.admin.from('business_expenses').insert(row);
  if (error && /incurred_at|incurred_on|notes|column/i.test(error.message)) {
    ({ error } = await gate.admin.from('business_expenses').insert({
      amount_cents: row.amount_cents,
      category: row.category,
      incurred_on: incurredAt,
      created_by: gate.userId,
    }));
  }
  if (error && /incurred_on|column/i.test(error.message)) {
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

  const tripMode = String(formData.get('tripMode') ?? 'round_trip').trim();
  const oneWayInput = Number(formData.get('milesOneWay'));
  const milesRaw = Number(formData.get('miles'));
  const oneWay = Number.isFinite(oneWayInput) && oneWayInput > 0 ? oneWayInput : Number.isFinite(milesRaw) && milesRaw > 0 ? milesRaw : NaN;
  if (!Number.isFinite(oneWay) || oneWay <= 0) return actionErr('Enter valid one-way miles.');
  const miles = tripMode === 'one_way' ? oneWay : oneWay * 2;
  const appointmentId = String(formData.get('appointmentId') ?? '').trim() || null;
  const note = String(formData.get('note') ?? '').trim() || null;

  const loggedOn = new Date().toISOString();
  const row = {
    total_miles: miles,
    miles_one_way: oneWay,
    round_trip_miles: miles,
    trip_mode: tripMode,
    appointment_id: appointmentId,
    notes: note,
    logged_on: loggedOn,
    created_by: gate.userId,
  };
  let { error } = await gate.admin.from('job_mileage_logs').insert(row);
  if (error && /total_miles|logged_on|notes|column/i.test(error.message)) {
    ({ error } = await gate.admin.from('job_mileage_logs').insert({
      estimated_miles: miles,
      appointment_id: appointmentId,
      logged_on: loggedOn,
      created_by: gate.userId,
    }));
  }
  if (error && /logged_on|column/i.test(error.message)) {
    ({ error } = await gate.admin.from('job_mileage_logs').insert({
      estimated_miles: miles,
      appointment_id: appointmentId,
      created_by: gate.userId,
    }));
  }
  if (error) return actionErr(error.message);
  const workOrderPath = String(formData.get('workOrderPath') ?? '').trim();
  revalidatePath('/admin/operations');
  if (workOrderPath) revalidatePath(workOrderPath);
  if (appointmentId) revalidatePath(`/tech/work-orders/${appointmentId}`);
  return actionOk('Mileage logged.');
}

export async function addBusinessExpenseAction(formData: FormData) {
  return addBusinessExpenseActionState(null, formData);
}

export async function addJobMileageLogAction(formData: FormData) {
  return addJobMileageLogActionState(null, formData);
}

export async function updateJobMileageLogActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate) return actionErr('Forbidden');
  const id = String(formData.get('id') ?? '').trim();
  const tripMode = String(formData.get('tripMode') ?? 'round_trip').trim();
  const oneWay = Number(formData.get('milesOneWay'));
  if (!id || !Number.isFinite(oneWay) || oneWay <= 0) return actionErr('Valid one-way miles required.');
  const roundTrip = tripMode === 'one_way' ? oneWay : oneWay * 2;
  const note = String(formData.get('note') ?? '').trim() || null;
  const gasDollars = Number(formData.get('gasDollars'));
  const gasCents = Number.isFinite(gasDollars) && gasDollars > 0 ? Math.round(gasDollars * 100) : null;

  const patch: Record<string, unknown> = {
    miles_one_way: oneWay,
    round_trip_miles: roundTrip,
    total_miles: roundTrip,
    estimated_miles: roundTrip,
    trip_mode: tripMode,
    notes: note,
  };
  if (gasCents != null) patch.gas_cost_cents = gasCents;

  let { error } = await gate.admin.from('job_mileage_logs').update(patch).eq('id', id);
  if (error && /trip_mode|miles_one_way|round_trip/i.test(error.message)) {
    ({ error } = await gate.admin
      .from('job_mileage_logs')
      .update({ total_miles: roundTrip, estimated_miles: roundTrip, notes: note })
      .eq('id', id));
  }
  if (error) return actionErr(error.message);
  revalidatePath('/admin/operations');
  return actionOk(`Mileage updated — ${roundTrip.toFixed(1)} mi round-trip.`);
}

export async function deleteJobMileageLogActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireAdmin();
  if (!gate) return actionErr('Forbidden');
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return actionErr('Missing id');
  const { error } = await gate.admin.from('job_mileage_logs').delete().eq('id', id);
  if (error) return actionErr(error.message);
  revalidatePath('/admin/operations');
  return actionOk('Mileage row removed.');
}
