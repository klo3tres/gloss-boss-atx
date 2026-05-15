/** slugify(title || name || id) for services and CMS keys. */
export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return s || 'item';
}

export function slugifyServiceSlug(title: string | null | undefined, name: string | null | undefined, id: string): string {
  const base = slugify(String(title ?? '').trim() || String(name ?? '').trim());
  if (base && base !== 'item') return base;
  const short = id.replace(/-/g, '').slice(0, 8);
  return short ? `service-${short}` : 'service';
}
