import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';

export const RECEIPT_LOGO_URL = 'https://glossbossatx.com/branding/gloss-boss-atx-logo.png';
import {
  emailCard,
  emailCtaButton,
  emailMoneyTable,
  emailParagraph,
  escapeEmailHtml,
  glossBossEmailLayout,
} from '@/lib/email/templates/layout';

import type { ReceiptBreakdownLine } from '@/lib/receipt-breakdown';

export type ReceiptEmailLine = {
  vehicles: Array<{ name: string; service: string; color?: string; price?: string }>;
  breakdown?: ReceiptBreakdownLine[];
  subtotal?: string;
  addOnSubtotal?: string;
  onlineDiscount?: string;
  multiCarDiscount?: string;
  promo?: string;
  manualDiscount?: string;
  depositPaid?: string;
  stripePaid?: string;
  cashPaid?: string;
  remainingBalance?: string;
  totalPaid?: string;
  finalTotal?: string;
  paymentMethod?: string;
  receiptUrl?: string;
};

export function buildReceiptEmailHtml(input: {
  customerName: string;
  receiptNumber: string;
  serviceAddress: string;
  serviceAt: string;
  line: ReceiptEmailLine;
}): string {
  const v = input.line;
  const useBreakdownOnly = v.breakdown && v.breakdown.length > 0;
  const vehicleRows = useBreakdownOnly
    ? ''
    : v.vehicles
        .map(
          (car) => `
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #27272a;">
          <p style="margin:0;font-size:15px;font-weight:700;color:#fafafa;">${escapeEmailHtml(car.name)}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#a1a1aa;">${escapeEmailHtml(car.service)}${car.color ? ` · ${escapeEmailHtml(car.color)}` : ''}${car.price ? ` · ${escapeEmailHtml(car.price)}` : ''}</p>
        </td>
      </tr>`,
        )
        .join('');

  const cardInner = `
    <div style="text-align:center;margin-bottom:20px;">
      <img src="${RECEIPT_LOGO_URL}" alt="${escapeEmailHtml(GLOSS_BOSS_BRAND_NAME)}" width="180" style="max-width:180px;height:auto;display:inline-block;" />
      <p style="margin:12px 0 0;font-size:18px;font-weight:800;color:#fafafa;">Gloss Boss ATX</p>
      <p style="margin:4px 0 0;font-size:12px;color:#d4af37;letter-spacing:0.15em;text-transform:uppercase;">Premium Auto Care</p>
    </div>
    <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#d4af37;">Receipt</p>
    <p style="margin:8px 0 0;font-size:22px;font-weight:800;color:#fafafa;">${escapeEmailHtml(input.receiptNumber)}</p>
    <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;"><strong style="color:#e4e4e7;">Customer:</strong> ${escapeEmailHtml(input.customerName)}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;"><strong style="color:#e4e4e7;">Service:</strong> ${escapeEmailHtml(input.serviceAt)}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;"><strong style="color:#e4e4e7;">Address:</strong> ${escapeEmailHtml(input.serviceAddress)}</p>
    ${vehicleRows ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">${vehicleRows}</table>` : ''}
    ${
      v.finalTotal || v.totalPaid || v.remainingBalance
        ? `<div style="margin:16px 0;padding:14px 16px;border-radius:12px;border:1px solid rgba(212,175,55,0.35);background:rgba(212,175,55,0.08);">
      <p style="margin:0 0 8px;font-size:11px;font-weight:800;letter-spacing:0.18em;text-transform:uppercase;color:#d4af37;">Payment summary</p>
      ${emailMoneyTable([
        { label: 'Final total', value: v.finalTotal ?? '—' },
        { label: 'Total paid', value: v.totalPaid ?? '—' },
        { label: 'Balance due', value: v.remainingBalance ?? '—' },
      ])}
    </div>`
        : ''
    }
    ${
      v.breakdown && v.breakdown.length > 0
        ? emailMoneyTable(
            v.breakdown.map((line) => ({
              label: line.label,
              value: line.amount,
            })),
          )
        : emailMoneyTable([
            { label: 'Base services subtotal', value: v.subtotal },
            { label: 'Add-ons subtotal', value: v.addOnSubtotal },
            { label: 'Online booking discount', value: v.onlineDiscount },
            { label: 'Multi-car discount', value: v.multiCarDiscount },
            { label: 'Promo discount', value: v.promo },
            { label: 'Manual discount', value: v.manualDiscount },
            { label: 'Deposit paid', value: v.depositPaid },
            { label: 'Stripe paid', value: v.stripePaid },
            { label: 'Cash paid', value: v.cashPaid },
            { label: 'Total paid', value: v.totalPaid },
            { label: 'Final total', value: v.finalTotal },
            { label: 'Balance due', value: v.remainingBalance },
            { label: 'Payment method', value: v.paymentMethod },
          ])
    }
    ${v.receiptUrl ? emailCtaButton(v.receiptUrl, 'View receipt') : ''}`;

  const bodyHtml =
    emailParagraph(`Hi ${escapeEmailHtml(input.customerName)}, thank you for choosing ${escapeEmailHtml(GLOSS_BOSS_BRAND_NAME)}.`, true) +
    emailParagraph('Your payment receipt is below.', true) +
    emailCard(cardInner);

  return glossBossEmailLayout({
    title: `Receipt ${input.receiptNumber}`,
    preview: `Receipt ${input.receiptNumber} from Gloss Boss ATX`,
    headline: 'Payment receipt',
    bodyHtml,
  });
}
