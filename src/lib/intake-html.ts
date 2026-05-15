/** Strip unsafe CMS HTML; return null to fall back to React fields only. */
export function sanitizeIntakeCmsHtml(html: string): string | null {
  const t = html.trim();
  if (!t || t.length > 500_000) return null;
  if (/<\s*script\b/i.test(t)) return null;
  if (/<\s*iframe\b/i.test(t)) return null;
  if (/<\s*object\b/i.test(t)) return null;
  if (/<\s*embed\b/i.test(t)) return null;
  if (/javascript\s*:/i.test(t)) return null;
  if (/\bon\w+\s*=/i.test(t)) return null;
  if (/<\s*link\b/i.test(t)) return null;
  if (/<\s*meta\b/i.test(t)) return null;
  return t;
}
