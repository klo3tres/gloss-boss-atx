import { displayMoney } from '@/lib/display-format';
import type { JobPricingDisplay } from '@/lib/job-pricing-display';
import { readCustomLineItems } from '@/lib/work-order-line-items';
import type { Row } from '@/lib/work-order-resolve';

export type ReceiptBreakdownLine = { label: string; amount: string; tone?: 'discount' | 'charge' | 'total' | 'paid' };

/** Single breakdown for receipt page, PDF, and email — matches work order pricing engine. */
export function buildReceiptBreakdown(job: Row, pricing: JobPricingDisplay): ReceiptBreakdownLine[] {
  const lines: ReceiptBreakdownLine[] = [];
  const b = job.booking_pricing_breakdown as Record<string, unknown> | undefined;
  const vehicleSub =
    typeof b?.vehicleSubtotalCents === 'number'
      ? (b.vehicleSubtotalCents as number)
      : pricing.vehicleLines.reduce((s, v) => s + v.priceCents, 0);
  const addOnSub = typeof b?.addOnSubtotalCents === 'number' ? (b.addOnSubtotalCents as number) : 0;

  if (vehicleSub > 0) {
    lines.push({ label: 'Base services subtotal', amount: displayMoney(vehicleSub) });
  }
  if (addOnSub > 0) {
    lines.push({ label: 'Add-ons subtotal', amount: displayMoney(addOnSub) });
  }
  if (pricing.multiCarDiscountCents > 0) {
    lines.push({
      label: 'Multi-car discount',
      amount: `−${displayMoney(pricing.multiCarDiscountCents)}`,
      tone: 'discount',
    });
  }
  if (pricing.onlineDiscountCents > 0) {
    lines.push({
      label: 'Online booking discount',
      amount: `−${displayMoney(pricing.onlineDiscountCents)}`,
      tone: 'discount',
    });
  }
  if (pricing.promoDiscountCents > 0) {
    lines.push({
      label: 'Promo discount',
      amount: `−${displayMoney(pricing.promoDiscountCents)}`,
      tone: 'discount',
    });
  }

  const customItems = readCustomLineItems(job);
  let manualDiscountCents = 0;
  if (manualDiscountCents <= 0) {
    for (const item of customItems) {
      if (item.kind === 'discount_adjustment' || item.amountCents < 0) {
        manualDiscountCents += Math.abs(item.amountCents);
      }
    }
  }
  for (const item of customItems) {
    if (item.kind === 'discount_adjustment' || item.amountCents < 0) {
      continue;
    }
    if (item.customerVisible === false) continue;
    lines.push({
      label: item.label,
      amount: displayMoney(item.amountCents),
      tone: 'charge',
    });
  }
  if (manualDiscountCents > 0) {
    lines.push({
      label: 'Manual discount',
      amount: `−${displayMoney(manualDiscountCents)}`,
      tone: 'discount',
    });
  }

  lines.push({ label: 'Final total', amount: displayMoney(pricing.finalTotalCents), tone: 'total' });
  if (pricing.depositPaidCents > 0) {
    lines.push({ label: 'Deposit paid', amount: displayMoney(pricing.depositPaidCents), tone: 'paid' });
  }
  if (pricing.stripePaidCents > 0) {
    lines.push({ label: 'Stripe paid', amount: displayMoney(pricing.stripePaidCents), tone: 'paid' });
  }
  if (pricing.cashPaidCents > 0) {
    lines.push({ label: 'Cash paid', amount: displayMoney(pricing.cashPaidCents), tone: 'paid' });
  }
  lines.push({
    label: 'Balance due',
    amount: displayMoney(pricing.remainingBalanceCents),
    tone: pricing.remainingBalanceCents > 0 ? 'charge' : 'paid',
  });

  return lines;
}
