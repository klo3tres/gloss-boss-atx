import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveJobPricing, type JobPricingDisplay } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { readCustomLineItems } from '@/lib/work-order-line-items';
import type { Row } from '@/lib/work-order-resolve';

export type WorkOrderPricingSnapshot = {
  jobId: string;
  table: string;
  finalTotalCents: number;
  vehicleSubtotalCents: number;
  onlineDiscountCents: number;
  multiCarDiscountCents: number;
  promoDiscountCents: number;
  manualDiscountCents: number;
  customLineItemsCents: number;
  depositPaidCents: number;
  totalPaidCents: number;
  remainingBalanceCents: number;
  customLineItemCount: number;
  customLineItemLabels: string[];
  breakdownKeys: string[];
};

export function pricingToSnapshot(
  jobId: string,
  table: string,
  job: Row,
  pricing: JobPricingDisplay,
): WorkOrderPricingSnapshot {
  const items = readCustomLineItems(job);
  const b = job.booking_pricing_breakdown;
  return {
    jobId,
    table,
    finalTotalCents: pricing.finalTotalCents,
    vehicleSubtotalCents: pricing.vehicleSubtotalCents,
    onlineDiscountCents: pricing.onlineDiscountCents,
    multiCarDiscountCents: pricing.multiCarDiscountCents,
    promoDiscountCents: pricing.promoDiscountCents,
    manualDiscountCents: pricing.manualDiscountCents,
    customLineItemsCents: pricing.customLineItemsCents,
    depositPaidCents: pricing.depositPaidCents,
    totalPaidCents: pricing.totalPaidCents,
    remainingBalanceCents: pricing.remainingBalanceCents,
    customLineItemCount: items.length,
    customLineItemLabels: items.map((i) => `${i.label}: ${i.amountCents}`),
    breakdownKeys: b && typeof b === 'object' ? Object.keys(b as object) : [],
  };
}

export async function reloadWorkOrderPricingSnapshot(
  admin: SupabaseClient,
  table: string,
  jobId: string,
  isFallback: boolean,
): Promise<{ job: Row; pricing: JobPricingDisplay; snapshot: WorkOrderPricingSnapshot } | null> {
  const { data, error } = await admin.from(table).select('*').eq('id', jobId).maybeSingle();
  if (error || !data) return null;
  const job = data as Row;
  const payments = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : jobId,
    fallbackBookingId: isFallback ? jobId : undefined,
    isFallback,
  });
  const pricing = resolveJobPricing(job, payments);
  return { job, pricing, snapshot: pricingToSnapshot(jobId, table, job, pricing) };
}
