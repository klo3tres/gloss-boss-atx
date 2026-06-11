/**
 * Single customer receipt view model built only from OrderLedger.
 */
import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';
import type { ReceiptDocumentProps } from '@/components/documents/receipt-document';
import { displayMoney } from '@/lib/display-format';
import { buildReceiptEmailHtml, type ReceiptEmailLine } from '@/lib/email/templates/receipt';
import type { ReceiptPdfInput } from '@/lib/receipt-pdf';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import type { LedgerDiscount, OrderLedger } from '@/lib/order-ledger';
import { readCustomLineItems } from '@/lib/work-order-line-items';

const ADMIN_LINE =
  /payments recorded|applied to this invoice|overpayment|void test|^customer$/i;

export function ledgerReceiptLines(ledger: OrderLedger, opts?: { includeAdmin?: boolean }): ReceiptBreakdownLine[] {
  const lines: ReceiptBreakdownLine[] = [];

  for (const v of ledger.vehicles) {
    const svc = v.serviceTitle || v.serviceSlug;
    lines.push({
      label: `${v.description} — ${svc}`,
      amount: displayMoney(v.bookedPriceCents),
      tone: 'charge',
    });
    for (const a of v.addOns) {
      if (a.priceCents > 0) {
        lines.push({ label: `  Add-on: ${a.label}`, amount: displayMoney(a.priceCents), tone: 'charge' });
      }
    }
  }

  if (ledger.totals.grossSubtotalCents > 0) {
    lines.push({
      label: 'Services subtotal',
      amount: displayMoney(ledger.totals.grossSubtotalCents),
      tone: 'charge',
    });
  }

  const pricedDiscounts = ledger.discounts.filter((d) => d.amountCents > 0);
  if (pricedDiscounts.length > 0) {
    for (const d of pricedDiscounts) {
      lines.push({
        label: d.label,
        amount: `−${displayMoney(d.amountCents)}`,
        tone: 'discount',
      });
    }
  }

  lines.push({ label: 'Final total', amount: displayMoney(ledger.totals.finalTotalCents), tone: 'total' });

  const paySource = ledger.customerPayments.length > 0 ? ledger.customerPayments : ledger.payments;
  const succeeded = paySource.filter(
    (p) => !p.voided && ['succeeded', 'paid', 'comped'].some((s) => p.status.toLowerCase().includes(s)),
  );

  const paymentLines: ReceiptBreakdownLine[] = [];
  const shown = new Set<string>();
  for (const p of succeeded) {
    if (shown.has(p.id)) continue;
    shown.add(p.id);
    paymentLines.push({ label: p.label, amount: displayMoney(p.amountCents), tone: 'paid' });
  }

  if (paymentLines.length > 0) {
    lines.push({ label: 'Payments', amount: '', tone: 'charge' });
    lines.push(...paymentLines);
  }

  if (ledger.totals.totalPaidCents > 0) {
    lines.push({ label: 'Total paid', amount: displayMoney(ledger.totals.totalPaidCents), tone: 'paid' });
  }

  lines.push({
    label: 'Balance due',
    amount: displayMoney(ledger.totals.balanceDueCents),
    tone: ledger.totals.balanceDueCents > 0 ? 'charge' : 'paid',
  });

  if (opts?.includeAdmin) return lines;
  return lines.filter((l) => !ADMIN_LINE.test(l.label));
}

export type ReceiptFromLedger = {
  receiptNumber: string;
  documentProps: ReceiptDocumentProps;
  customerLines: ReceiptBreakdownLine[];
  emailHtml: string;
  pdfInput: ReceiptPdfInput;
};

