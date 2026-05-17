'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, admin };
}

export async function archiveAppointmentWorkOrderAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing work order.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from('appointments')
    .update({ archived: true, archived_at: now, updated_at: now })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  return { ok: true };
}

export async function deleteAppointmentWorkOrderAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing work order.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from('appointments')
    .update({ archived: true, archived_at: now, deleted_at: now, status: 'deleted', updated_at: now })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  return { ok: true };
}

export async function clearStaleActiveTestRecordsAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  await gate.admin
    .from('tech_job_timers')
    .update({ ended_at: now, running: false, status: 'cleared_test' })
    .is('ended_at', null)
    .lt('created_at', staleBefore);

  await gate.admin
    .from('tech_workflow_sessions')
    .update({ status: 'archived', archived_at: now, updated_at: now })
    .in('status', ['active', 'in_progress'])
    .lt('created_at', staleBefore);

  await gate.admin
    .from('booking_fallbacks')
    .update({ archived: true, archived_at: now, status: 'archived', updated_at: now })
    .or('guest_email.ilike.%test%,guest_name.ilike.%test%,guest_phone.ilike.%555%')
    .in('status', ['pending', 'active', 'in_progress']);

  revalidatePath('/admin/work-orders');
  revalidatePath('/tech');
  return { ok: true };
}

export async function bulkWorkOrderAction(formData: FormData) {
  const action = String(formData.get('bulkAction') ?? '').trim();
  const ids = formData.getAll('ids').map((v) => String(v).trim()).filter(Boolean);
  if (!['archive', 'delete'].includes(action) || ids.length === 0) return { ok: false, error: 'Choose work orders first.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const patch = action === 'delete'
    ? { archived: true, archived_at: now, deleted_at: now, status: 'deleted', updated_at: now }
    : { archived: true, archived_at: now, updated_at: now };
  await gate.admin.from('appointments').update(patch).in('id', ids);
  await gate.admin.from('booking_fallbacks').update(action === 'delete' ? { status: 'deleted', archived_at: now, updated_at: now } : { archived: true, archived_at: now, status: 'archived', updated_at: now }).in('id', ids);
  revalidatePath('/admin/work-orders');
  revalidatePath('/tech');
  return { ok: true };
}

export async function adminRecordCashPaymentAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const source = String(formData.get('source') ?? 'appointment').trim();
  if (!id) return { ok: false, error: 'Missing work order.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const amount = Number(String(formData.get('amountReceived') ?? '').replace(/[^0-9.]/g, ''));
  const change = Number(String(formData.get('changeGiven') ?? '').replace(/[^0-9.]/g, ''));
  const note = String(formData.get('cashNote') ?? '').trim();
  const table = source === 'fallback' ? 'booking_fallbacks' : 'appointments';
  const { data } = await gate.admin
    .from(table)
    .select('id, customer_id, base_price_cents, balance_due_cents, service_slug, vehicle_description')
    .eq('id', id)
    .maybeSingle();
  const row = (data ?? {}) as Record<string, unknown>;
  const amountCents = Math.max(
    0,
    Number.isFinite(amount) && amount > 0
      ? Math.round(amount * 100)
      : typeof row.balance_due_cents === 'number'
        ? row.balance_due_cents
        : typeof row.base_price_cents === 'number'
          ? row.base_price_cents
          : 0,
  );
  if (amountCents < 1) return { ok: false, error: 'Enter amount received.' };
  const now = new Date().toISOString();
  const receiptNumber = `CASH-${now.slice(0, 10).replace(/-/g, '')}-${id.slice(0, 8)}`;
  const paymentRes = await gate.admin.from('payments').insert({
    appointment_id: source === 'fallback' ? null : id,
    fallback_booking_id: source === 'fallback' ? id : null,
    customer_id: row.customer_id ?? null,
    amount_cents: amountCents,
    status: 'succeeded',
    payment_method: 'cash',
    payment_choice: 'cash',
    paid_at: now,
    metadata: {
      source: 'admin_cash_payment',
      note: note || null,
      cash_received_cents: amountCents,
      change_given_cents: Number.isFinite(change) ? Math.max(0, Math.round(change * 100)) : 0,
      receipt_number: receiptNumber,
    },
  }).select('id').maybeSingle();
  const paymentId = ((paymentRes.data ?? {}) as Record<string, unknown>).id ?? null;
  await gate.admin.from('receipts').insert({
    appointment_id: source === 'fallback' ? null : id,
    fallback_booking_id: source === 'fallback' ? id : null,
    payment_id: paymentId,
    customer_id: row.customer_id ?? null,
    receipt_number: receiptNumber,
    amount_cents: amountCents,
    payment_method: 'cash',
    status: 'issued',
    metadata: { source: 'admin_cash_payment', note: note || null },
  });
  await gate.admin.from('notification_outbox').insert({
    appointment_id: source === 'fallback' ? null : id,
    fallback_booking_id: source === 'fallback' ? id : null,
    channel: 'internal',
    kind: 'cash_payment_receipt',
    status: 'skipped',
    skipped_reason: 'Cash payment was recorded internally.',
    payload: { payment_id: paymentId, receipt_number: receiptNumber, amount_cents: amountCents },
  });
  await gate.admin
    .from(table)
    .update({ payment_status: 'paid_cash', balance_due_cents: 0, paid_at: now, updated_at: now })
    .eq('id', id);
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/payments');
  revalidatePath('/tech');
  return { ok: true };
}
