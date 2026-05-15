/** Shared add-on row normalization — supports `label` or `name` (schema drift). */

export function addonDisplayLabel(row: Record<string, unknown>): string {
  const label = row.label != null ? String(row.label).trim() : '';
  const name = row.name != null ? String(row.name).trim() : '';
  const slug = row.slug != null ? String(row.slug).trim() : '';
  return label || name || slug || 'Add-on';
}

export function addonMatchKey(row: Record<string, unknown>): string {
  const slug = row.slug != null ? String(row.slug).trim().toLowerCase() : '';
  if (slug) return slug;
  return addonDisplayLabel(row).toLowerCase();
}

/** Map DB row to stable public shape for booking / field tools. */
export function normalizeAddonForPublic(row: Record<string, unknown>): {
  id: string;
  slug: string;
  label: string;
  price_cents: number;
  sort_order: number;
} {
  const id = row.id != null ? String(row.id) : '';
  const rawSlug = row.slug != null ? String(row.slug).trim() : '';
  const label = addonDisplayLabel(row);
  const slug =
    rawSlug ||
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  const price_cents = typeof row.price_cents === 'number' && !Number.isNaN(row.price_cents) ? Math.max(0, row.price_cents) : 0;
  const sort_order = typeof row.sort_order === 'number' && !Number.isNaN(row.sort_order) ? row.sort_order : 0;
  return { id, slug, label, price_cents, sort_order };
}
