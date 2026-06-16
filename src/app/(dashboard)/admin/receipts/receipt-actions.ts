'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { buildUnifiedReceiptView } from '@/lib/unified-receipt';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { resolveOrderLedger } from '@/lib/order-ledger';

function str(v: unknown) {
  return v == null ? '' : String(v);
}

async function requireReceiptSender() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id };
}

async function safeFlagUpdate(
  admin: NonNullable<ReturnType<typeof tryCreateAdminSupabase>>,
  table: 'receipts' | 'payments',
  patch: Record<string, unknown>,
  match: { kind: 'eq'; column: string; value: string } | { kind: 'in'; column: string; values: string[] },
) {
  let query =
    match.kind === 'eq'
      ? admin.from(table).update(patch).eq(match.column, match.value)
      : admin.from(table).update(patch).in(match.column, match.values);
  let res = await query;
  if (!res.error) return;
  if (!/schema cache|column|Could not find|voided_at|voided_by|voided|exclude_from_revenue|is_test|status/i.test(res.error.message)) {
    console.warn(`[receipt-actions] ${table} update failed`, res.error.message);
    return;
  }

  const fallbacks =
    table === 'receipts'
      ? [{ status: patch.status ?? 'voided' }, { voided_at: patch.voided_at }, { exclude_from_revenue: patch.exclude_from_revenue }, { is_test: patch.is_test }]
      : [{ status: patch.status ?? 'voided' }, { voided_at: patch.voided_at }, { voided: patch.voided }, { exclude_from_revenue: patch.exclude_from_revenue }, { is_test: patch.is_test }];

  for (const candidate of fallbacks) {
    const clean = Object.fromEntries(Object.entries(candidate).filter(([, value]) => value !== undefined));
    if (Object.keys(clean).length === 0) continue;
    query =
      match.kind === 'eq'
        ? admin.from(table).update(clean).eq(match.column, match.value)
        : admin.from(table).update(clean).in(match.column, match.values);
    res = await query;
    if (!res.error) return;
  }
}

export async function sendReceiptActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return sendReceiptAction(formData);
}

