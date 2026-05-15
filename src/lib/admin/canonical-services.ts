/** Order for admin + booking display */
export const SERVICE_SLUG_ORDER = [
  'exterior-wash',
  'exterior-detail',
  'interior-detail',
  'full-detail',
  'ceramic-coating',
] as const;

/** Canonical Gloss Boss service slugs shown in admin + booking. */
export const CANONICAL_SERVICE_SLUGS = new Set<string>(SERVICE_SLUG_ORDER);

export const CERAMIC_COATING_SLUG = 'ceramic-coating';

const ADMIN_TITLE_BY_SLUG: Record<string, string> = {
  'exterior-wash': 'Exterior Wash',
  'exterior-detail': 'Exterior Detail',
  'interior-detail': 'Interior Detail',
  'full-detail': 'Full Detail',
  'ceramic-coating': 'Ceramic Coating',
};

export function adminDisplayTitleForSlug(slug: string): string {
  const k = slug.trim().toLowerCase();
  return ADMIN_TITLE_BY_SLUG[k] ?? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isJunkServiceTitle(title: string, slug: string): boolean {
  const t = title.trim().toLowerCase();
  const s = slug.trim().toLowerCase();
  if (!t && !s) return true;
  if (/\btbd\b/.test(t)) return true;
  if (/^service(\s+sedan|\s+suv|\s+truck)?$/i.test(t)) return true;
  if (/service\s+sedan|service\s+suv|service\s+truck/i.test(`${t} ${s}`)) return true;
  return false;
}
