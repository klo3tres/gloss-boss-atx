/** Turn CMS/markup into plain text for safe display (no HTML/JSX rendering in the client). */
export function intakeCmsMarkupToPlainText(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const noTags = t
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return noTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
}

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
