import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveJobPricing } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { loadOrderSnapshot, type OrderSnapshot } from '@/lib/order-snapshot-engine';
import { resolveWorkOrder } from '@/lib/work-order-resolve';
import { displayChicago, displayLabel, displayMoney, displayPhone, displayText, str } from '@/lib/display-format';
import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';
import { buildReceiptPdfBytes } from '@/lib/receipt-pdf';
import { buildUnifiedReceiptView } from '@/lib/unified-receipt';

type Row = Record<string, unknown>;

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export type ResolvedReceiptContext = {
  receipt: Row | null;
  payment: Row | null;
  job: Row;
  payments: Row[];
  pricing: ReturnType<typeof resolveJobPricing>;
  techName: string;
  receiptNumber: string;
  isFallback: boolean;
  workOrderId: string;
  snapshot: OrderSnapshot | null;
};

function obj(v: unknown): Row {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
}

export async function resolveReceiptContext(
  admin: SupabaseClient,
  rawId: string,
  sourceHint?: string,
): Promise<ResolvedReceiptContext | null> {
  const id = str(rawId).trim();
  if (!id) return null;

  let receipt = (await admin.from('receipts').select('*').eq('id', id).maybeSingle()).data as Row | null;
  if (!receipt) receipt = (await admin.from('receipts').select('*').eq('payment_id', id).maybeSingle()).data as Row | null;

  let payment: Row | null = null;
  const paymentId = str(receipt?.payment_id || id);
  if (paymentId) {
    payment = (await admin.from('payments').select('*').eq('id', paymentId).maybeSingle()).data as Row | null;
  }

  let appointmentId = str(receipt?.appointment_id || payment?.appointment_id);
  let fallbackId = str(receipt?.fallback_booking_id || payment?.fallback_booking_id);
  let workOrderId = appointmentId || fallbackId || id;
  let isFallback = Boolean(fallbackId && !appointmentId);

  if (!appointmentId && !fallbackId) {
    const payByAppt = await admin.from('payments').select('*').eq('appointment_id', id).order('paid_at', { ascending: false }).limit(1);
    const payByFb = await admin.from('payments').select('*').eq('fallback_booking_id', id).order('paid_at', { ascending: false }).limit(1);
    if (payByAppt.data?.[0]) {
      payment = payByAppt.data[0] as Row;
      appointmentId = id;
      workOrderId = id;
      isFallback = false;
    } else if (payByFb.data?.[0]) {
      payment = payByFb.data[0] as Row;
      fallbackId = id;
      workOrderId = id;
      isFallback = true;
    } else {
      const rByAppt = await admin.from('receipts').select('*').eq('appointment_id', id).order('created_at', { ascending: false }).limit(1);
      const rByFb = await admin.from('receipts').select('*').eq('fallback_booking_id', id).order('created_at', { ascending: false }).limit(1);
      if (rByAppt.data?.[0]) {
        receipt = rByAppt.data[0] as Row;
        appointmentId = id;
        workOrderId = id;
        payment = payment ?? ((await admin.from('payments').select('*').eq('id', str(receipt.payment_id)).maybeSingle()).data as Row | null);
      } else if (rByFb.data?.[0]) {
        receipt = rByFb.data[0] as Row;
        fallbackId = id;
        workOrderId = id;
        isFallback = true;
        payment = payment ?? ((await admin.from('payments').select('*').eq('id', str(receipt.payment_id)).maybeSingle()).data as Row | null);
      }
    }
  }

  let job: Row = {};
  let techName = '';

  if (appointmentId || fallbackId) {
    const table = isFallback ? 'booking_fallbacks' : 'appointments';
    const jobId = isFallback ? fallbackId : appointmentId;
    const { data } = await admin.from(table).select('*').eq('id', jobId).maybeSingle();
    job = (data ?? {}) as Row;
  } else {
    const resolved = await resolveWorkOrder(admin, id, sourceHint);
    if (resolved) {
      job = resolved.row;
      techName = resolved.technicianName ?? '';
      workOrderId = resolved.canonicalId;
      isFallback = resolved.isFallback;
      appointmentId = resolved.isFallback ? '' : resolved.canonicalId;
      fallbackId = resolved.isFallback ? resolved.canonicalId : '';
    }
  }

  if (!Object.keys(job).length) {
    const resolved = await resolveWorkOrder(admin, id, sourceHint);
    if (!resolved) return null;
    job = resolved.row;
    techName = resolved.technicianName ?? '';
    workOrderId = resolved.canonicalId;
    isFallback = resolved.isFallback;
    appointmentId = resolved.isFallback ? '' : resolved.canonicalId;
    fallbackId = resolved.isFallback ? resolved.canonicalId : '';
  }

  if (!Object.keys(job).length) return null;

  if (!techName) {
    const techId = str(job.assigned_technician_id);
    if (techId) {
      const { data: techProfile } = await admin.from('profiles').select('full_name, email').eq('id', techId).maybeSingle();
      techName = str((techProfile as Row | null)?.full_name) || str((techProfile as Row | null)?.email) || '';
    }
  }

  if (!payment) {
    const pq = await admin
      .from('payments')
      .select('*')
      .eq(isFallback ? 'fallback_booking_id' : 'appointment_id', workOrderId)
      .order('paid_at', { ascending: false })
      .limit(20);
    payment = (pq.data?.[0] ?? null) as Row | null;
  }

  const payments = await fetchPaymentsForJob(admin, job, {
    appointmentId,
    fallbackBookingId: fallbackId,
    isFallback,
  });

  if (!receipt && (payment || Object.keys(job).length)) {
    const receiptNumber = `RCPT-${workOrderId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).slice(-4)}`;
    const { resolveOrderLedger } = await import('@/lib/order-ledger');
    const ledger = await resolveOrderLedger(admin, {
      workOrderId,
      appointmentId: isFallback ? undefined : workOrderId,
      fallbackBookingId: isFallback ? workOrderId : undefined,
    });
    if (!ledger) throw new Error('Could not resolve order ledger for receipt PDF.');
    const amount =
      ledger.totals.finalTotalCents > 0 ? ledger.totals.finalTotalCents : payment ? num(payment.amount_cents) : 0;
    const { data: inserted } = await admin
      .from('receipts')
      .insert({
        appointment_id: appointmentId || null,
        fallback_booking_id: fallbackId || null,
        customer_id: str(job.customer_id) || null,
        payment_id: str(payment?.id) || null,
        receipt_number: receiptNumber,
        amount_cents: amount,
        payment_method: str(payment?.payment_method || payment?.payment_kind || job.payment_choice || 'stripe'),
        status: 'issued',
        metadata: { source: 'pdf_auto_generate' },
      })
      .select('*')
      .maybeSingle();
    receipt = (inserted ?? null) as Row | null;
  }

  const snapshot = await loadOrderSnapshot(admin, {
    workOrderId,
    appointmentId,
    fallbackBookingId: fallbackId,
    receiptId: str(receipt?.id),
    paymentId: str(payment?.id),
    sourceHint,
  });
  const pricing = snapshot?.pricing ?? resolveJobPricing(job, payments);
  const receiptNumber =
    str(receipt?.receipt_number) ||
    `RCPT-${str(payment?.id || workOrderId).slice(0, 8).toUpperCase()}`;

  return {
    receipt,
    payment,
    job,
    payments,
    pricing,
    techName,
    receiptNumber,
    isFallback,
    workOrderId,
    snapshot,
  };
}

function address(job: Row) {
  return [job.service_address, job.service_city, job.service_state, job.service_zip].map(str).filter(Boolean).join(', ');
}

export async function buildReceiptPdfFromContext(
  ctx: ResolvedReceiptContext,
  admin: import('@supabase/supabase-js').SupabaseClient,
): Promise<Uint8Array> {
  const { job, techName, receiptNumber, isFallback, workOrderId } = ctx;
  const view = await buildUnifiedReceiptView(admin, {
    job,
    appointmentId: isFallback ? undefined : workOrderId,
    fallbackBookingId: isFallback ? workOrderId : undefined,
    receiptNumber,
    techName,
    receiptId: str(ctx.receipt?.id) || undefined,
  });
  return buildReceiptPdfBytes(view.pdfInput);
}
