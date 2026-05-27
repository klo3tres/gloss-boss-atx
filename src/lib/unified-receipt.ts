import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReceiptDocumentProps } from '@/components/documents/receipt-document';
import { str } from '@/lib/display-format';
import { resolveOrderLedger } from '@/lib/order-ledger';
import { buildReceiptFromLedger, ledgerReceiptLines } from '@/lib/receipt-from-ledger';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import type { ReceiptPdfInput } from '@/lib/receipt-pdf';
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
  const appointmentId = str(params.appointmentId);
  const fallbackBookingId = str(params.fallbackBookingId);
  const isFallback = Boolean(fallbackBookingId && !appointmentId);
  const workOrderId = appointmentId || fallbackBookingId || str(params.job.id);

  const ledger = await resolveOrderLedger(admin, {
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
    workOrderId,
  });
  if (!ledger) {
    throw new Error('Could not resolve order ledger for receipt.');
  }

  const appBase = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ?? 'https://glossbossatx.com';
  const receiptPdfHref = `${appBase}/api/receipts/${encodeURIComponent(workOrderId)}/pdf?source=${isFallback ? 'fallback' : 'appointment'}`;
  const receiptAdminHref = params.receiptId
    ? `${appBase}/admin/receipts/${encodeURIComponent(params.receiptId)}`
    : `${appBase}/admin/receipts/${encodeURIComponent(workOrderId)}`;

  const built = buildReceiptFromLedger(ledger, {
    receiptNumber: params.receiptNumber,
    receiptAdminHref,
    technicianName: params.techName,
  });

  const fullBreakdown = ledgerReceiptLines(ledger, { includeAdmin: true });
  const customerBreakdown = filterReceiptBreakdownForCustomer(fullBreakdown);

  return {
    receiptNumber: built.receiptNumber,
    receiptPdfHref,
    receiptAdminHref,
    documentProps: built.documentProps,
    breakdownLines: fullBreakdown,
    customerBreakdownLines: customerBreakdown,
    emailHtml: built.emailHtml,
    pdfInput: built.pdfInput,
  };
}
