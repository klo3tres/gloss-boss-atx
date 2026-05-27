/**
 * Single customer receipt view model built only from OrderLedger.
 */
import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';
import type { ReceiptDocumentProps } from '@/components/documents/receipt-document';
import { displayMoney } from '@/lib/display-format';
import { buildReceiptEmailHtml, type ReceiptEmailLine } from '@/lib/email/templates/receipt';
import type { ReceiptPdfInput } from '@/lib/receipt-pdf';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';
import type { OrderLedger } from '@/lib/order-ledger';

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

  if (ledger.discounts.length > 0) {
    lines.push({ label: 'Discounts & Offers', amount: '', tone: 'charge' });
    for (const d of ledger.discounts) {
      if (d.amountCents > 0) {
        lines.push({
          label: d.label,
          amount: `−${displayMoney(d.amountCents)}`,
          tone: 'discount',
        });
      }
    }
  }

  lines.push({ label: 'Final total', amount: displayMoney(ledger.totals.finalTotalCents), tone: 'total' });

  const succeeded = ledger.payments.filter((p) => !p.voided && ['succeeded', 'paid', 'comped'].some((s) => p.status.toLowerCase().includes(s)));
  if (succeeded.length > 0) {
    lines.push({ label: 'Payments', amount: '', tone: 'charge' });
    const shown = new Set<string>();
    for (const p of succeeded) {
      if (shown.has(p.id)) continue;
      shown.add(p.id);
      lines.push({ label: p.label, amount: displayMoney(p.amountCents), tone: 'paid' });
    }
  } else if (ledger.totals.depositPaidCents > 0 && ledger.totals.stripePaidCents > 0) {
    lines.push({ label: 'Stripe deposit paid', amount: displayMoney(ledger.totals.depositPaidCents), tone: 'paid' });
  }

  if (ledger.totals.totalPaidCents > 0 && !succeeded.length) {
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

  const documentProps: ReceiptDocumentProps = {
    receiptNumber,
    paidAt: ledger.schedule.completedAt
      ? new Date(ledger.schedule.completedAt).toLocaleString()
      : ledger.schedule.appointmentAtDisplay,
    serviceAt: ledger.schedule.appointmentAtDisplay,
    completedAt: ledger.schedule.completedAt ? new Date(ledger.schedule.completedAt).toLocaleString() : '',
    serviceDuration: '',
    technicianName: opts?.technicianName ?? '',
    method: ledger.payments[0]?.method ?? '—',
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
    onlineDiscount:
      ledger.totals.totalDiscountCents > 0 ? `−${displayMoney(ledger.discounts.find((d) => d.kind === 'online')?.amountCents ?? 0)}` : '$0.00',
    multiCarDiscount: '$0.00',
    promoLabel: ledger.audit.promoCode ? `Promo (${ledger.audit.promoCode})` : 'Promo',
    promoDiscount: '$0.00',
    depositPaid: displayMoney(ledger.totals.depositPaidCents),
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
    discounts: '',
    taxAmount: '',
    finalTotal: documentProps.finalTotal,
    depositPaid: documentProps.depositPaid,
    fullPaid: documentProps.fullPaid,
    cashPaid: documentProps.cashPaid,
    stripePaid: documentProps.stripePaid,
    zellePaid: ledger.totals.zellePaidCents > 0 ? displayMoney(ledger.totals.zellePaidCents) : undefined,
    manualPaid: ledger.totals.manualPaidCents > 0 ? displayMoney(ledger.totals.manualPaidCents) : undefined,
    remainingBalance: documentProps.remainingBalance,
  };

  return { receiptNumber, documentProps, customerLines, emailHtml, pdfInput };
}
