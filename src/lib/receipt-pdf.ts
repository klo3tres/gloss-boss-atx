import { jsPDF } from 'jspdf';
import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';

export type ReceiptPdfInput = {
  receiptNumber: string;
  brandName: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceAddress: string;
  paidAt: string;
  serviceAt: string;
  completedAt: string;
  jobStartedAt: string;
  jobCompletedAt: string;
  technicianName: string;
  method: string;
  status: string;
  vehicles: Array<{ name: string; service: string; color: string; price: string }>;
  baseTotal: string;
  addOnSubtotal?: string;
  breakdownLines?: ReceiptBreakdownLine[];
  discounts: string;
  taxAmount: string;
  finalTotal: string;
  depositPaid: string;
  fullPaid: string;
  cashPaid?: string;
  stripePaid?: string;
  zellePaid?: string;
  manualPaid?: string;
  creditPaid?: string;
  remainingBalance: string;
};

const LABEL_X = 48;
const AMOUNT_X = 520;
const LABEL_MAX_W = 360;

function drawWrappedLabel(doc: jsPDF, text: string, x: number, y: number, maxWidth: number) {
  const lines = doc.splitTextToSize(text, maxWidth) as string[];
  doc.text(lines, x, y);
  return lines.length * 12;
}

export function buildReceiptPdfBytes(input: ReceiptPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  let y = margin;

  const isPaid =
    !input.remainingBalance ||
    input.remainingBalance.trim() === '$0.00' ||
    input.remainingBalance.trim() === '$0' ||
    input.remainingBalance.trim() === '—' ||
    input.remainingBalance.trim() === '' ||
    input.status?.toLowerCase() === 'paid';
  const headerText = isPaid ? 'RECEIPT' : 'INVOICE';

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 612, 72, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(10);
  doc.text(input.brandName.toUpperCase(), margin, 32);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(headerText, margin, 52);
  doc.setFontSize(11);
  doc.text(input.receiptNumber, 420, 52);

  y = 96;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.text(`Bill to: ${input.customerName}`, margin, y);
  y += 14;
  if (input.customerEmail) {
    doc.text(input.customerEmail, margin, y);
    y += 14;
  }
  if (input.customerPhone) {
    doc.text(input.customerPhone, margin, y);
    y += 14;
  }
  if (input.serviceAddress) {
    const addrLines = doc.splitTextToSize(input.serviceAddress, 480) as string[];
    doc.text(addrLines, margin, y);
    y += addrLines.length * 14;
  }

  doc.text(`Paid: ${input.paidAt}`, margin, y);
  y += 14;
  if (input.serviceAt) {
    doc.text(`Service: ${input.serviceAt}`, margin, y);
    y += 14;
  }
  if (input.jobStartedAt) {
    doc.text(`Started: ${input.jobStartedAt}`, margin, y);
    y += 14;
  }
  if (input.jobCompletedAt) {
    doc.text(`Completed: ${input.jobCompletedAt}`, margin, y);
    y += 14;
  }
  if (input.technicianName) {
    doc.text(`Technician: ${input.technicianName}`, margin, y);
    y += 14;
  }
  doc.text(`Method: ${input.method} · ${input.status}`, margin, y);
  y += 24;

  const moneyLines: ReceiptBreakdownLine[] =
    input.breakdownLines && input.breakdownLines.length > 0
      ? input.breakdownLines
      : [
          ...input.vehicles.map((v) => ({
            label: `${v.name} — ${v.service}`,
            amount: v.price,
            tone: 'charge' as const,
          })),
          { label: 'Base services subtotal', amount: input.baseTotal },
          ...(input.addOnSubtotal && input.addOnSubtotal !== '$0.00'
            ? [{ label: 'Add-ons subtotal', amount: input.addOnSubtotal }]
            : []),
          ...(input.discounts && input.discounts !== '$0.00'
            ? [{ label: 'Discounts', amount: input.discounts, tone: 'discount' as const }]
            : []),
          { label: 'Final total', amount: input.finalTotal, tone: 'total' as const },
          { label: 'Deposit paid', amount: input.depositPaid, tone: 'paid' as const },
          ...(input.stripePaid && input.stripePaid !== '$0.00'
            ? [{ label: 'Stripe paid', amount: input.stripePaid, tone: 'paid' as const }]
            : []),
          ...(input.creditPaid && input.creditPaid !== '$0.00'
            ? [{ label: 'Credit applied', amount: input.creditPaid, tone: 'paid' as const }]
            : []),
          ...(input.cashPaid && input.cashPaid !== '$0.00'
            ? [{ label: 'Cash paid', amount: input.cashPaid, tone: 'paid' as const }]
            : []),
          { label: 'Total paid', amount: input.fullPaid, tone: 'paid' as const },
          { label: 'Balance due', amount: input.remainingBalance },
        ];

  doc.setFontSize(9);
  doc.text('Description', LABEL_X, y);
  doc.text('Amount', AMOUNT_X, y, { align: 'right' });
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 564, y);
  y += 16;

  for (const line of moneyLines) {
    if (y > 700) {
      doc.addPage();
      y = margin;
    }
    const isTotal = line.tone === 'total';
    const isBalanceDue = line.label?.toLowerCase() === 'balance due' || line.label?.toLowerCase() === 'remaining balance';
    const isGoldAccented = isTotal || isBalanceDue;

    if (isGoldAccented) {
      doc.setTextColor(180, 145, 35); // Luxury gold accent for print readability
      doc.setFontSize(isTotal ? 12 : 10);
    } else {
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(9);
    }

    const labelHeight = drawWrappedLabel(doc, line.label, LABEL_X, y, LABEL_MAX_W);
    doc.text(line.amount, AMOUNT_X, y, { align: 'right' });
    y += Math.max(labelHeight, isTotal ? 20 : 16);
    doc.setFontSize(9);
  }

  if (input.taxAmount && input.taxAmount !== '$0.00') {
    y += 8;
    doc.text(`Tax: ${input.taxAmount}`, LABEL_X, y);
    y += 14;
  }

  return new Uint8Array(doc.output('arraybuffer'));
}
