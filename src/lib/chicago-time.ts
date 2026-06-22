const TZ = 'America/Chicago';

export function dateKeyChicago(input: string | Date): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  return `${year}-${month}-${day}`;
}

export function isTodayChicago(iso: string) {
  return dateKeyChicago(iso) === dateKeyChicago(new Date());
}

export function isTomorrowChicago(iso: string) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return dateKeyChicago(iso) === dateKeyChicago(d);
}

export function startOfTodayChicagoIso() {
  const key = dateKeyChicago(new Date());
  return new Date(`${key}T00:00:00-05:00`).toISOString();
}

export function endOfTodayChicagoIso() {
  const key = dateKeyChicago(new Date());
  return new Date(`${key}T23:59:59-05:00`).toISOString();
}

export function formatChicagoDateTime(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}
