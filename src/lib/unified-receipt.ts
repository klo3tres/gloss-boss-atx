import type { SupabaseClient } from '@supabase/supabase-js';
import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';
import type { ReceiptDocumentProps } from '@/components/documents/receipt-document';
import { displayChicago, displayLabel, displayMoney, displayPhone, displayText, str } from '@/lib/display-format';
import { resolveJobPricing } from '@/lib/job-pricing-display';
import { loadOrderSnapshot } from '@/lib/order-snapshot-engine';
import { buildReceiptBreakdown, type ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import { buildReceiptEmailHtml, type ReceiptEmailLine } from '@/lib/email/templates/receipt';
import type { ReceiptPdfInput } from '@/lib/receipt-pdf';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { customLineItemsAsReceiptRows } from '@/lib/work-order-line-items';
import type { Row } from '@/lib/work-order-resolve';

const ADMIN_ONLY_LABELS =
  /payments recorded|applied to this invoice|overpayment|void test|customer$/i;

/** Customer-facing receipt lines — no admin/debug rows, no duplicate vehicle table in PDF/email. */
export function filterReceiptBreakdownForCustomer(lines: ReceiptBreakdownLine[]): ReceiptBreakdownLine[] {
  return lines.filter((line) => {
    if (line.label === 'Customer') return false;
    if (ADMIN_ONLY_LABELS.test(line.label)) return false;
    return true;
  });
}

export type UnifiedReceiptView = {
  receiptNumber: string;
  receiptPdfHref: string;
  receiptAdminHref: string;
  documentProps: ReceiptDocumentProps;
  breakdownLines: ReceiptBreakdownLine[];
  customerBreakdownLines: ReceiptBreakdownLine[];
  emailHtml: string;
  pdfInput: ReceiptPdfInput;
};

function address(job: Row) {
  return [job.service_address, job.service_city, job.service_state, job.service_zip].map(str).filter(Boolean).join(', ');
}

export async function buildUnifiedReceiptView(
  admin: SupabaseClient,
  params: {
    job: Row;
    appointmentId?: string;
    fallbackBookingId?: string;
    receiptNumber?: string;
    techName?: string;
    receiptId?: string;
  },
): Promise<UnifiedReceiptView> {
  const job = params.job;
  const appointmentId = str(params.appointmentId);
  const fallbackBookingId = str(params.fallbackBookingId);
  const isFallback = Boolean(fallbackBookingId && !appointmentId);
  const workOrderId = appointmentId || fallbackBookingId || str(job.id);

  const payments = await fetchPaymentsForJob(admin, job, {
    appointmentId: isFallback ? undefined : workOrderId,
    fallbackBookingId: isFallback ? workOrderId : undefined,
    isFallback,
  });

  const snapshot = await loadOrderSnapshot(admin, {
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
    workOrderId,
  });

  const pricing = snapshot?.pricing ?? resolveJobPricing(job, payments);
  const fullBreakdown = snapshot?.receiptLines ?? buildReceiptBreakdown(job, pricing);
  const customerBreakdown = filterReceiptBreakdownForCustomer(fullBreakdown);

  const receiptNumber =
    params.receiptNumber ||
    `WO-${workOrderId.slice(0, 8).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://glossbossatx.com';
  const receiptPdfHref = `${appBase}/api/receipts/${encodeURIComponent(workOrderId)}/pdf?source=${isFallback ? 'fallback' : 'appointment'}`;
  const receiptAdminHref = params.receiptId
    ? `${appBase}/admin/receipts/${encodeURIComponent(params.receiptId)}`
    : `${appBase}/admin/receipts/${encodeURIComponent(workOrderId)}`;

  const vehicleRows = snapshot?.vehicles.length
    ? snapshot.vehicles.flatMap((v) => {
        const rows = [
          {
            name: v.description,
            service: displayLabel(v.serviceSlug),
            color: v.color || '—',
            price: displayMoney(v.priceCents),
          },
        ];
        for (const a of v.addOns) {
          rows.push({
            name: `  ↳ ${a.label}`,
            service: 'Add-on',
            color: '—',
            price: displayMoney(a.priceCents),
          });
        }
        return rows;
      })
    : [
        ...pricing.vehicleLines.map((v) => ({
          name: v.name,
          service: displayLabel(v.service),
          color: v.color || '—',
          price: displayMoney(v.priceCents),
        })),
        ...customLineItemsAsReceiptRows(job),
      ];

  const lastPay = payments[0];
  const documentProps: ReceiptDocumentProps = {
    receiptNumber,
    paidAt: displayChicago(lastPay?.paid_at || lastPay?.created_at || job.updated_at),
    serviceAt: displayChicago(job.scheduled_start),
    completedAt: displayChicago(job.job_completed_at || job.completed_at),
    serviceDuration: '',
    technicianName: params.techName ?? '',
    method: displayLabel(lastPay?.payment_method || lastPay?.payment_kind || job.payment_choice),
    status: displayLabel(job.payment_status || lastPay?.status),
    customerName: displayText(job.guest_name, 'Customer'),
    customerEmail: str(job.guest_email),
    customerPhone: displayPhone(job.guest_phone),
    serviceAddress: address(job),
    vehicles: [],
    breakdownLines: customerBreakdown,
    baseTotal: displayMoney(pricing.vehicleSubtotalCents),
    addOnSubtotal: pricing.addOnSubtotalCents > 0 ? displayMoney(pricing.addOnSubtotalCents) : undefined,
    onlineDiscount: pricing.onlineDiscountCents > 0 ? `−${displayMoney(pricing.onlineDiscountCents)}` : '$0.00',
    multiCarDiscount: pricing.multiCarDiscountCents > 0 ? `−${displayMoney(pricing.multiCarDiscountCents)}` : '$0.00',
    promoLabel: pricing.promoCode ? `Promo (${pricing.promoCode})` : 'Promo discount',
    promoDiscount: pricing.promoDiscountCents > 0 ? `−${displayMoney(pricing.promoDiscountCents)}` : '$0.00',
    manualDiscount: pricing.manualDiscountCents > 0 ? `−${displayMoney(pricing.manualDiscountCents)}` : undefined,
    depositPaid: pricing.depositPaidCents > 0 ? displayMoney(pricing.depositPaidCents) : '$0.00',
    cashPaid: pricing.cashPaidCents > 0 ? displayMoney(pricing.cashPaidCents) : '$0.00',
    stripePaid: pricing.stripePaidCents > 0 ? displayMoney(pricing.stripePaidCents) : undefined,
    fullPaid: displayMoney(pricing.totalPaidCents),
    remainingBalance: displayMoney(pricing.remainingBalanceCents),
    finalTotal: displayMoney(pricing.finalTotalCents),
    stripeSession: str(job.stripe_checkout_session_id),
    stripePaymentIntent: str(job.stripe_payment_intent_id),
    paymentRowId: str(lastPay?.id),
  };

  const emailLine: ReceiptEmailLine = {
    vehicles: vehicleRows.length
      ? vehicleRows
      : [{ name: str(job.vehicle_description) || 'Service', service: displayLabel(job.service_slug) }],
    breakdown: customerBreakdown,
    receiptUrl: receiptAdminHref,
  };

  const emailHtml = buildReceiptEmailHtml({
    customerName: documentProps.customerName,
    receiptNumber,
    serviceAddress: documentProps.serviceAddress,
    serviceAt: documentProps.serviceAt ?? documentProps.paidAt,
    line: emailLine,
  });

  const pdfInput: ReceiptPdfInput = {
    receiptNumber,
    brandName: GLOSS_BOSS_BRAND_NAME,
    customerName: documentProps.customerName,
    customerEmail: documentProps.customerEmail,
    customerPhone: documentProps.customerPhone,
    serviceAddress: documentProps.serviceAddress,
    paidAt: documentProps.paidAt,
    serviceAt: documentProps.serviceAt ?? '',
    completedAt: documentProps.completedAt ?? '',
    jobStartedAt: displayChicago(job.job_started_at),
    jobCompletedAt: documentProps.completedAt ?? '',
    technicianName: documentProps.technicianName ?? '',
    method: documentProps.method,
    status: documentProps.status,
    vehicles: [],
    breakdownLines: customerBreakdown,
    baseTotal: documentProps.baseTotal,
    addOnSubtotal: documentProps.addOnSubtotal,
    discounts: '',
    taxAmount: '',
    finalTotal: documentProps.finalTotal,
    depositPaid: documentProps.depositPaid,
    fullPaid: documentProps.fullPaid,
    cashPaid: documentProps.cashPaid,
    stripePaid: documentProps.stripePaid,
    zellePaid: pricing.zellePaidCents > 0 ? displayMoney(pricing.zellePaidCents) : undefined,
    manualPaid: pricing.manualPaidCents > 0 ? displayMoney(pricing.manualPaidCents) : undefined,
    remainingBalance: documentProps.remainingBalance,
  };

  return {
    receiptNumber,
    receiptPdfHref,
    receiptAdminHref,
    documentProps,
    breakdownLines: fullBreakdown,
    customerBreakdownLines: customerBreakdown,
    emailHtml,
    pdfInput,
  };
}
