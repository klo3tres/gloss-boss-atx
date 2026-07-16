'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { generateWorkOrderReceiptActionState } from '@/app/(dashboard)/tech/work-order-payment-actions';
import { findDuplicatePaymentGroups, repairDuplicatePaymentGroups } from '@/lib/payment-duplicate-repair';
import type { PayRow } from '@/lib/revenue-metrics';

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
  const tipDollars = Number(formData.get('tipDollars') || 0);
  const method = str(formData.get('method')).toLowerCase() || 'cash';
  const referenceNumber = str(formData.get('referenceNumber'));
  const note = str(formData.get('note'));
  const attachmentUrl = str(formData.get('attachmentUrl'));
  const receiptRequested = formData.get('sendReceipt') === 'on' || formData.get('sendReceipt') === 'true';
  const paidAtInput = str(formData.get('paidAt'));
  if (!appointmentId && !fallbackBookingId) return actionErr('Missing work order.');
  if (!Number.isFinite(amountDollars) || amountDollars < 0) return actionErr('Enter a valid payment amount.');
  if (!Number.isFinite(tipDollars) || tipDollars < 0) return actionErr('Enter a valid tip amount.');
  if (amountDollars <= 0 && tipDollars <= 0) return actionErr('Payment or tip must be greater than zero.');

  const appliedAmountCents = Math.round(amountDollars * 100);
  const tipAmountCents = Math.round(tipDollars * 100);
  const amountCents = appliedAmountCents + tipAmountCents;
  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  const { data: job } = await gate.admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!job) return actionErr('Work order not found.');

  const jobRow = job as Record<string, unknown>;
  const allowedMethods = new Set(['cash', 'zelle', 'cash_app', 'venmo', 'check', 'external_card', 'manual_card', 'bank_transfer', 'other']);
  const paymentMethod = allowedMethods.has(method) ? method : 'other';
  const balanceBefore = Math.max(0, Number(jobRow.balance_due_cents ?? 0));
  if (appliedAmountCents > balanceBefore) return actionErr('Payment exceeds the outstanding balance. Put the difference in the tip field.');
  const paidAt = paidAtInput && !Number.isNaN(new Date(paidAtInput).getTime()) ? new Date(paidAtInput).toISOString() : new Date().toISOString();

  const recentCutoff = new Date(Date.now() - 30_000).toISOString();
  let recentQuery = gate.admin
    .from('payments')
    .select('id')
    .eq('amount_cents', amountCents)
    .eq('payment_method', paymentMethod)
    .in('status', ['succeeded', 'paid'])
    .gte('created_at', recentCutoff)
    .limit(1);
  recentQuery = appointmentId
    ? recentQuery.eq('appointment_id', appointmentId)
    : recentQuery.eq('fallback_booking_id', fallbackBookingId);
  const { data: recentDuplicate } = await recentQuery;
  if ((recentDuplicate ?? []).length > 0) {
    return actionOk('That payment was already recorded. No duplicate row was created.');
  }

  const idempotencyKey = `manual:${gate.userId}:${jobId}:${paymentMethod}:${amountCents}:${paidAt}`;

  let inserted: { id?: string } | null = null;
  let error: { message: string } | null = null;
  if (appointmentId) {
    const rpc = await gate.admin.rpc('record_manual_payment_atomic', {
      p_appointment_id: appointmentId,
      p_amount_cents: appliedAmountCents,
      p_tip_amount_cents: tipAmountCents,
      p_method: paymentMethod,
      p_paid_at: paidAt,
      p_reference_number: referenceNumber,
      p_note: note,
      p_attachment_url: attachmentUrl,
      p_receipt_requested: receiptRequested,
      p_recorded_by: gate.userId,
      p_idempotency_key: idempotencyKey,
    });
    const row = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
    inserted = row ? { id: str((row as Record<string, unknown>).payment_id) } : null;
    error = rpc.error ? { message: rpc.error.message } : null;
  } else {
    const balanceAfter = Math.max(0, balanceBefore - appliedAmountCents);
    const direct = await gate.admin
      .from('payments')
      .insert({
        fallback_booking_id: fallbackBookingId,
        customer_id: str(jobRow.customer_id) || null,
        amount_cents: amountCents,
        status: 'succeeded',
        payment_method: paymentMethod,
        payment_kind: 'manual',
        payment_choice: 'balance',
        paid_at: paidAt,
        tender_type: paymentMethod,
        applied_amount_cents: appliedAmountCents,
        tip_amount_cents: tipAmountCents,
        idempotency_key: idempotencyKey,
        recorded_by: gate.userId,
        reference_number: referenceNumber || null,
        note: note || null,
        attachment_url: attachmentUrl || null,
        receipt_requested: receiptRequested,
        metadata: { source: 'admin_manual', recorded_by: gate.userId },
      })
      .select('id')
      .maybeSingle();
    inserted = direct.data;
    error = direct.error ? { message: direct.error.message } : null;
    if (!error) {
      const update = await gate.admin.from('booking_fallbacks').update({
        balance_due_cents: balanceAfter,
        payment_status: balanceAfter === 0 ? 'paid' : 'balance_due',
        updated_at: new Date().toISOString(),
      }).eq('id', fallbackBookingId);
      if (update.error) error = { message: `Payment was recorded but the fallback balance update failed: ${update.error.message}` };
    }
  }

  if (error) return actionErr(error.message);

  const fd = new FormData();
  if (appointmentId) fd.set('appointmentId', appointmentId);
  if (fallbackBookingId) fd.set('fallbackBookingId', fallbackBookingId);
  await generateWorkOrderReceiptActionState(null, fd);

  revalidatePath('/admin/receipts');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/payments');
  revalidatePath('/admin');
  revalidatePath(`/admin/receipts/${str(formData.get('receiptId') || inserted?.id)}`);
  const workOrderPath = str(formData.get('workOrderPath'));
  revalidatePath(`/tech/work-orders/${jobId}`);
  if (workOrderPath) revalidatePath(workOrderPath);
  return actionOk(`${paymentMethod.replace(/_/g, ' ')} payment of $${(appliedAmountCents / 100).toFixed(2)}${tipAmountCents ? ` plus $${(tipAmountCents / 100).toFixed(2)} tip` : ''} recorded.`);
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

  let payQ = gate.admin.from('payments').select('*').order('paid_at', { ascending: true });
  payQ = appointmentId ? payQ.eq('appointment_id', appointmentId) : payQ.eq('fallback_booking_id', fallbackBookingId);
  const { data: payments, error: payErr } = await payQ;
  if (payErr) return actionErr(payErr.message);

  const duplicateGroups = findDuplicatePaymentGroups(
    ((payments ?? []) as PayRow[]).map((row) => ({ ...row, source_table: 'payments' as const })),
  );
  if (duplicateGroups.length === 0) {
    return actionOk('No duplicate payment identities found. Split tenders and overpayments were left intact.');
  }
  const duplicateRepair = await repairDuplicatePaymentGroups(gate.admin, duplicateGroups);
  if (duplicateRepair.errors.length > 0) return actionErr(duplicateRepair.errors.join(' '));

  const safeRebuild = await generateWorkOrderReceiptActionState(null, formData);
  if (!safeRebuild.ok) return safeRebuild;
  const safeJobId = fallbackBookingId || appointmentId;
  revalidatePath('/admin/receipts');
  revalidatePath(`/tech/work-orders/${safeJobId}`);
  return actionOk(`Excluded ${duplicateRepair.paymentsExcluded} duplicate payment row(s). Split tenders and tips were preserved.`);

  /* Legacy amount-capping repair intentionally disabled. It destroyed valid tips and split tenders.
  if (!gate) return actionErr('Not authorized.');
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
  */
}

