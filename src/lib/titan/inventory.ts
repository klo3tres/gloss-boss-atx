import type { SupabaseClient } from '@supabase/supabase-js';

export type InventoryItem = {
  id: string;
  slug: string;
  label: string;
  category: string;
  unit: string;
  quantity_on_hand: number;
  reorder_threshold: number;
  reorder_quantity: number;
  cost_per_unit_cents: number;
  notes: string | null;
  active: boolean;
  sort_order: number;
};

export type InventoryLoadResult = {
  items: InventoryItem[];
  tablesReady: boolean;
  lowStock: InventoryItem[];
};

export async function loadInventoryItems(admin: SupabaseClient): Promise<InventoryLoadResult> {
  const { data, error } = await admin
    .from('titan_inventory_items')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) {
    return { items: [], tablesReady: false, lowStock: [] };
  }

  const items = (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      id: String(r.id),
      slug: String(r.slug ?? ''),
      label: String(r.label ?? ''),
      category: String(r.category ?? 'supplies'),
      unit: String(r.unit ?? 'each'),
      quantity_on_hand: Number(r.quantity_on_hand ?? 0),
      reorder_threshold: Number(r.reorder_threshold ?? 0),
      reorder_quantity: Number(r.reorder_quantity ?? 0),
      cost_per_unit_cents: Number(r.cost_per_unit_cents ?? 0),
      notes: r.notes == null ? null : String(r.notes),
      active: Boolean(r.active),
      sort_order: Number(r.sort_order ?? 100),
    };
  });

  const lowStock = items.filter((i) => i.active && i.reorder_threshold > 0 && i.quantity_on_hand <= i.reorder_threshold);

  return { items, tablesReady: true, lowStock };
}
