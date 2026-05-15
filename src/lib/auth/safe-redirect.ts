/**
 * Same-origin path only — blocks protocol-relative and absolute URLs.
 */

export function getSafeInternalRedirect(raw: string | null, fallback: string): string {
  if (raw == null || typeof raw !== 'string') return fallback;
  const t = raw.trim();
  if (t.length === 0) return fallback;
  if (!t.startsWith('/') || t.startsWith('//')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(t)) return fallback;
  return t;
}