/** Detach suspicious payment rows from a work order without deleting payment history. */
export async function detachUnrelatedPaymentsFromWorkOrderActionState(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  if (!appointmentId && !fallbackBookingId) return actionErr('Missing work order.');

  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  const { data: job } = await gate.admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!job) return actionErr('Work order not found.');
  const jobRow = job as Record<string, unknown>;
  const customerId = str(jobRow.customer_id);
  const sessionId = str(jobRow.stripe_checkout_session_id || jobRow.final_payment_checkout_session_id);
  const intentId = str(jobRow.stripe_payment_intent_id);

  let q = gate.admin.from('payments').select('*').order('paid_at', { ascending: false });
  q = appointmentId ? q.eq('appointment_id', appointmentId) : q.eq('fallback_booking_id', fallbackBookingId);
  const { data: payments, error } = await q;
  if (error) return actionErr(error.message);

  const suspicious = ((payments ?? []) as Record<string, unknown>[]).filter((p) => {
    const pCustomer = str(p.customer_id);
    const pSession = str(p.stripe_checkout_session_id);
    const pIntent = str(p.stripe_payment_intent_id);
    const metadata = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : {};
    const metaAppointment = str(metadata.appointment_id || metadata.appointmentId || metadata.work_order_id || metadata.workOrderId);
    const metaFallback = str(metadata.fallback_booking_id || metadata.fallbackBookingId);
    const wrongCustomer = Boolean(customerId && pCustomer && pCustomer !== customerId);
    const wrongAppointment = Boolean(appointmentId && metaAppointment && metaAppointment !== appointmentId);
    const wrongFallback = Boolean(fallbackBookingId && metaFallback && metaFallback !== fallbackBookingId);
    const wrongStripe =
      Boolean((pSession || pIntent) && (sessionId || intentId)) &&
      ![sessionId, intentId].filter(Boolean).includes(pSession) &&
      ![sessionId, intentId].filter(Boolean).includes(pIntent);
    return wrongCustomer || wrongAppointment || wrongFallback || wrongStripe;
  });

  if (suspicious.length === 0) {
    return actionOk('No suspicious attached payments found. Job totals now use exact work-order scoped payments only.');
  }

  const ids = suspicious.map((p) => str(p.id)).filter(Boolean);
  const now = new Date().toISOString();
  for (const id of ids) {
    const patch = appointmentId
      ? { appointment_id: null, metadata: { detached_from_appointment_id: appointmentId, detached_at: now, detached_reason: 'admin_unrelated_payment_repair' }, updated_at: now }
      : { fallback_booking_id: null, metadata: { detached_from_fallback_booking_id: fallbackBookingId, detached_at: now, detached_reason: 'admin_unrelated_payment_repair' }, updated_at: now };
    let { error: updateErr } = await gate.admin.from('payments').update(patch).eq('id', id);
    if (updateErr && /metadata|updated_at|column|schema cache|Could not find/i.test(updateErr.message)) {
      const leanPatch = appointmentId ? { appointment_id: null } : { fallback_booking_id: null };
      ({ error: updateErr } = await gate.admin.from('payments').update(leanPatch).eq('id', id));
    }
    if (updateErr) return actionErr(`Could not detach payment ${id}: ${updateErr.message}`);
  }

  const rebuildFd = new FormData();
  if (appointmentId) rebuildFd.set('appointmentId', appointmentId);
  if (fallbackBookingId) rebuildFd.set('fallbackBookingId', fallbackBookingId);
  await generateWorkOrderReceiptActionState(null, rebuildFd);

  revalidatePath(`/tech/work-orders/${jobId}`);
  revalidatePath(`/admin/work-orders/${jobId}`);
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/payments');
  const workOrderPath = str(formData.get('workOrderPath'));
  if (workOrderPath) revalidatePath(workOrderPath);
  return actionOk(`Detached ${ids.length} suspicious payment row(s). They remain in payment history as unassigned until manually linked.`);
}

