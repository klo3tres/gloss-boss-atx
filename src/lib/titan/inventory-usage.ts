import type { SupabaseClient } from '@supabase/supabase-js';
import { loadInventoryItems, type InventoryItem } from '@/lib/titan/inventory';

export type SupplyLine = {
  inventoryItemId: string;
  slug: string;
  label: string;
  quantity: number;
  unit: string;
};

const SERVICE_SUPPLY_MAP: Record<string, Array<{ slug: string; qty: number }>> = {
  'exterior-wash': [
    { slug: 'chemicals-all-purpose', qty: 0.15 },
    { slug: 'towels-microfiber', qty: 4 },
    { slug: 'gloves-nitrile', qty: 0.1 },
  ],
  'exterior-detail': [
    { slug: 'chemicals-all-purpose', qty: 0.25 },
    { slug: 'chemicals-wheel', qty: 0.2 },
    { slug: 'towels-microfiber', qty: 8 },
    { slug: 'brushes-detail', qty: 0.25 },
    { slug: 'gloves-nitrile', qty: 0.15 },
  ],
  'interior-detail': [
    { slug: 'chemicals-all-purpose', qty: 0.2 },
    { slug: 'towels-microfiber', qty: 10 },
    { slug: 'brushes-detail', qty: 0.25 },
    { slug: 'gloves-nitrile', qty: 0.15 },
  ],
  'full-detail': [
    { slug: 'chemicals-all-purpose', qty: 0.35 },
    { slug: 'chemicals-wheel', qty: 0.25 },
    { slug: 'towels-microfiber', qty: 14 },
    { slug: 'brushes-detail', qty: 0.5 },
    { slug: 'pads-polish', qty: 2 },
    { slug: 'gloves-nitrile', qty: 0.2 },
  ],
  'ceramic-coating': [
    { slug: 'chemicals-all-purpose', qty: 0.5 },
    { slug: 'towels-microfiber', qty: 20 },
    { slug: 'pads-polish', qty: 4 },
    { slug: 'gloves-nitrile', qty: 0.3 },
  ],
};

const DEFAULT_SUPPLIES = [
  { slug: 'chemicals-all-purpose', qty: 0.25 },
  { slug: 'towels-microfiber', qty: 8 },
  { slug: 'gloves-nitrile', qty: 0.15 },
];

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export function suggestSuppliesForAppointment(row: Record<string, unknown>, items: InventoryItem[]): SupplyLine[] {
  const slug = str(row.service_slug) || 'full-detail';
  const map = SERVICE_SUPPLY_MAP[slug] ?? DEFAULT_SUPPLIES;
  const bySlug = new Map(items.map((i) => [i.slug, i]));
  const lines: SupplyLine[] = [];

  for (const entry of map) {
    const item = bySlug.get(entry.slug);
    if (!item) continue;
    lines.push({
      inventoryItemId: item.id,
      slug: item.slug,
      label: item.label,
      quantity: entry.qty,
      unit: item.unit,
    });
  }
  return lines;
}

export async function loadSuggestedSupplies(
  admin: SupabaseClient,
  appointmentId: string,
): Promise<{ lines: SupplyLine[]; tablesReady: boolean }> {
  const inv = await loadInventoryItems(admin);
  if (!inv.tablesReady) return { lines: [], tablesReady: false };

  const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
  if (!appt) return { lines: [], tablesReady: true };

  return { lines: suggestSuppliesForAppointment(appt as Record<string, unknown>, inv.items), tablesReady: true };
}

export async function applyInventoryUsage(
  admin: SupabaseClient,
  input: {
    appointmentId: string;
    lines: Array<{ inventoryItemId: string; quantity: number; notes?: string }>;
    skipReason?: string;
  },
): Promise<{ ok: boolean; error?: string; lowStock?: string[] }> {
  if (input.skipReason) {
    await admin.from('titan_inventory_usage').insert({
      appointment_id: input.appointmentId,
      quantity_used: 0,
      notes: `Skipped: ${input.skipReason}`,
    });
    return { ok: true };
  }

  const lowStock: string[] = [];
  const now = new Date().toISOString();

  for (const line of input.lines) {
    if (!line.inventoryItemId || line.quantity <= 0) continue;

    const { data: item } = await admin
      .from('titan_inventory_items')
      .select('id, label, quantity_on_hand, reorder_threshold')
      .eq('id', line.inventoryItemId)
      .maybeSingle();

    if (!item) continue;
    const r = item as { id: string; label: string; quantity_on_hand: number; reorder_threshold: number };
    const newQty = Math.max(0, Number(r.quantity_on_hand) - line.quantity);

    await admin
      .from('titan_inventory_items')
      .update({ quantity_on_hand: newQty, updated_at: now })
      .eq('id', r.id);

    await admin.from('titan_inventory_usage').insert({
      inventory_item_id: r.id,
      appointment_id: input.appointmentId,
      quantity_used: line.quantity,
      notes: line.notes ?? null,
    });

    if (r.reorder_threshold > 0 && newQty <= r.reorder_threshold) {
      lowStock.push(r.label);
      await admin.from('notification_outbox').insert({
        kind: 'inventory_low_stock',
        channel: 'internal',
        status: 'pending',
        payload: {
          item_id: r.id,
          label: r.label,
          quantity_on_hand: newQty,
          reorder_threshold: r.reorder_threshold,
        },
        created_at: now,
      });
      const { emitOwnerNotification } = await import('@/lib/titan/owner-notification-router');
      void emitOwnerNotification(admin, {
        eventType: 'low_inventory',
        title: `Low stock: ${r.label}`,
        body: `${r.label} is at ${newQty} (reorder at ${r.reorder_threshold}). Restock before jobs stall.`,
        source: 'inventory',
        relatedType: 'inventory_item',
        relatedId: r.id,
        relatedUrl: '/admin/titan/inventory',
      });
    }
  }

  return { ok: true, lowStock };
}

export function estimateJobsRemaining(item: InventoryItem, avgUsePerJob: number): number | null {
  if (avgUsePerJob <= 0 || item.quantity_on_hand <= 0) return 0;
  return Math.floor(item.quantity_on_hand / avgUsePerJob);
}
