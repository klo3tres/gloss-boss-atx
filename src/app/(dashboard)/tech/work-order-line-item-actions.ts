'use server';

import { revalidatePath } from 'next/cache';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { resolveOrderLedger } from '@/lib/order-ledger';
import { ledgerReceiptLines } from '@/lib/receipt-from-ledger';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { isPricingDuplicateOrPaymentLine } from '@/lib/pricing-custom-lines';
import {
  LINE_ITEM_KIND_LABELS,
  mergePricingBreakdownWithLineItems,
  readCustomLineItems,
  type WorkOrderLineItem,
  type WorkOrderLineItemKind,
} from '@/lib/work-order-line-items';
import type { Row } from '@/lib/work-order-resolve';

function str(v: FormDataEntryValue | null) {
  return v == null ? '' : String(v).trim();
}

function parseAmountCents(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars) || dollars === 0) return null;
  return Math.round(Math.abs(dollars) * 100) * (cleaned.startsWith('-') || dollars < 0 ? -1 : 1);
}

export type LineItemActionResult = {
  ok: boolean;
  error?: string;
  data?: {
    savedLabel: string;
    lineItemCount: number;
    receiptLineLabels: string[];
    finalTotalCents: number;
  };
};

export async function addWorkOrderLineItemAction(formData: FormData): Promise<LineItemActionResult> {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY missing. Cannot save invoice line items.' };
  }

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const source = str(formData.get('source'));
  const kind = (str(formData.get('category')) || str(formData.get('kind')) || 'custom_addon') as WorkOrderLineItemKind;
  const label = str(formData.get('label')) || LINE_ITEM_KIND_LABELS[kind] || 'Custom charge';
  const amountRaw = str(formData.get('amountDollars'));
  const unitCents = parseAmountCents(amountRaw);
  if (unitCents == null) return { ok: false, error: 'Invalid amount' };
  const qty = Math.max(1, parseInt(str(formData.get('quantity')) || '1', 10) || 1);
  let amountCents = unitCents * qty;

  if (kind === 'discount_adjustment' && amountCents > 0) {
    amountCents = -amountCents;
  }

  const draftLine: WorkOrderLineItem = { id: 'draft', kind, label, amountCents };
  if (isPricingDuplicateOrPaymentLine(draftLine)) {
    return {
      ok: false,
      error:
        'This line duplicates an automatic discount or deposit. Use Pricing → Apply online / multi-car discount, or record payments under Payments — not invoice discount lines.',
    };
  }

  const table = source === 'fallback' || fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  if (!jobId) return { ok: false, error: 'Missing work order id' };

  const { data: jobRow } = await admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!jobRow) return { ok: false, error: 'Work order not found' };

  const job = jobRow as Row;
  const items = readCustomLineItems(job);
  const notes = str(formData.get('notes'));
  const customerVisible = formData.get('customerVisible') !== 'false';
  const taxable = formData.get('taxable') === 'true';

  items.push({
    id: `line-${Date.now().toString(36)}`,
    kind,
    label,
    amountCents,
    quantity: qty,
    notes: notes || undefined,
    customerVisible,
    taxable,
    createdAt: new Date().toISOString(),
    createdBy: session.user.id,
  });

  const jobWithLines = { ...job, booking_pricing_breakdown: mergePricingBreakdownWithLineItems(job, items) };

  const payments = await fetchPaymentsForJob(admin, jobWithLines, {
    appointmentId: table === 'appointments' ? jobId : undefined,
    fallbackBookingId: table === 'booking_fallbacks' ? jobId : undefined,
    isFallback: table === 'booking_fallbacks',
  });
  const pricing = resolveJobPricing(jobWithLines, payments);

  const breakdown = mergePricingBreakdownWithLineItems(job, items, {
    finalTotalCents: pricing.finalTotalCents,
    vehicleSubtotalCents: pricing.vehicleSubtotalCents,
    customLineItemsCents: pricing.customLineItemsCents,
  });

  const { data: updated, error: updateErr } = await admin
    .from(table)
    .update({
      booking_pricing_breakdown: breakdown,
      base_price_cents: pricing.finalTotalCents,
      balance_due_cents: pricing.remainingBalanceCents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select('*')
    .maybeSingle();

  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated) {
    return { ok: false, error: `DB update matched 0 rows for work order ${jobId}.` };
  }

  const { data: reread } = await admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!reread) return { ok: false, error: 'Line saved but re-read failed.' };

  const savedItems = readCustomLineItems(reread as Row);
  const found = savedItems.some((i) => i.label === label && i.amountCents === amountCents);
  if (!found) {
    return {
      ok: false,
      error: `Line "${label}" not found in database after save (${savedItems.length} items on file).`,
    };
  }

  await syncJobBalanceDue(admin, reread as Row, pricing, {
    appointmentId: table === 'appointments' ? jobId : undefined,
    fallbackBookingId: table === 'booking_fallbacks' ? jobId : undefined,
    isFallback: table === 'booking_fallbacks',
  });

  const { generateWorkOrderReceiptActionState } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
  const rebuildFd = new FormData();
  if (table === 'appointments') rebuildFd.set('appointmentId', jobId);
  else rebuildFd.set('fallbackBookingId', jobId);
  const receiptResult = await generateWorkOrderReceiptActionState(null, rebuildFd);
  if (!receiptResult.ok) {
    return { ok: false, error: `Line saved but receipt rebuild failed: ${receiptResult.error ?? 'unknown'}` };
  }

  const ledger = await resolveOrderLedger(admin, {
    workOrderId: jobId,
    appointmentId: table === 'appointments' ? jobId : undefined,
    fallbackBookingId: table === 'booking_fallbacks' ? jobId : undefined,
  });
  if (!ledger) {
    return {
      ok: false,
      error: 'Line saved but order ledger failed — receipt cannot be verified. Fix ledger before sending to customer.',
    };
  }
  const receiptLines = ledgerReceiptLines(ledger, { includeAdmin: true });
  const receiptLineLabels = receiptLines.map((l) => l.label);
  const onReceipt = receiptLineLabels.some((l) => l === label || l.includes(label));
  if (!onReceipt) {
    return {
      ok: false,
      error: `Receipt breakdown missing saved line "${label}". Labels: ${receiptLineLabels.join(' | ')}`,
      data: { savedLabel: label, lineItemCount: savedItems.length, receiptLineLabels, finalTotalCents: pricing.finalTotalCents },
    };
  }

  revalidatePath(`/tech/work-orders/${jobId}`);
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/receipts');
  revalidatePath('/tech');

  return {
    ok: true,
    data: {
      savedLabel: label,
      lineItemCount: savedItems.length,
      receiptLineLabels,
      finalTotalCents: pricing.finalTotalCents,
    },
  };
}

