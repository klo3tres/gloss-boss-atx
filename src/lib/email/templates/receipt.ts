import { GLOSS_BOSS_BRAND_NAME } from '@/lib/branding';
import {
  emailCard,
  emailCtaButton,
  emailMoneyTable,
  emailParagraph,
  escapeEmailHtml,
  glossBossEmailLayout,
} from '@/lib/email/templates/layout';

export type ReceiptEmailLine = {
  vehicles: Array<{ name: string; service: string; color?: string; price?: string }>;
  subtotal?: string;
  onlineDiscount?: string;
  multiCarDiscount?: string;
  promo?: string;
  depositPaid?: string;
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
  const vehicleRows = v.vehicles
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
    <p style="margin:0;font-size:11px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#d4af37;">Receipt</p>
    <p style="margin:8px 0 0;font-size:22px;font-weight:800;color:#fafafa;">${escapeEmailHtml(input.receiptNumber)}</p>
    <p style="margin:12px 0 0;font-size:13px;color:#a1a1aa;"><strong style="color:#e4e4e7;">Customer:</strong> ${escapeEmailHtml(input.customerName)}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;"><strong style="color:#e4e4e7;">Service:</strong> ${escapeEmailHtml(input.serviceAt)}</p>
    <p style="margin:6px 0 0;font-size:13px;color:#a1a1aa;"><strong style="color:#e4e4e7;">Address:</strong> ${escapeEmailHtml(input.serviceAddress)}</p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;">${vehicleRows}</table>
    ${emailMoneyTable([
      { label: 'Subtotal', value: v.subtotal },
      { label: 'Online discount', value: v.onlineDiscount },
      { label: 'Multi-car discount', value: v.multiCarDiscount },
      { label: 'Promo', value: v.promo },
      { label: 'Deposit paid', value: v.depositPaid },
      { label: 'Cash paid', value: v.cashPaid },
      { label: 'Total paid', value: v.totalPaid },
      { label: 'Job total', value: v.finalTotal },
      { label: 'Remaining balance', value: v.remainingBalance },
      { label: 'Payment method', value: v.paymentMethod },
    ])}
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
