/**

 * Receipt total parity — ledger, unified view, PDF, and email must match.

 */

import type { ReceiptDocumentProps } from '@/components/documents/receipt-document';

import type { OrderLedger } from '@/lib/order-ledger';

import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';

import type { ReceiptPdfInput } from '@/lib/receipt-pdf';

import type { UnifiedReceiptView } from '@/lib/unified-receipt';



export type ReceiptTotalsSummary = {

  grossSubtotalCents: number;

  totalDiscountCents: number;

  finalTotalCents: number;

  totalPaidCents: number;

  balanceDueCents: number;

};



function parseMoneyCents(raw: string | undefined): number | null {

  if (!raw) return null;

  const cleaned = raw.replace(/[^0-9.-]/g, '');

  if (!cleaned) return null;

  const n = Number(cleaned);

  if (!Number.isFinite(n)) return null;

  const negative = raw.includes('−') || raw.includes('-') || n < 0;

  return Math.round(Math.abs(n) * 100) * (negative ? -1 : 1);

}



function discountCentsFromDisplay(raw: string | undefined): number {

  if (!raw || raw === '$0.00' || raw === '—') return 0;

  const c = parseMoneyCents(raw);

  if (c == null) return 0;

  return Math.abs(c);

}



export function totalsFromLedger(ledger: OrderLedger): ReceiptTotalsSummary {

  return {

    grossSubtotalCents: ledger.totals.grossSubtotalCents,

    totalDiscountCents: ledger.totals.totalDiscountCents,

    finalTotalCents: ledger.totals.finalTotalCents,

    totalPaidCents: ledger.totals.totalPaidCents,

    balanceDueCents: ledger.totals.balanceDueCents,

  };

}



/** Email parity uses ledger totals — not breakdown line label parsing. */

export function totalsFromEmailView(ledger: OrderLedger): ReceiptTotalsSummary {

  return totalsFromLedger(ledger);

}



export function totalsFromBreakdownLines(lines: ReceiptBreakdownLine[]): ReceiptTotalsSummary {

  let finalTotalCents = 0;

  let balanceDueCents = 0;

  let totalPaidCents = 0;

  for (const line of lines) {

    const cents = parseMoneyCents(line.amount);

    if (cents == null) continue;

    if (line.label === 'Final total') finalTotalCents = cents;

    else if (line.label === 'Balance due') balanceDueCents = cents;

    else if (line.label === 'Total paid') totalPaidCents = cents;

  }

  return {

    grossSubtotalCents: 0,

    totalDiscountCents: 0,

    finalTotalCents,

    totalPaidCents,

    balanceDueCents,

  };

}



export function totalsFromDocumentProps(props: ReceiptDocumentProps): ReceiptTotalsSummary {

  const fromLines = props.breakdownLines?.length ? totalsFromBreakdownLines(props.breakdownLines) : null;

  const totalDiscountCents =

    discountCentsFromDisplay(props.onlineDiscount) +

    discountCentsFromDisplay(props.multiCarDiscount) +

    discountCentsFromDisplay(props.promoDiscount) +

    discountCentsFromDisplay(props.manualDiscount);



  return {

    grossSubtotalCents: parseMoneyCents(props.baseTotal) ?? 0,

    totalDiscountCents: totalDiscountCents > 0 ? totalDiscountCents : 0,

    finalTotalCents: parseMoneyCents(props.finalTotal) ?? fromLines?.finalTotalCents ?? 0,

    totalPaidCents: parseMoneyCents(props.fullPaid) ?? fromLines?.totalPaidCents ?? 0,

    balanceDueCents: parseMoneyCents(props.remainingBalance) ?? fromLines?.balanceDueCents ?? 0,

  };

}



export function totalsFromPdfInput(input: ReceiptPdfInput): ReceiptTotalsSummary {

  const fromLines = input.breakdownLines?.length ? totalsFromBreakdownLines(input.breakdownLines) : null;

  const totalDiscountCents =

    discountCentsFromDisplay(input.discounts) > 0

      ? discountCentsFromDisplay(input.discounts)

      : 0;



  return {

    grossSubtotalCents: parseMoneyCents(input.baseTotal) ?? 0,

    totalDiscountCents,

    finalTotalCents: parseMoneyCents(input.finalTotal) ?? fromLines?.finalTotalCents ?? 0,

    totalPaidCents: parseMoneyCents(input.fullPaid) ?? fromLines?.totalPaidCents ?? 0,

    balanceDueCents: parseMoneyCents(input.remainingBalance) ?? fromLines?.balanceDueCents ?? 0,

  };

}



export type ReceiptParityDebug = {

  ledger: ReceiptTotalsSummary;

  receiptView: ReceiptTotalsSummary;

  pdf: ReceiptTotalsSummary;

  email: ReceiptTotalsSummary;

  allMatch: boolean;

  mismatches: string[];

};



function centsEqual(a: number, b: number) {

  return Math.abs(a - b) <= 0;

}



const PARITY_FIELDS: Array<{ key: keyof ReceiptTotalsSummary; label: string }> = [

  { key: 'grossSubtotalCents', label: 'subtotal' },

  { key: 'totalDiscountCents', label: 'discounts' },

  { key: 'finalTotalCents', label: 'final total' },

  { key: 'totalPaidCents', label: 'paid' },

  { key: 'balanceDueCents', label: 'balance due' },

];



export function buildReceiptParityDebug(ledger: OrderLedger, view: UnifiedReceiptView): ReceiptParityDebug {

  const ledgerTotals = totalsFromLedger(ledger);

  const receiptView = totalsFromDocumentProps(view.documentProps);

  const pdf = totalsFromPdfInput(view.pdfInput);

  const email = totalsFromEmailView(ledger);



  const mismatches: string[] = [];

  const checkSurface = (surface: string, surfaceTotals: ReceiptTotalsSummary) => {

    for (const { key, label } of PARITY_FIELDS) {

      const a = ledgerTotals[key];

      const b = surfaceTotals[key];

      if (!centsEqual(a, b)) {

        mismatches.push(`${label} (${surface}): ledger ${a} ≠ ${b}`);

      }

    }

  };



  checkSurface('receipt view', receiptView);

  checkSurface('PDF', pdf);

  checkSurface('email', email);



  return {

    ledger: ledgerTotals,

    receiptView,

    pdf,

    email,

    allMatch: mismatches.length === 0,

    mismatches,

  };

}



export function formatTotalsRow(t: ReceiptTotalsSummary) {

  const fmt = (c: number) => `$${(c / 100).toFixed(2)}`;

  return {

    grossSubtotal: fmt(t.grossSubtotalCents),

    totalDiscounts: fmt(t.totalDiscountCents),

    finalTotal: fmt(t.finalTotalCents),

    totalPaid: fmt(t.totalPaidCents),

    balanceDue: fmt(t.balanceDueCents),

  };

}


