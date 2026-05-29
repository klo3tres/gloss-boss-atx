'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { buildUnifiedReceiptView } from '@/lib/unified-receipt';
import { resolveOrderLedger } from '@/lib/order-ledger';
import { sendReceiptAction } from '@/app/(dashboard)/admin/receipts/receipt-actions';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function requireStaff() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { admin, userId: session.user.id, session };
}

async function loadWorkOrderJob(gate: NonNullable<Awaited<ReturnType<typeof requireStaff>>>, formData: FormData) {
  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  if (!jobId) return null;
  const { data: job } = await gate.admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!job) return null;
  return { job: job as Record<string, unknown>, jobId, appointmentId, fallbackBookingId, table };
}

async function upsertWorkOrderReceipt(
  admin: SupabaseClient,
  jobId: string,
  appointmentId: string,
  fallbackBookingId: string,
  jobRow: Record<string, unknown>,
) {
  const ledger = await resolveOrderLedger(admin, {
    workOrderId: jobId,
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
  });
  if (!ledger) throw new Error('Could not resolve order ledger for receipt.');

  const view = await buildUnifiedReceiptView(admin, {
    job: jobRow,
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
  });

  const lastPay = ledger.customerPayments[0] ?? ledger.payments.find((p) => !p.voided);

  const payload = {
    appointment_id: appointmentId || null,
    fallback_booking_id: fallbackBookingId || null,
    customer_id: str(jobRow.customer_id) || null,
    payment_id: lastPay?.id || null,
    receipt_number: view.receiptNumber,
    amount_cents: ledger.totals.finalTotalCents,
    payment_method: lastPay?.method || str(jobRow.payment_choice || 'cash'),
    status: 'draft',
    metadata: {
      source: 'work_order_generate',
      rebuiltAt: new Date().toISOString(),
      final_total_cents: ledger.totals.finalTotalCents,
      total_paid_cents: ledger.totals.totalPaidCents,
      remaining_balance_cents: ledger.totals.balanceDueCents,
      deposit_paid_cents: ledger.totals.depositPaidCents,
      stripe_paid_cents: ledger.totals.stripePaidCents,
      receipt_draft_approved: false,
      receiptLineLabels: view.customerBreakdownLines.map((l) => l.label),
      unifiedReceipt: {
        documentProps: view.documentProps,
        customerBreakdownLines: view.customerBreakdownLines,
      },
    },
    updated_at: new Date().toISOString(),
  };

  const existing = appointmentId
    ? await admin.from('receipts').select('id').eq('appointment_id', appointmentId).order('created_at', { ascending: false }).limit(1)
    : await admin.from('receipts').select('id').eq('fallback_booking_id', fallbackBookingId).order('created_at', { ascending: false }).limit(1);

  const existingId = str((existing.data?.[0] as { id?: string } | undefined)?.id);
  if (existingId) {
    await admin.from('receipts').update(payload).eq('id', existingId);
    return existingId;
  }

  const { data: inserted } = await admin
    .from('receipts')
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select('id')
    .maybeSingle();
  return str((inserted as { id?: string } | null)?.id);
}

export async function generateWorkOrderReceiptActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');
  const ctx = await loadWorkOrderJob(gate, formData);
  if (!ctx) return actionErr('Work order not found.');

  const receiptId = await upsertWorkOrderReceipt(gate.admin, ctx.jobId, ctx.appointmentId, ctx.fallbackBookingId, ctx.job);
  revalidatePath(`/tech/work-orders/${ctx.jobId}`);
  revalidatePath('/admin/receipts');
  return actionOk(receiptId ? `Receipt ${receiptId.slice(0, 8)}… saved from latest work order totals.` : 'Receipt generated.');
}

export async function generateWorkOrderReceiptAction(formData: FormData) {
  return generateWorkOrderReceiptActionState(null, formData);
}

export type ReceiptPreviewResult = {
  ok: boolean;
  error?: string;
  message?: string;
  receiptNumber?: string;
  documentProps?: unknown;
};

export async function previewCustomerReceiptAction(formData: FormData): Promise<ReceiptPreviewResult> {
  const gate = await requireStaff();
  if (!gate) return { ok: false, error: 'Not authorized.' };
  const ctx = await loadWorkOrderJob(gate, formData);
  if (!ctx) return { ok: false, error: 'Work order not found.' };

  await upsertWorkOrderReceipt(gate.admin, ctx.jobId, ctx.appointmentId, ctx.fallbackBookingId, ctx.job);
  const view = await buildUnifiedReceiptView(gate.admin, {
    job: ctx.job,
    appointmentId: ctx.appointmentId || undefined,
    fallbackBookingId: ctx.fallbackBookingId || undefined,
  });

  return {
    ok: true,
    message: 'Preview ready',
    receiptNumber: view.receiptNumber,
    documentProps: view.documentProps,
  };
}

