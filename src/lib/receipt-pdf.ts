import { jsPDF } from 'jspdf';

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
  discounts: string;
  taxAmount: string;
  finalTotal: string;
  depositPaid: string;
  fullPaid: string;
  cashPaid?: string;
  remainingBalance: string;
};

export function buildReceiptPdfBytes(input: ReceiptPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  let y = margin;

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 612, 72, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(10);
  doc.text(input.brandName.toUpperCase(), margin, 32);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text('INVOICE', margin, 52);
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
    doc.text(input.serviceAddress, margin, y);
    y += 18;
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

  doc.setFontSize(9);
  doc.text('Vehicle / Service', margin, y);
  doc.text('Amount', 480, y);
  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(margin, y, 564, y);
  y += 14;

  for (const v of input.vehicles) {
    if (y > 700) {
      doc.addPage();
      y = margin;
    }
    doc.text(`${v.name} — ${v.service} (${v.color})`, margin, y);
    doc.text(v.price, 480, y);
    y += 16;
  }

  y += 12;
  doc.line(margin, y, 564, y);
  y += 18;
  doc.text(`Subtotal: ${input.baseTotal}`, 400, y);
  y += 14;
  if (input.discounts && input.discounts !== '$0.00') {
    doc.text(`Discounts: ${input.discounts}`, 400, y);
    y += 14;
  }
  if (input.taxAmount) {
    doc.text(`Tax: ${input.taxAmount}`, 400, y);
    y += 14;
  }
  doc.setFontSize(12);
  doc.text(`Total: ${input.finalTotal}`, 400, y);
  y += 16;
  doc.setFontSize(9);
  const payLine = [
    `Deposit: ${input.depositPaid}`,
    input.cashPaid && input.cashPaid !== '$0.00' ? `Cash: ${input.cashPaid}` : null,
    `Paid: ${input.fullPaid}`,
    `Balance: ${input.remainingBalance}`,
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(payLine, margin, y);

  return new Uint8Array(doc.output('arraybuffer'));
}
