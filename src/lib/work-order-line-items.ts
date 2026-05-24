import { displayMoney } from '@/lib/display-format';

import type { Row } from '@/lib/work-order-resolve';



export type WorkOrderLineItemKind =

  | 'heavy_condition_fee'

  | 'upholstery_extraction'

  | 'stain_removal'

  | 'pet_hair_surcharge'

  | 'custom_addon'

  | 'discount_adjustment'

  | 'manual_invoice_item';



export type WorkOrderLineItem = {

  id: string;

  kind: WorkOrderLineItemKind | string;

  label: string;

  amountCents: number;

  quantity?: number;

  taxable?: boolean;

  customerVisible?: boolean;

  notes?: string;

  createdAt?: string;

  createdBy?: string;

};



export const LINE_ITEM_KIND_LABELS: Record<WorkOrderLineItemKind, string> = {

  heavy_condition_fee: 'Heavy condition fee',

  upholstery_extraction: 'Upholstery extraction',

  stain_removal: 'Stain removal',

  pet_hair_surcharge: 'Pet hair surcharge',

  custom_addon: 'Custom add-on',

  discount_adjustment: 'Manual discount',

  manual_invoice_item: 'Manual invoice item',

};



function obj(v: unknown): Record<string, unknown> {

  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

}



function str(v: unknown) {

  return v == null ? '' : String(v).trim();

}



export function readCustomLineItems(job: Row): WorkOrderLineItem[] {

  const b = obj(job.booking_pricing_breakdown);

  const raw = b.customLineItems ?? b.custom_line_items;

  if (!Array.isArray(raw)) return [];

  const out: WorkOrderLineItem[] = [];

  for (const item of raw) {

    if (!item || typeof item !== 'object') continue;

    const o = item as Record<string, unknown>;

    const amountCents =

      typeof o.amountCents === 'number'

        ? o.amountCents

        : typeof o.amount_cents === 'number'

          ? o.amount_cents

          : Number(o.amountCents ?? o.amount_cents);

    if (!Number.isFinite(amountCents) || amountCents === 0) continue;

    const kind = str(o.kind) || 'custom_addon';

    const label = str(o.label) || LINE_ITEM_KIND_LABELS[kind as WorkOrderLineItemKind] || kind;

    out.push({

      id: str(o.id) || `line-${out.length + 1}`,

      kind,

      label,

      amountCents: Math.round(amountCents),

      quantity:
        typeof o.quantity === 'number' && o.quantity > 0
          ? Math.round(o.quantity)
          : undefined,

      taxable: o.taxable === true || o.taxable === 'true',

      customerVisible: o.customerVisible !== false && o.customer_visible !== false,

      notes: str(o.notes) || undefined,

      createdAt: str(o.createdAt || o.created_at) || undefined,

      createdBy: str(o.createdBy || o.created_by) || undefined,

    });

  }

  return out;
}



export function customLineItemsTotalCents(items: WorkOrderLineItem[]): number {

  return items.reduce((s, i) => s + i.amountCents, 0);

}



export function customLineItemsAsReceiptRows(

  job: Row,

): Array<{ name: string; service: string; color: string; price: string }> {

  return readCustomLineItems(job)
    .filter((i) => i.customerVisible !== false)
    .map((item) => ({

    name: item.label,

    service: LINE_ITEM_KIND_LABELS[item.kind as WorkOrderLineItemKind] || String(item.kind).replace(/_/g, ' '),

    color: item.notes ? item.notes.slice(0, 40) : '—',

    price: displayMoney(item.amountCents),

  }));

}



export function mergePricingBreakdownWithLineItems(

  job: Row,

  items: WorkOrderLineItem[],

  extra?: Record<string, unknown>,

): Record<string, unknown> {

  const existing = obj(job.booking_pricing_breakdown);

  const customTotal = customLineItemsTotalCents(items);

  return {

    ...existing,

    ...extra,

    customLineItems: items,

    customLineItemsCents: customTotal,

  };

}