export async function saveReceiptDraftAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');
  const ctx = await loadWorkOrderJob(gate, formData);
  if (!ctx) return actionErr('Work order not found.');
  const receiptId = await upsertWorkOrderReceipt(gate.admin, ctx.jobId, ctx.appointmentId, ctx.fallbackBookingId, ctx.job);
  revalidatePath(`/tech/work-orders/${ctx.jobId}`);
  return actionOk(receiptId ? `Draft receipt ${receiptId.slice(0, 8)}… saved.` : 'Draft saved.');
}

export async function sendReceiptTestToOwnerAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');
  const ctx = await loadWorkOrderJob(gate, formData);
  if (!ctx) return actionErr('Work order not found.');

  const ownerEmail = str(gate.session.user?.email);
  if (!ownerEmail.includes('@')) return actionErr('Your account has no email for test send.');

  const view = await buildUnifiedReceiptView(gate.admin, {
    job: ctx.job,
    appointmentId: ctx.appointmentId || undefined,
    fallbackBookingId: ctx.fallbackBookingId || undefined,
  });

  if (!resendConfigured()) return actionErr('Resend not configured — cannot send test email.');

  const sent = await sendResendHtml({
    to: ownerEmail,
    subject: `[TEST] Gloss Boss receipt ${view.receiptNumber}`,
    html: view.emailHtml,
  });
  if (!sent.ok) return actionErr(sent.error ?? 'Test email failed.');
  return actionOk(`Test receipt sent to ${ownerEmail}. Compare with on-screen preview.`);
}

/** Legacy entry — blocked; use preview → approve → send. */
export async function sendWorkOrderReceiptEmailAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  if (str(formData.get('sendConfirmed')) === 'true') {
    return sendWorkOrderReceiptConfirmedAction(formData);
  }
  return actionErr('Open “Preview customer receipt”, review, check approve, then “Approve and send to customer”. Customer is not emailed from this button anymore.');
}

export async function sendWorkOrderReceiptConfirmedAction(formData: FormData): Promise<ActionResult> {
  if (str(formData.get('sendConfirmed')) !== 'true') {
    return actionErr('Receipt send requires explicit approval (sendConfirmed).');
  }

  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const workOrderId = appointmentId || fallbackBookingId;
  if (!workOrderId) return actionErr('Missing work order.');

  const ctx = await loadWorkOrderJob(gate, formData);
  if (!ctx) return actionErr('Work order not found.');

  const receiptIdDraft = await upsertWorkOrderReceipt(gate.admin, ctx.jobId, ctx.appointmentId, ctx.fallbackBookingId, ctx.job);
  if (receiptIdDraft) {
    const { data: existing } = await gate.admin.from('receipts').select('metadata').eq('id', receiptIdDraft).maybeSingle();
    const meta = (existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}) as Record<string, unknown>;
    await gate.admin
      .from('receipts')
      .update({
        metadata: {
          ...meta,
          receipt_draft_approved: true,
          draft_approved_at: new Date().toISOString(),
          draft_approved_by: gate.userId,
        },
        status: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', receiptIdDraft);
  }

  const fd = new FormData();
  const byAppt = appointmentId
    ? await gate.admin.from('receipts').select('id').eq('appointment_id', appointmentId).order('created_at', { ascending: false }).limit(1)
    : { data: null };
  const byFb = fallbackBookingId
    ? await gate.admin.from('receipts').select('id').eq('fallback_booking_id', fallbackBookingId).order('created_at', { ascending: false }).limit(1)
    : { data: null };
  const rid = str((byAppt.data?.[0] as { id?: string } | undefined)?.id || (byFb.data?.[0] as { id?: string } | undefined)?.id);
  if (rid) fd.set('receiptId', rid);
  fd.set('sendConfirmed', 'true');

  const result = await sendReceiptAction(fd);
  revalidatePath(`/tech/work-orders/${workOrderId}`);
  return result;
}

export async function sendWorkOrderReceiptAction(formData: FormData) {
  return sendWorkOrderReceiptEmailAction(null, formData);
}
