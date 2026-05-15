/** Serializable promotion row for admin CMS / pricing surfaces (server → client props). */

export type PromotionAdminRow = {
  id: string;
  title: string;
  description: string;
  slug: string;
  discountKind: 'percent' | 'fixed';
  percentOff: number;
  discountFixedCents: number | null;
  active: boolean;
  archived: boolean;
  stackable: boolean;
  sortOrder: number;
  showOnHomepage: boolean;
  showOnServices: boolean;
  showOnBooking: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

function numOr0(v: unknown): number {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

/** Parse a Supabase `offers` row into admin editor state. */
export function parsePromotionAdminRow(r: Record<string, unknown>): PromotionAdminRow {
  const id = typeof r.id === 'string' ? r.id : '';
  const title =
    (typeof r.title === 'string' && r.title.trim()) || (typeof r.label === 'string' && r.label.trim()) || 'Offer';
  const description = typeof r.description === 'string' ? r.description : '';
  const slug = typeof r.slug === 'string' ? r.slug.trim() : '';
  const fixedRaw = r.discount_fixed_cents;
  const discountFixedCents =
    typeof fixedRaw === 'number' && !Number.isNaN(fixedRaw) && fixedRaw > 0 ? Math.round(fixedRaw) : null;
  const pct = numOr0(
    typeof r.discount_percent === 'number' ? r.discount_percent : Number(r.percent_off ?? 0),
  );
  const discountKind: 'percent' | 'fixed' = discountFixedCents != null ? 'fixed' : 'percent';
  const percentOff = discountKind === 'percent' ? Math.min(100, Math.max(0, pct)) : 0;

  return {
    id,
    title,
    description,
    slug,
    discountKind,
    percentOff,
    discountFixedCents,
    active: Boolean(r.active),
    archived: Boolean(r.archived),
    stackable: typeof r.stackable === 'boolean' ? r.stackable : true,
    sortOrder: Number(r.sort_order ?? 0),
    showOnHomepage: typeof r.show_on_homepage === 'boolean' ? r.show_on_homepage : true,
    showOnServices: typeof r.show_on_services === 'boolean' ? r.show_on_services : true,
    showOnBooking: typeof r.show_on_booking === 'boolean' ? r.show_on_booking : true,
    startsAt: typeof r.starts_at === 'string' ? r.starts_at : null,
    endsAt: typeof r.ends_at === 'string' ? r.ends_at : null,
  };
}
