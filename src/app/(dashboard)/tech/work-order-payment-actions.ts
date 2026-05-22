'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
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

export async function generateWorkOrderReceiptAction(formData: FormData) {
  const gate = await requireStaff();
  if (!gate) return;
  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  if (!appointmentId && !fallbackBookingId) return;

  const table = fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  const { data: job } = await gate.admin.from(table).select('id, customer_id, guest_email, base_price_cents, deposit_amount_cents, payment_status').eq('id', jobId).maybeSingle();
  if (!job) return;

  const { data: lastPay } = await gate.admin
    .from('payments')
    .select('id, amount_cents, payment_method, status')
    .eq(fallbackBookingId ? 'fallback_booking_id' : 'appointment_id', jobId)
    .order('paid_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const pay = (lastPay ?? {}) as Record<string, unknown>;
  const amount =
    typeof pay.amount_cents === 'number'
      ? pay.amount_cents
      : typeof (job as Record<string, unknown>).base_price_cents === 'number'
        ? Number((job as Record<string, unknown>).base_price_cents)
        : 0;

  await gate.admin.from('receipts').insert({
    appointment_id: appointmentId || null,
    fallback_booking_id: fallbackBookingId || null,
    customer_id: str((job as Record<string, unknown>).customer_id) || null,
    payment_id: str(pay.id) || null,
    receipt_number: `WO-${jobId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).slice(-4)}`,
    amount_cents: amount,
    payment_method: str(pay.payment_method) || 'stripe',
    status: 'issued',
    metadata: { source: 'work_order_generate' },
  });

  revalidatePath(`/tech/work-orders/${appointmentId || fallbackBookingId}`);
  revalidatePath('/admin/receipts');
}

export async function sendWorkOrderReceiptAction(formData: FormData) {
  const gate = await requireStaff();
  if (!gate) return;
  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const receiptId = str(formData.get('receiptId'));
  const fd = new FormData();
  if (receiptId) fd.set('receiptId', receiptId);
  if (appointmentId) {
    const { data: r } = await gate.admin.from('receipts').select('id').eq('appointment_id', appointmentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (r && typeof (r as { id?: string }).id === 'string') fd.set('receiptId', (r as { id: string }).id);
  }
  await sendReceiptAction(fd);
  revalidatePath(`/tech/work-orders/${appointmentId || fallbackBookingId}`);
}
