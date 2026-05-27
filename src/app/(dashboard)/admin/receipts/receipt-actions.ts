'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { buildUnifiedReceiptView } from '@/lib/unified-receipt';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { resolveJobPricing } from '@/lib/job-pricing-display';

function str(v: unknown) {
  return v == null ? '' : String(v);
}

async function requireReceiptSender() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id };
}

export async function sendReceiptActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  return sendReceiptAction(formData);
}

export async function sendReceiptAction(formData: FormData): Promise<ActionResult> {
  const gate = await requireReceiptSender();
  if (!gate) return actionErr('Not authorized.');
  const receiptId = str(formData.get('receiptId')).trim();
  const paymentId = str(formData.get('paymentId')).trim();
  if (!receiptId && !paymentId) return actionErr('No receipt or payment linked.');

  const receiptRes = receiptId ? await gate.admin.from('receipts').select('*').eq('id', receiptId).maybeSingle() : { data: null };
  const receipt = (receiptRes.data ?? {}) as Record<string, unknown>;
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
  const allPayments = workOrderId
    ? await fetchPaymentsForJob(gate.admin, job, {
        appointmentId,
        fallbackBookingId: fallbackId,
        isFallback: Boolean(fallbackId && !appointmentId),
      })
    : payment
      ? [payment]
      : [];
  const pricing = resolveJobPricing(job, allPayments);
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
      amount_cents: pricing.finalTotalCents,
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
    return actionOk(
      `Receipt emailed to ${email}. If they do not see it within a few minutes, ask them to check spam and confirm Resend domain is verified for glossbossatx.com.`,
    );
  }
  if (status === 'skipped') return actionErr(skippedReason ?? 'Receipt email skipped — no email sent.');
  return actionErr(errorMessage ?? 'Receipt email failed — customer did not receive it.');
}
