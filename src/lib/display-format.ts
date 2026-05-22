/** UI display helpers — avoid "Not provided" when data can be omitted or enriched. */

export function str(v: unknown): string {
  return v == null ? '' : String(v).trim();
}

export function displayText(v: unknown, fallback = ''): string {
  const s = str(v);
  return s || fallback;
}

export function displayMoney(cents: unknown, empty = '—'): string {
  if (typeof cents !== 'number' || !Number.isFinite(cents)) return empty;
  return `$${(cents / 100).toFixed(2)}`;
}

export function displayLabel(v: unknown, empty = ''): string {
  const text = str(v);
  if (!text) return empty;
  return text.replace(/[_-]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export function displayChicago(v: unknown, empty = '—'): string {
  if (!v) return empty;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

export function displayPhone(v: unknown): string {
  const digits = str(v).replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return str(v);
}
