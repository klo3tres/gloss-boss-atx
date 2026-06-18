'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { timerInvalidReasons } from '@/lib/timer-integrity';

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
  const admin = gate.admin;
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let invalidTimerCount = 0;
  let repairedTimerCount = 0;

  await admin
    .from('tech_job_timers')
    .update({ ended_at: now, running: false, status: 'cleared_test' })
    .is('ended_at', null)
    .lt('created_at', staleBefore);

  const { data: timerRows } = await admin
    .from('tech_job_timers')
    .select('id, appointment_id, fallback_booking_id, work_order_id, customer_id, started_at, ended_at, created_at, duration_seconds, running, status')
    .order('created_at', { ascending: false })
    .limit(1500);

  const timers = (timerRows ?? []) as Array<Record<string, unknown>>;
  const appointmentIds = [...new Set(timers.map((row) => String(row.appointment_id ?? '').trim()).filter(Boolean))];
  const fallbackIds = [...new Set(timers.map((row) => String(row.fallback_booking_id ?? '').trim()).filter(Boolean))];
  const appointments = new Map<string, Record<string, unknown>>();
  const fallbacks = new Map<string, Record<string, unknown>>();

  if (appointmentIds.length > 0) {
    const { data } = await admin
      .from('appointments')
      .select('id, status, archived, archived_at, deleted_at, customer_id, guest_email, guest_phone')
      .in('id', appointmentIds);
    for (const row of data ?? []) appointments.set(String((row as Record<string, unknown>).id), row as Record<string, unknown>);
  }
  if (fallbackIds.length > 0) {
    const { data } = await admin
      .from('booking_fallbacks')
      .select('id, status, archived, archived_at, deleted_at, customer_id, guest_email, guest_phone')
      .in('id', fallbackIds);
    for (const row of data ?? []) fallbacks.set(String((row as Record<string, unknown>).id), row as Record<string, unknown>);
  }

  async function markInvalidTimer(id: string, reasons: string[], endedAt: unknown) {
    const patchAttempts = [
      { ended_at: endedAt || now, running: false, status: 'excluded_invalid', exclude_from_analytics: true, invalid_reason: reasons.join(',') },
      { ended_at: endedAt || now, running: false, status: 'excluded_invalid' },
      { ended_at: endedAt || now, running: false },
      { status: 'excluded_invalid' },
    ];
    for (const patch of patchAttempts) {
      const { error } = await admin.from('tech_job_timers').update(patch).eq('id', id);
      if (!error) return true;
    }
    return false;
  }

  for (const timer of timers) {
    const appointmentId = String(timer.appointment_id ?? '').trim();
    const fallbackId = String(timer.fallback_booking_id ?? '').trim();
    const reasons = timerInvalidReasons(timer, {
      appointment: appointmentId ? appointments.get(appointmentId) ?? null : undefined,
      fallback: fallbackId ? fallbacks.get(fallbackId) ?? null : undefined,
    });
    if (reasons.length === 0) continue;
    invalidTimerCount += 1;
    const id = String(timer.id ?? '').trim();
    if (id && (await markInvalidTimer(id, reasons, timer.ended_at))) repairedTimerCount += 1;
  }

  await admin
    .from('tech_workflow_sessions')
    .update({ status: 'archived', archived_at: now, updated_at: now })
    .in('status', ['active', 'in_progress'])
    .lt('created_at', staleBefore);

  await admin
    .from('booking_fallbacks')
    .update({ archived: true, archived_at: now, status: 'archived', updated_at: now })
    .or('guest_email.ilike.%test%,guest_name.ilike.%test%,guest_phone.ilike.%555%')
    .in('status', ['pending', 'active', 'in_progress']);

  revalidatePath('/admin/work-orders');
  revalidatePath('/admin');
  revalidatePath('/admin/system-diagnostics');
  revalidatePath('/tech');
  return { ok: true, invalidTimerCount, repairedTimerCount };
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
  const { error: apptErr } = await gate.admin.from('appointments').update(patch).in('id', ids);
  if (apptErr && !/archived|deleted_at|column/i.test(apptErr.message)) {
    return { ok: false, error: apptErr.message };
  }
  const fbPatch =
    action === 'delete'
      ? { status: 'deleted', archived_at: now, updated_at: now }
      : { archived: true, archived_at: now, status: 'archived', updated_at: now };
  const { error: fbErr } = await gate.admin.from('booking_fallbacks').update(fbPatch).in('id', ids);
  if (fbErr && !/archived|column/i.test(fbErr.message)) {
    return { ok: false, error: fbErr.message };
  }
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
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