export function buildReceiptFromLedger(
  ledger: OrderLedger,
  opts?: { receiptNumber?: string; receiptAdminHref?: string; technicianName?: string },
): ReceiptFromLedger {
  const receiptNumber =
    opts?.receiptNumber ??
    `WO-${ledger.refs.workOrderId.slice(0, 8).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

  const customerLines = ledgerReceiptLines(ledger, { includeAdmin: false });

  const disc = (kind: LedgerDiscount['kind']) => ledger.discounts.find((d) => d.kind === kind)?.amountCents ?? 0;

  const primaryPay = ledger.customerPayments.find((p) => !p.voided && p.amountCents > 0) ?? ledger.payments.find((p) => !p.voided);
  const methodLabel = primaryPay?.method?.replace(/_/g, ' ') || primaryPay?.paymentKind?.replace(/_/g, ' ') || '—';

  const documentProps: ReceiptDocumentProps = {
    receiptNumber,
    paidAt: ledger.schedule.completedAt
      ? new Date(ledger.schedule.completedAt).toLocaleString()
      : ledger.schedule.appointmentAtDisplay,
    serviceAt: ledger.schedule.appointmentAtDisplay,
    completedAt: ledger.schedule.completedAt ? new Date(ledger.schedule.completedAt).toLocaleString() : '',
    serviceDuration: '',
    technicianName: opts?.technicianName ?? '',
    method: methodLabel,
    status: ledger.schedule.paymentStatus,
    customerName: ledger.customer.name,
    customerEmail: ledger.customer.email,
    customerPhone: ledger.customer.phone,
    serviceAddress: ledger.customer.address,
    vehicles: [],
    breakdownLines: customerLines,
    baseTotal: displayMoney(ledger.totals.serviceSubtotalCents),
    addOnSubtotal:
      ledger.totals.addOnSubtotalCents > 0 ? displayMoney(ledger.totals.addOnSubtotalCents) : undefined,
    onlineDiscount: disc('online') > 0 ? `−${displayMoney(disc('online'))}` : '$0.00',
    multiCarDiscount: disc('multi_car') > 0 ? `−${displayMoney(disc('multi_car'))}` : '$0.00',
    promoLabel: ledger.audit.promoCode ? `Promo (${ledger.audit.promoCode})` : 'Promo discount',
    promoDiscount: disc('promo') > 0 ? `−${displayMoney(disc('promo'))}` : '$0.00',
    manualDiscount: disc('manual') > 0 ? `−${displayMoney(disc('manual'))}` : undefined,
    depositPaid: ledger.totals.depositPaidCents > 0 ? displayMoney(ledger.totals.depositPaidCents) : '$0.00',
    cashPaid: displayMoney(ledger.totals.cashPaidCents),
    stripePaid: ledger.totals.stripePaidCents > 0 ? displayMoney(ledger.totals.stripePaidCents) : undefined,
    fullPaid: displayMoney(ledger.totals.totalPaidCents),
    remainingBalance: displayMoney(ledger.totals.balanceDueCents),
    finalTotal: displayMoney(ledger.totals.finalTotalCents),
    stripeSession: ledger.audit.stripeCheckoutSessionId,
    stripePaymentIntent: ledger.audit.stripePaymentIntentId,
    paymentRowId: ledger.payments[0]?.id ?? '',
  };

  const emailLine: ReceiptEmailLine = {
    vehicles: ledger.vehicles.map((v) => ({
      name: v.description,
      service: v.serviceTitle,
      color: v.color,
      price: displayMoney(v.bookedPriceCents),
    })),
    breakdown: customerLines,
    subtotal: displayMoney(ledger.totals.grossSubtotalCents),
    onlineDiscount: disc('online') > 0 ? `−${displayMoney(disc('online'))}` : undefined,
    multiCarDiscount: disc('multi_car') > 0 ? `−${displayMoney(disc('multi_car'))}` : undefined,
    promo: disc('promo') > 0 ? `−${displayMoney(disc('promo'))}` : undefined,
    manualDiscount: disc('manual') > 0 ? `−${displayMoney(disc('manual'))}` : undefined,
    totalPaid: displayMoney(ledger.totals.totalPaidCents),
    finalTotal: displayMoney(ledger.totals.finalTotalCents),
    remainingBalance: displayMoney(ledger.totals.balanceDueCents),
    paymentMethod: documentProps.method,
    receiptUrl: opts?.receiptAdminHref,
  };

  const emailHtml = buildReceiptEmailHtml({
    customerName: ledger.customer.name,
    receiptNumber,
    serviceAddress: ledger.customer.address,
    serviceAt: ledger.schedule.appointmentAtDisplay,
    line: emailLine,
  });

  const pdfInput: ReceiptPdfInput = {
    receiptNumber,
    brandName: GLOSS_BOSS_BRAND_NAME,
    customerName: ledger.customer.name,
    customerEmail: ledger.customer.email,
    customerPhone: ledger.customer.phone,
    serviceAddress: ledger.customer.address,
    paidAt: documentProps.paidAt,
    serviceAt: ledger.schedule.appointmentAtDisplay,
    completedAt: documentProps.completedAt ?? '',
    jobStartedAt: '',
    jobCompletedAt: documentProps.completedAt ?? '',
    technicianName: documentProps.technicianName ?? '',
    method: documentProps.method,
    status: documentProps.status,
    vehicles: [],
    breakdownLines: customerLines,
    baseTotal: documentProps.baseTotal,
    addOnSubtotal: documentProps.addOnSubtotal,
    discounts: ledger.totals.totalDiscountCents > 0 ? `−${displayMoney(ledger.totals.totalDiscountCents)}` : '$0.00',
    taxAmount: '',
    finalTotal: documentProps.finalTotal,
    depositPaid: documentProps.depositPaid,
    fullPaid: documentProps.fullPaid,
    cashPaid: documentProps.cashPaid,
    stripePaid: documentProps.stripePaid,
    zellePaid: ledger.totals.zellePaidCents > 0 ? displayMoney(ledger.totals.zellePaidCents) : undefined,
    manualPaid: ledger.totals.manualPaidCents > 0 ? displayMoney(ledger.totals.manualPaidCents) : undefined,
    creditPaid: ledger.totals.creditPaidCents > 0 ? displayMoney(ledger.totals.creditPaidCents) : undefined,
    remainingBalance: documentProps.remainingBalance,
  };

  return { receiptNumber, documentProps, customerLines, emailHtml, pdfInput };
}