export async function sendReceiptAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireReceiptSender();
  if (!gate) return actionErr('Not authorized.');

  if (str(formData.get('sendConfirmed')) !== 'true') {
    return actionErr(
      'Customer receipt send requires preview approval. Open the work order → Preview customer receipt → approve → then send. Direct send is disabled.',
    );
  }

  const receiptId = str(formData.get('receiptId')).trim();
  const paymentId = str(formData.get('paymentId')).trim();
  if (!receiptId && !paymentId) return actionErr('No receipt or payment linked.');

  const receiptRes = receiptId ? await gate.admin.from('receipts').select('*').eq('id', receiptId).maybeSingle() : { data: null };
  const receipt = (receiptRes.data ?? {}) as Record<string, unknown>;
  const receiptMeta = receipt.metadata && typeof receipt.metadata === 'object' ? (receipt.metadata as Record<string, unknown>) : {};
  if (receiptMeta.receipt_draft_approved !== true && str(receipt.status) !== 'approved' && str(receipt.status) !== 'issued') {
    return actionErr('Receipt is not approved for customer send. Preview and approve from the work order first.');
  }

  const resolvedPaymentId = paymentId || str(receipt.payment_id);
  const paymentRes = resolvedPaymentId ? await gate.admin.from('payments').select('*').eq('id', resolvedPaymentId).maybeSingle() : { data: null };
  const payment = (paymentRes.data ?? {}) as Record<string, unknown>;
  const appointmentId = str(receipt.appointment_id || payment.appointment_id);
  const fallbackId = str(receipt.fallback_booking_id || payment.fallback_booking_id);

  const [apptRes, fbRes, customerRes] = await Promise.all([
    appointmentId ? gate.admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle() : Promise.resolve({ data: null }),
    fallbackId ? gate.admin.from('booking_fallbacks').select('*').eq('id', fallbackId).maybeSingle() : Promise.resolve({ data: null }),
    str(receipt.customer_id || payment.customer_id) ? gate.admin.from('customers').select('*').eq('id', str(receipt.customer_id || payment.customer_id)).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const job = (apptRes.data ?? fbRes.data ?? {}) as Record<string, unknown>;
  const customer = (customerRes.data ?? {}) as Record<string, unknown>;
  const email = str(job.guest_email || customer.email || payment.email);
  const receiptNumber = str(receipt.receipt_number) || `RCPT-${(resolvedPaymentId || appointmentId || fallbackId || 'manual').slice(0, 8).toUpperCase()}`;
  const workOrderId = appointmentId || fallbackId;

  const ledger = workOrderId
    ? await resolveOrderLedger(gate.admin, {
        workOrderId,
        appointmentId: appointmentId || undefined,
        fallbackBookingId: fallbackId || undefined,
      })
    : null;

  const view = await buildUnifiedReceiptView(gate.admin, {
    job,
    appointmentId,
    fallbackBookingId: fallbackId,
    receiptNumber,
    receiptId: receiptId || undefined,
  });

  let status = 'skipped';
  let skippedReason: string | null = null;
  let errorMessage: string | null = null;
  if (!email.includes('@')) {
    skippedReason = 'No customer email on file.';
  } else if (!resendConfigured()) {
    skippedReason = 'Skipped - configure Resend before emailing receipts.';
  } else {
    const sent = await sendResendHtml({
      to: email,
      subject: `Gloss Boss ATX receipt ${view.receiptNumber}`,
      html: view.emailHtml,
    });
    if (sent.ok) {
      status = 'sent';
      if (sent.emailId) {
        await gate.admin.from('notification_outbox').insert({
          appointment_id: appointmentId || null,
          fallback_booking_id: fallbackId || null,
          customer_id: str(customer.id || payment.customer_id) || null,
          kind: 'receipt',
          channel: 'email',
          status: 'sent',
          provider_message_id: sent.emailId,
          payload: { receipt_number: receiptNumber, to: email },
        });
      }
    } else {
      status = 'failed';
      errorMessage = /403|domain/i.test(sent.error ?? '') ? 'Resend domain not verified. Verify domain before sending to customers.' : sent.error ?? 'Receipt email failed.';
    }
  }

  if (!receiptId && resolvedPaymentId) {
    await gate.admin.from('receipts').insert({
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackId || null,
      payment_id: resolvedPaymentId,
      customer_id: str(customer.id || payment.customer_id) || null,
      receipt_number: receiptNumber,
      amount_cents: ledger?.totals.finalTotalCents ?? 0,
      payment_method: str(payment.payment_method || payment.payment_kind || 'stripe') || 'stripe',
      status: 'issued',
      emailed_to: email || null,
      email_status: status,
      emailed_at: status === 'sent' ? new Date().toISOString() : null,
      metadata: { generated_from: 'send_receipt_action' },
    });
  } else if (receiptId) {
    await gate.admin.from('receipts').update({
      emailed_to: email || null,
      email_status: status,
      emailed_at: status === 'sent' ? new Date().toISOString() : null,
      last_error: errorMessage ?? skippedReason,
    }).eq('id', receiptId);
  }

  await gate.admin.from('notification_outbox').insert({
    appointment_id: appointmentId || null,
    fallback_booking_id: fallbackId || null,
    customer_id: str(customer.id || payment.customer_id) || null,
    kind: 'receipt',
    channel: 'email',
    status,
    skipped_reason: skippedReason,
    error_message: errorMessage,
    payload: { receipt_number: receiptNumber, payment_id: resolvedPaymentId, to: email },
  });
  revalidatePath('/admin/receipts');
  if (receiptId) revalidatePath(`/admin/receipts/${receiptId}`);
  if (resolvedPaymentId) revalidatePath(`/admin/receipts/${resolvedPaymentId}`);

  if (status === 'sent') {
    void import('@/lib/owner-alerts').then(({ notifyOwnerBookingEvent }) =>
      notifyOwnerBookingEvent({
        kind: 'receipt_sent',
        appointmentId: appointmentId || undefined,
        guestName: str(job.guest_name || customer.full_name) || undefined,
        guestEmail: email,
        totalCents: ledger?.totals.finalTotalCents ?? (typeof payment.amount_cents === 'number' ? payment.amount_cents : 0),
        extraNote: `Receipt ${receiptNumber} emailed to customer.`,
      }),
    );
    return actionOk(
      `Receipt emailed to ${email}. If they do not see it within a few minutes, ask them to check spam and confirm Resend domain is verified for glossbossatx.com.`,
    );
  }
  if (status === 'skipped') return actionErr(skippedReason ?? 'Receipt email skipped — no email sent.');
  return actionErr(errorMessage ?? 'Receipt email failed — customer did not receive it.');
}

export async function updateReceiptRevenueFlagsAction(formData: FormData): Promise<void> {
  const gate = await requireReceiptSender();
  if (!gate) return;
  const receiptId = str(formData.get('receiptId')).trim();
  const paymentId = str(formData.get('paymentId')).trim();
  const action = str(formData.get('flagAction')).trim();
  const now = new Date().toISOString();
  const receiptPatch: Record<string, unknown> = {};
  const paymentPatch: Record<string, unknown> = {};

  if (action === 'mark_test') {
    receiptPatch.is_test = true;
    paymentPatch.is_test = true;
  } else if (action === 'exclude') {
    receiptPatch.exclude_from_revenue = true;
    paymentPatch.exclude_from_revenue = true;
  } else if (action === 'include') {
    receiptPatch.exclude_from_revenue = false;
    paymentPatch.exclude_from_revenue = false;
    receiptPatch.is_test = false;
    paymentPatch.is_test = false;
  } else if (action === 'void') {
    receiptPatch.voided_at = now;
    receiptPatch.status = 'voided';
    paymentPatch.voided_at = now;
    paymentPatch.voided = true;
    paymentPatch.status = 'voided';
  } else if (action === 'delete_test' && receiptId) {
    const { data } = await gate.admin.from('receipts').select('is_test').eq('id', receiptId).maybeSingle();
    if ((data as { is_test?: boolean } | null)?.is_test === true) {
      await gate.admin.from('receipts').delete().eq('id', receiptId);
    }
    revalidatePath('/admin/receipts');
    return;
  }

  if (receiptId && Object.keys(receiptPatch).length) await safeFlagUpdate(gate.admin, 'receipts', receiptPatch, { kind: 'eq', column: 'id', value: receiptId });
  if (paymentId && Object.keys(paymentPatch).length) await safeFlagUpdate(gate.admin, 'payments', paymentPatch, { kind: 'eq', column: 'id', value: paymentId });
  revalidatePath('/admin/receipts');
  if (receiptId) revalidatePath(`/admin/receipts/${receiptId}`);
}

export async function bulkReceiptRevenueFlagsAction(formData: FormData): Promise<void> {
  const gate = await requireReceiptSender();
  if (!gate) return;
  const ids = formData.getAll('receiptIds').map((v) => str(v)).filter(Boolean);
  const action = str(formData.get('bulkAction'));
  if (ids.length === 0) return;
  const { data: linkedReceipts } = await gate.admin.from('receipts').select('id, payment_id, is_test').in('id', ids);
  const paymentIds = (linkedReceipts ?? []).map((r) => str((r as Record<string, unknown>).payment_id)).filter(Boolean);
  const now = new Date().toISOString();
  if (action === 'mark_test') {
    await safeFlagUpdate(gate.admin, 'receipts', { is_test: true }, { kind: 'in', column: 'id', values: ids });
    if (paymentIds.length > 0) await safeFlagUpdate(gate.admin, 'payments', { is_test: true }, { kind: 'in', column: 'id', values: paymentIds });
  } else if (action === 'exclude') {
    await safeFlagUpdate(gate.admin, 'receipts', { exclude_from_revenue: true }, { kind: 'in', column: 'id', values: ids });
    if (paymentIds.length > 0) await safeFlagUpdate(gate.admin, 'payments', { exclude_from_revenue: true }, { kind: 'in', column: 'id', values: paymentIds });
  } else if (action === 'void') {
    await safeFlagUpdate(gate.admin, 'receipts', { voided_at: now, status: 'voided' }, { kind: 'in', column: 'id', values: ids });
    if (paymentIds.length > 0) await safeFlagUpdate(gate.admin, 'payments', { voided_at: now, voided: true, status: 'voided' }, { kind: 'in', column: 'id', values: paymentIds });
  } else if (action === 'delete_test') {
    const testIds = (linkedReceipts ?? [])
      .filter((r) => (r as Record<string, unknown>).is_test === true)
      .map((r) => str((r as Record<string, unknown>).id))
      .filter(Boolean);
    if (testIds.length > 0) await gate.admin.from('receipts').delete().in('id', testIds).eq('is_test', true);
  }
  revalidatePath('/admin/receipts');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
}
