import type { WorkOrderLineItemKind } from '@/lib/work-order-line-items';
import type { UiVehicleClass } from '@/lib/vehicle-pricing';

/** Suggested manual invoice line amounts by vehicle class (cents). */
export const INVOICE_LINE_SUGGESTIONS: Record<
  WorkOrderLineItemKind,
  { title: string; sedan?: number; suv?: number; truck?: number; flat?: number; startingAt?: boolean }
> = {
  heavy_condition_fee: { title: 'Heavy condition fee', flat: 5000, startingAt: true },
  upholstery_extraction: { title: 'Upholstery shampoo + stain extraction', sedan: 9500, suv: 12500, truck: 15000 },
  stain_removal: { title: 'Stain removal', flat: 7500, startingAt: true },
  pet_hair_surcharge: { title: 'Pet hair removal', flat: 5000, startingAt: true },
  engine_bay: { title: 'Engine bay detail', flat: 5000, startingAt: true },
  clay_bar: { title: 'Clay bar treatment', sedan: 4000, suv: 5500, truck: 7000 },
  custom_addon: { title: 'Custom add-on', flat: 0 },
  manual_invoice_item: { title: 'Manual charge', flat: 0 },
  discount_adjustment: { title: 'Manual discount', flat: 0 },
};

export function suggestInvoiceLine(
  kind: WorkOrderLineItemKind,
  vehicleClass: UiVehicleClass = 'sedan',
): { title: string; amountCents: number; startingAt?: boolean } {
  const row = INVOICE_LINE_SUGGESTIONS[kind] ?? INVOICE_LINE_SUGGESTIONS.custom_addon;
  const title = row.title;
  let amountCents = row.flat ?? 0;
  if (vehicleClass === 'suv' && typeof row.suv === 'number') amountCents = row.suv;
  else if (vehicleClass === 'truck' && typeof row.truck === 'number') amountCents = row.truck;
  else if (typeof row.sedan === 'number') amountCents = row.sedan;
  return { title, amountCents, startingAt: row.startingAt };
}
