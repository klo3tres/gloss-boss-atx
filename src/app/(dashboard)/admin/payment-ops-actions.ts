'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { generateWorkOrderReceiptActionState } from '@/app/(dashboard)/tech/work-order-payment-actions';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function requireStaff() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { admin, userId: session.user.id };
}

export async function voidPaymentActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const paymentId = str(formData.get('paymentId'));
  const reason = str(formData.get('reason')) || 'Voided by admin';
  if (!paymentId) return actionErr('Missing payment.');

  const now = new Date().toISOString();
  const patch = {
    status: 'voided',
    voided_at: now,
    voided_by: gate.userId,
    metadata: { void_reason: reason },
    updated_at: now,
  };

  let { error } = await gate.admin.from('payments').update(patch).eq('id', paymentId);
  if (error && /voided_at|voided_by|column/i.test(error.message)) {
    ({ error } = await gate.admin.from('payments').update({ status: 'voided', updated_at: now }).eq('id', paymentId));
  }
  if (error) return actionErr(error.message);

  revalidatePath('/admin/receipts');
  revalidatePath('/admin/payments');
  const receiptPath = str(formData.get('receiptPath'));
  const workOrderPath = str(formData.get('workOrderPath'));
  if (receiptPath) revalidatePath(receiptPath);
  if (workOrderPath) revalidatePath(workOrderPath);
  return actionOk('Payment voided.');
}

export async function recordManualPaymentActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const amountDollars = Number(formData.get('amountDollars'));
  const method = str(formData.get('method')).toLowerCase() || 'cash';
  if (!appointmentId && !fallbackBookingId) return actionErr('Missing work order.');
  if (!Number.isFinite(amountDollars) || amountDollars <= 0) return actionErr('Enter a valid amount.');

  const amountCents = Math.round(amountDollars * 100);
  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  const { data: job } = await gate.admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!job) return actionErr('Work order not found.');

  const jobRow = job as Record<string, unknown>;
  const paymentMethod =
    method === 'zelle' ? 'zelle' : method === 'venmo' ? 'venmo' : method === 'check' ? 'check' : 'cash';

  const { data: inserted, error } = await gate.admin
    .from('payments')
    .insert({
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      customer_id: str(jobRow.customer_id) || null,
      amount_cents: amountCents,
      status: 'succeeded',
      payment_method: paymentMethod,
      payment_kind: 'manual',
      payment_choice: 'balance',
      paid_at: new Date().toISOString(),
      metadata: { source: 'admin_manual', recorded_by: gate.userId },
    })
    .select('id')
    .maybeSingle();

  if (error) return actionErr(error.message);

  const fd = new FormData();
  if (appointmentId) fd.set('appointmentId', appointmentId);
  if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
  await generateWorkOrderReceiptActionState(null, fd);

  revalidatePath('/admin/receipts');
  revalidatePath(`/admin/receipts/${str(formData.get('receiptId') || inserted?.id)}`);
  const workOrderPath = str(formData.get('workOrderPath'));
  revalidatePath(`/tech/work-orders/${jobId}`);
  if (workOrderPath) revalidatePath(workOrderPath);
  return actionOk(`${paymentMethod} payment of $${(amountCents / 100).toFixed(2)} recorded.`);
}

export async function rebuildReceiptFromWorkOrderActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return generateWorkOrderReceiptActionState(_prev, formData);
}

/** Void duplicate/extra payment rows (keeps earliest payments up to job total), then rebuild receipt. */
export async function voidExtrasAndRebuildActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  if (!appointmentId && !fallbackBookingId) return actionErr('Missing work order.');

  let payQ = gate.admin.from('payments').select('id, amount_cents, status, paid_at, created_at').order('paid_at', { ascending: true });
  payQ = appointmentId ? payQ.eq('appointment_id', appointmentId) : payQ.eq('fallback_booking_id', fallbackBookingId);
  const { data: payments, error: payErr } = await payQ;
  if (payErr) return actionErr(payErr.message);

  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  const { data: job } = await gate.admin.from(table).select('final_total_cents, total_cents').eq('id', jobId).maybeSingle();
  if (!job) return actionErr('Work order not found.');

  const jobRow = job as Record<string, unknown>;
  const targetCents = Number(jobRow.final_total_cents ?? jobRow.total_cents) || 0;
  const active = (payments ?? []).filter((p) => {
    const row = p as Record<string, unknown>;
    const st = str(row.status).toLowerCase();
    return st && !st.includes('void') && st !== 'failed';
  }) as Array<Record<string, unknown>>;

  const totalPaid = active.reduce((s, p) => s + (Number(p.amount_cents) || 0), 0);
  if (totalPaid <= targetCents) {
    return actionErr('No extra payments detected — totals already match or are under job total.');
  }

  let running = 0;
  const toVoid: string[] = [];
  for (const p of active) {
    const id = str(p.id);
    const amt = Number(p.amount_cents) || 0;
    if (!id) continue;
    if (running + amt <= targetCents) {
      running += amt;
      continue;
    }
    toVoid.push(id);
  }

  if (toVoid.length === 0) {
    return actionErr('Could not identify which payments to void — void manually, then rebuild.');
  }

  const now = new Date().toISOString();
  for (const paymentId of toVoid) {
    let { error } = await gate.admin
      .from('payments')
      .update({ status: 'voided', voided_at: now, voided_by: gate.userId, updated_at: now })
      .eq('id', paymentId);
    if (error && /voided_at|column/i.test(error.message)) {
      ({ error } = await gate.admin.from('payments').update({ status: 'voided', updated_at: now }).eq('id', paymentId));
    }
    if (error) return actionErr(error.message);
  }

  const rebuild = await generateWorkOrderReceiptActionState(null, formData);
  if (!rebuild.ok) return rebuild;

  const workOrderPath = str(formData.get('workOrderPath'));
  revalidatePath('/admin/receipts');
  if (workOrderPath) revalidatePath(workOrderPath);
  revalidatePath(`/tech/work-orders/${jobId}`);
  return actionOk(`Voided ${toVoid.length} extra payment(s) and rebuilt receipt.`);
}

export async function voidPaymentAction(formData: FormData) {
  return voidPaymentActionState(null, formData);
}

export async function recordManualPaymentAction(formData: FormData) {
  return recordManualPaymentActionState(null, formData);
}
