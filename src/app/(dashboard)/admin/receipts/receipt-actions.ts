'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { resendConfigured, sendResendHtml } from '@/lib/email-send';
import { buildReceiptEmailHtml } from '@/lib/email/templates/receipt';
import { displayChicago, displayLabel, displayMoney } from '@/lib/display-format';

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function money(cents: unknown) {
  return typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}` : '$0.00';
}

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return null;
  return { admin, userId: session.user.id };
}

export async function sendReceiptAction(formData: FormData) {
  const gate = await requireAdmin();
  if (!gate) return;
  const receiptId = str(formData.get('receiptId')).trim();
  const paymentId = str(formData.get('paymentId')).trim();
  if (!receiptId && !paymentId) return;

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
  const total = typeof job.base_price_cents === 'number' ? job.base_price_cents : payment.amount_cents;
  const paid = typeof payment.amount_cents === 'number' ? payment.amount_cents : receipt.amount_cents;

  let status = 'skipped';
  let skippedReason: string | null = null;
  let errorMessage: string | null = null;
  if (!email.includes('@')) {
    skippedReason = 'No customer email on file.';
  } else if (!resendConfigured()) {
    skippedReason = 'Skipped - configure Resend before emailing receipts.';
  } else {
    const pricing =
      job.booking_pricing_breakdown && typeof job.booking_pricing_breakdown === 'object'
        ? (job.booking_pricing_breakdown as Record<string, unknown>)
        : {};
    const vehiclesRaw = Array.isArray(job.booking_vehicles) ? (job.booking_vehicles as Record<string, unknown>[]) : [];
    const vehicleLines = vehiclesRaw.length
      ? vehiclesRaw.map((v, i) => ({
          name: str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`,
          service: displayLabel(v.service_slug || job.service_slug),
          color: str(v.vehicle_color || v.color) || undefined,
          price: typeof v.price_cents === 'number' ? displayMoney(v.price_cents) : undefined,
        }))
      : [
          {
            name: str(job.vehicle_description) || 'Service',
            service: displayLabel(job.service_slug),
          },
        ];
    const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://glossbossatx.com';
    const receiptUrl = receiptId
      ? `${appBase}/admin/receipts/${encodeURIComponent(receiptId)}`
      : resolvedPaymentId
        ? `${appBase}/admin/receipts/${encodeURIComponent(resolvedPaymentId)}`
        : undefined;
    const html = buildReceiptEmailHtml({
      customerName: str(job.guest_name || customer.full_name || 'Customer'),
      receiptNumber,
      serviceAddress: [job.service_address, job.service_city, job.service_state, job.service_zip].map(str).filter(Boolean).join(', '),
      serviceAt: displayChicago(job.scheduled_start || job.job_completed_at || payment.created_at),
      line: {
        vehicles: vehicleLines,
        subtotal: displayMoney(pricing.baseTotalCents ?? total),
        onlineDiscount:
          typeof pricing.onlineDiscountCents === 'number' && pricing.onlineDiscountCents > 0
            ? displayMoney(pricing.onlineDiscountCents)
            : undefined,
        multiCarDiscount:
          typeof pricing.multiCarDiscountCents === 'number' && pricing.multiCarDiscountCents > 0
            ? displayMoney(pricing.multiCarDiscountCents)
            : undefined,
        promo: typeof pricing.promoDiscountCents === 'number' ? displayMoney(pricing.promoDiscountCents) : undefined,
        depositPaid: typeof job.deposit_amount_cents === 'number' ? displayMoney(job.deposit_amount_cents) : undefined,
        cashPaid: str(payment.payment_method).toLowerCase().includes('cash') ? money(paid) : undefined,
        totalPaid: money(paid),
        remainingBalance: typeof job.balance_due_cents === 'number' ? displayMoney(job.balance_due_cents) : undefined,
        paymentMethod: displayLabel(payment.payment_method || payment.payment_kind || receipt.payment_method),
        receiptUrl,
      },
    });
    const sent = await sendResendHtml({ to: email, subject: `Gloss Boss ATX receipt ${receiptNumber}`, html });
    if (sent.ok) status = 'sent';
    else {
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
      amount_cents: typeof paid === 'number' ? paid : 0,
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
}
