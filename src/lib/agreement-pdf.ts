import { jsPDF } from 'jspdf';

export type AgreementPdfInput = {
  title: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceAddress: string;
  vehicles: Array<{ label: string; service: string; color: string }>;
  legalBody: string;
  signerLegalName: string;
  smsConsent: string;
  witnessName: string;
  signedAt: string;
  legacyTermsWarning?: boolean;
};

function wrapText(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * lineHeight;
}

export function buildAgreementPdfBytes(input: AgreementPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const margin = 48;
  const maxW = 516;
  let y = margin;

  doc.setFillColor(10, 10, 10);
  doc.rect(0, 0, 612, 64, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFontSize(11);
  doc.text('GLOSS BOSS ATX', margin, 28);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(input.title.slice(0, 80), margin, 48);

  y = 88;
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  y = wrapText(doc, `Customer: ${input.customerName}`, margin, y, maxW, 14);
  y = wrapText(doc, `Email: ${input.customerEmail} · Phone: ${input.customerPhone}`, margin, y, maxW, 14);
  y = wrapText(doc, `Service address: ${input.serviceAddress}`, margin, y, maxW, 14);
  y += 8;

  doc.setFont('helvetica', 'bold');
  doc.text('Vehicles & services', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 14;
  for (const v of input.vehicles) {
    y = wrapText(doc, `• ${v.label} · ${v.color} · ${v.service}`, margin, y, maxW, 14);
    if (y > 700) {
      doc.addPage();
      y = margin;
    }
  }

  y += 10;
  if (input.legacyTermsWarning) {
    doc.setTextColor(180, 83, 9);
    y = wrapText(
      doc,
      'Legacy agreement snapshot lacked terms; current legal text shown below.',
      margin,
      y,
      maxW,
      14,
    );
    doc.setTextColor(30, 30, 30);
    y += 6;
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Legal terms', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 14;
  const bodyLines = input.legalBody.split('\n');
  for (const line of bodyLines) {
    if (y > 720) {
      doc.addPage();
      y = margin;
    }
    y = wrapText(doc, line || ' ', margin, y, maxW, 12);
  }

  if (y > 640) {
    doc.addPage();
    y = margin;
  }
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.text('Signature', margin, y);
  doc.setFont('helvetica', 'normal');
  y += 14;
  y = wrapText(doc, input.signerLegalName, margin, y, maxW, 14);
  y = wrapText(doc, `SMS consent: ${input.smsConsent}`, margin, y, maxW, 14);
  y = wrapText(doc, `Technician / witness: ${input.witnessName}`, margin, y, maxW, 14);
  y = wrapText(doc, `Signed (America/Chicago): ${input.signedAt}`, margin, y, maxW, 14);

  return new Uint8Array(doc.output('arraybuffer'));
}