export async function removeWorkOrderLineItemAction(formData: FormData): Promise<LineItemActionResult> {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) {
    return { ok: false, error: 'Unauthorized' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Service role missing.' };

  const appointmentId = str(formData.get('appointmentId'));
  const fallbackBookingId = str(formData.get('fallbackBookingId'));
  const source = str(formData.get('source'));
  const lineId = str(formData.get('lineId'));
  const reason = str(formData.get('reason')) || 'Removed by admin';
  if (!lineId) return { ok: false, error: 'Missing line id' };

  const table = source === 'fallback' || fallbackBookingId ? 'booking_fallbacks' : 'appointments';
  const jobId = fallbackBookingId || appointmentId;
  if (!jobId) return { ok: false, error: 'Missing work order id' };

  const { data: jobRow } = await admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (!jobRow) return { ok: false, error: 'Work order not found' };

  const job = jobRow as Row;
  const items = readCustomLineItems(job).filter((i) => i.id !== lineId);
  if (items.length === readCustomLineItems(job).length) {
    return { ok: false, error: 'Line not found on work order.' };
  }

  const jobWithLines = { ...job, booking_pricing_breakdown: mergePricingBreakdownWithLineItems(job, items) };
  const payments = await fetchPaymentsForJob(admin, jobWithLines, {
    appointmentId: table === 'appointments' ? jobId : undefined,
    fallbackBookingId: table === 'booking_fallbacks' ? jobId : undefined,
    isFallback: table === 'booking_fallbacks',
  });
  const pricing = resolveJobPricing(jobWithLines, payments);
  const breakdown = mergePricingBreakdownWithLineItems(job, items, {
    finalTotalCents: pricing.finalTotalCents,
    vehicleSubtotalCents: pricing.vehicleSubtotalCents,
    customLineItemsCents: pricing.customLineItemsCents,
    lineRemovedAt: new Date().toISOString(),
    lineRemovedReason: reason,
  });

  const { error: updateErr } = await admin
    .from(table)
    .update({
      booking_pricing_breakdown: breakdown,
      base_price_cents: pricing.finalTotalCents,
      balance_due_cents: pricing.remainingBalanceCents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);
  if (updateErr) return { ok: false, error: updateErr.message };

  const rebuildFd = new FormData();
  if (table === 'appointments') rebuildFd.set('appointmentId', jobId);
  else rebuildFd.set('fallbackBookingId', jobId);
  const receiptResult = await import('@/app/(dashboard)/tech/work-order-payment-actions').then((m) =>
    m.generateWorkOrderReceiptActionState(null, rebuildFd),
  );
  if (!receiptResult.ok) {
    return { ok: false, error: `Line removed but receipt rebuild failed: ${receiptResult.error ?? 'unknown'}` };
  }

  revalidatePath(`/tech/work-orders/${jobId}`);
  revalidatePath('/admin/receipts');
  return { ok: true, data: { savedLabel: lineId, lineItemCount: items.length, receiptLineLabels: [], finalTotalCents: pricing.finalTotalCents } };
}
