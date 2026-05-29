import type { WorkOrderLineItem } from '@/lib/work-order-line-items';

/** Custom lines that duplicate engine discounts or record payments — must not adjust service final. */
export function isPricingDuplicateOrPaymentLine(item: WorkOrderLineItem): boolean {
  const label = (item.label || '').toLowerCase();
  if (/deposit|customer deposit/i.test(label)) return true;
  if (item.kind === 'discount_adjustment' || item.amountCents < 0) {
    if (/website|online|booking discount|sitewide/i.test(label)) return true;
    if (/multi[\s-]?car/i.test(label)) return true;
    if (/manual discount/i.test(label) && item.amountCents < 0) {
      // Admin "Manual discount" lines often duplicate website % — exclude when label is generic
      return true;
    }
  }
  return false;
}

export function customLineAdjustmentCents(items: WorkOrderLineItem[]): number {
  return items.filter((i) => !isPricingDuplicateOrPaymentLine(i)).reduce((s, i) => s + i.amountCents, 0);
}

export function manualOnlyDiscountCents(items: WorkOrderLineItem[]): number {
  return items
    .filter((i) => !isPricingDuplicateOrPaymentLine(i) && (i.kind === 'discount_adjustment' || i.amountCents < 0))
    .reduce((s, i) => s + Math.abs(i.amountCents), 0);
}
