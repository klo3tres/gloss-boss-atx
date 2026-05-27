'use server';

import { revalidatePath } from 'next/cache';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import {
  LINE_ITEM_KIND_LABELS,
  mergePricingBreakdownWithLineItems,
  readCustomLineItems,
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

export type LineItemActionResult = { ok: boolean; error?: string };

export async function addWorkOrderLineItemAction(formData: FormData): Promise<LineItemActionResult> {
  const session = await getSessionWithProfile();
  const supabaseAuth = await createSupabaseServerClient();
  if (!session.user || !supabaseAuth) return { ok: false, error: 'Unauthorized' };

  const admin = tryCreateAdminSupabase();
  if (!admin) return { ok: false, error: 'Database unavailable' };

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

  await syncJobBalanceDue(admin, job, pricing, {
    appointmentId: table === 'appointments' ? jobId : undefined,
    fallbackBookingId: table === 'booking_fallbacks' ? jobId : undefined,
    isFallback: table === 'booking_fallbacks',
  });

  const { generateWorkOrderReceiptActionState } = await import('@/app/(dashboard)/tech/work-order-payment-actions');
  const rebuildFd = new FormData();
  if (table === 'appointments') rebuildFd.set('appointmentId', jobId);
  else rebuildFd.set('fallbackBookingId', jobId);
  await generateWorkOrderReceiptActionState(null, rebuildFd);

  revalidatePath(`/tech/work-orders/${jobId}`);
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/receipts');
  revalidatePath('/tech');
  return { ok: true };
}
