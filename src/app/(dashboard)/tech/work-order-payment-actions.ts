'use server';



import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

import { getSessionWithProfile } from '@/lib/auth/session';

import { isStaffRole } from '@/lib/auth/roles';

import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

import { resolveJobPricing } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';

import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';

import { sendReceiptAction } from '@/app/(dashboard)/admin/receipts/receipt-actions';



function str(v: unknown) {

  return v == null ? '' : String(v).trim();

}



async function requireStaff() {

  const session = await getSessionWithProfile();

  const admin = tryCreateAdminSupabase();

  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;

  return { admin, userId: session.user.id };

}



async function upsertWorkOrderReceipt(
  admin: SupabaseClient,
  jobId: string,

  appointmentId: string,

  fallbackBookingId: string,

  jobRow: Record<string, unknown>,

) {

  const payments = await fetchPaymentsForJob(admin, jobRow, {
    appointmentId,
    fallbackBookingId,
    isFallback: Boolean(fallbackBookingId),
  });

  const pricing = resolveJobPricing(jobRow, payments);

  const lastPay = payments[0] as Record<string, unknown> | undefined;

  const receiptNumber = `WO-${jobId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;

  const snapshot = await loadOrderSnapshot(admin, {
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
  });

  const payload = {

    appointment_id: appointmentId || null,

    fallback_booking_id: fallbackBookingId || null,

    customer_id: str(jobRow.customer_id) || null,

    payment_id: str(lastPay?.id) || null,

    receipt_number: receiptNumber,

    amount_cents: pricing.finalTotalCents,

    payment_method: str(lastPay?.payment_method || lastPay?.payment_kind || jobRow.payment_choice || 'cash'),

    status: 'issued',

    metadata: {

      source: 'work_order_generate',

      final_total_cents: pricing.finalTotalCents,

      total_paid_cents: pricing.totalPaidCents,

      remaining_balance_cents: pricing.remainingBalanceCents,

      deposit_paid_cents: pricing.depositPaidCents,

      stripe_paid_cents: pricing.stripePaidCents,

      receiptLineLabels: snapshot?.receiptLines?.map((l) => l.label) ?? [],

      orderSnapshot: snapshot,

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



  const { data: inserted } = await admin.from('receipts').insert({ ...payload, created_at: new Date().toISOString() }).select('id').maybeSingle();

  return str((inserted as { id?: string } | null)?.id);

}



export async function generateWorkOrderReceiptActionState(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {

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

  const receiptId = await upsertWorkOrderReceipt(gate.admin, jobId, appointmentId, fallbackBookingId, jobRow);



  revalidatePath(`/tech/work-orders/${jobId}`);

  revalidatePath('/admin/receipts');

  return actionOk(receiptId ? `Receipt ${receiptId.slice(0, 8)}… saved from latest work order totals.` : 'Receipt generated.');

}



export async function generateWorkOrderReceiptAction(formData: FormData) {

  return generateWorkOrderReceiptActionState(null, formData);

}



export async function sendWorkOrderReceiptAction(formData: FormData) {

  return sendWorkOrderReceiptEmailAction(null, formData);

}



export async function sendWorkOrderReceiptEmailAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {

  const gate = await requireStaff();

  if (!gate) return actionErr('Not authorized.');



  const appointmentId = str(formData.get('appointmentId'));

  const fallbackBookingId = str(formData.get('fallbackBookingId'));

  const workOrderId = appointmentId || fallbackBookingId;

  if (!workOrderId) return actionErr('Missing work order.');



  await generateWorkOrderReceiptActionState(null, formData);



  const fd = new FormData();

  const receiptId = str(formData.get('receiptId'));



  if (receiptId) fd.set('receiptId', receiptId);



  const byAppt = appointmentId

    ? await gate.admin.from('receipts').select('id').eq('appointment_id', appointmentId).order('created_at', { ascending: false }).limit(1)

    : { data: null };

  const byFb = fallbackBookingId

    ? await gate.admin.from('receipts').select('id').eq('fallback_booking_id', fallbackBookingId).order('created_at', { ascending: false }).limit(1)

    : { data: null };



  const rid = str((byAppt.data?.[0] as { id?: string } | undefined)?.id || (byFb.data?.[0] as { id?: string } | undefined)?.id);

  if (rid) fd.set('receiptId', rid);



  const payQ = await gate.admin

    .from('payments')

    .select('id')

    .eq(appointmentId ? 'appointment_id' : 'fallback_booking_id', workOrderId)

    .order('paid_at', { ascending: false })

    .limit(1);

  const payId = str((payQ.data?.[0] as { id?: string } | undefined)?.id);

  if (!rid && payId) fd.set('paymentId', payId);



  if (!fd.get('receiptId') && !fd.get('paymentId')) {

    return actionErr('Could not find or create a receipt for this work order.');

  }



  const result = await sendReceiptAction(fd);

  revalidatePath(`/tech/work-orders/${workOrderId}`);

  return result;

}