export async function voidPaymentAction(formData: FormData) {
  return voidPaymentActionState(null, formData);
}

export async function detachUnrelatedPaymentsFromWorkOrderAction(formData: FormData) {
  return detachUnrelatedPaymentsFromWorkOrderActionState(null, formData);
}

export async function recordManualPaymentAction(formData: FormData) {
  return recordManualPaymentActionState(null, formData);
}

/** Admin: void bad rows, record one truthful payment, override final total, rebuild receipt. */
export async function correctPaymentTruthActionState(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const reason = str(formData.get('reason'));
  const finalDollars = Number(formData.get('finalTotalDollars'));
  const paidDollars = Number(formData.get('amountPaidDollars'));
  const method = str(formData.get('paymentMethod')).toLowerCase() || 'cash';
  const voidDuplicates = formData.get('voidDuplicates') === 'on' || formData.get('voidDuplicates') === 'true';
  const removeFakeDeposit = formData.get('removeFakeDeposit') === 'on' || formData.get('removeFakeDeposit') === 'true';

  if (!appointmentId && !fallbackBookingId) return actionErr('Missing work order.');
  if (!reason) return actionErr('Reason is required.');
  if (!Number.isFinite(finalDollars) || finalDollars < 0) return actionErr('Invalid final total.');
  if (!Number.isFinite(paidDollars) || paidDollars < 0) return actionErr('Invalid amount paid.');

  const finalCents = Math.round(finalDollars * 100);
  const paidCents = Math.round(paidDollars * 100);
  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;

  const { data: job } = await gate.admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!job) return actionErr('Work order not found.');
  const jobRow = job as Record<string, unknown>;

  let payQ = gate.admin.from('payments').select('*').order('paid_at', { ascending: true });
  payQ = appointmentId ? payQ.eq('appointment_id', appointmentId) : payQ.eq('fallback_booking_id', fallbackBookingId);
  const { data: paymentRows, error: payErr } = await payQ;
  if (payErr) return actionErr(payErr.message);

  const now = new Date().toISOString();
  const voidPatch = {
    status: 'voided',
    voided_at: now,
    voided_by: gate.userId,
    metadata: { void_reason: reason, source: 'correct_payment_truth' },
    updated_at: now,
  };

  const active = (paymentRows ?? []).filter((p) => {
    const row = p as Record<string, unknown>;
    const st = str(row.status).toLowerCase();
    return st && !st.includes('void') && st !== 'failed';
  });

  if (voidDuplicates || removeFakeDeposit) {
    for (const p of active) {
      const id = str((p as Record<string, unknown>).id);
      if (!id) continue;
      let { error } = await gate.admin.from('payments').update(voidPatch).eq('id', id);
      if (error && /voided_at|column/i.test(error.message)) {
        ({ error } = await gate.admin.from('payments').update({ status: 'voided', updated_at: now }).eq('id', id));
      }
      if (error) return actionErr(`Void failed for ${id}: ${error.message}`);
    }
  }

  const paymentMethod =
    method === 'zelle'
      ? 'zelle'
      : method === 'venmo'
        ? 'venmo'
        : method === 'cash_app' || method === 'cashapp'
          ? 'cash_app'
          : method === 'apple_pay'
            ? 'apple_pay'
            : method === 'check'
              ? 'check'
              : method === 'stripe' || method === 'card'
                ? 'stripe'
                : 'cash';

  if (paidCents > 0) {
    const { error: insErr } = await gate.admin.from('payments').insert({
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      customer_id: str(jobRow.customer_id) || null,
      amount_cents: paidCents,
      status: 'succeeded',
      payment_method: paymentMethod,
      payment_kind: paymentMethod === 'stripe' ? 'booking_full' : 'manual',
      payment_choice: paidCents >= finalCents ? 'full' : 'partial',
      paid_at: now,
      metadata: { source: 'correct_payment_truth', reason, recorded_by: gate.userId },
    });
    if (insErr) return actionErr(`Could not record payment: ${insErr.message}`);
  }

  const prevB =
    jobRow.booking_pricing_breakdown && typeof jobRow.booking_pricing_breakdown === 'object'
      ? (jobRow.booking_pricing_breakdown as Record<string, unknown>)
      : {};
  const breakdown = {
    ...prevB,
    adminOverrideFinalTotalCents: finalCents,
    finalTotalCents: finalCents,
    adminOverrideReason: reason,
    paymentTruthCorrectedAt: now,
    paymentTruthCorrectedBy: gate.userId,
  };

  const balanceDue = Math.max(0, finalCents - paidCents);
  const apptPatch: Record<string, unknown> = {
    booking_pricing_breakdown: breakdown,
    base_price_cents: finalCents,
    balance_due_cents: balanceDue,
    payment_status: balanceDue <= 0 && paidCents > 0 ? 'paid' : paidCents > 0 ? 'balance_due' : str(jobRow.payment_status),
    updated_at: now,
  };
  if (removeFakeDeposit) {
    apptPatch.deposit_amount_cents = 0;
    apptPatch.stripe_checkout_session_id = null;
    apptPatch.stripe_payment_intent_id = null;
  }

  const { error: updErr } = await gate.admin.from(table).update(apptPatch).eq('id', jobId);
  if (updErr) return actionErr(updErr.message);

  const rebuildFd = new FormData();
  if (appointmentId) rebuildFd.set('appointmentId', appointmentId);
  if (fallbackBookingId) rebuildFd.set('fallbackBookingId', fallbackBookingId);
  const rebuild = await generateWorkOrderReceiptActionState(null, rebuildFd);
  if (!rebuild.ok) return actionErr(`Saved job totals but receipt rebuild failed: ${rebuild.error ?? 'unknown'}`);

  revalidatePath('/admin/revenue');
  revalidatePath('/admin/receipts');
  revalidatePath(`/tech/work-orders/${jobId}`);
  revalidatePath('/admin');
  const workOrderPath = str(formData.get('workOrderPath'));
  if (workOrderPath) revalidatePath(workOrderPath);

  return actionOk(
    `Payment truth corrected: final ${(finalCents / 100).toFixed(2)}, paid ${(paidCents / 100).toFixed(2)} via ${paymentMethod}. ${active.length} prior row(s) voided.`,
  );
}

export async function correctPaymentTruthAction(formData: FormData) {
  return correctPaymentTruthActionState(null, formData);
}
