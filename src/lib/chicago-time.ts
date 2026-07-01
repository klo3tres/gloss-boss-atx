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

/** YYYY-MM in America/Chicago */
export function monthKeyChicago(input: string | Date = new Date()): string {
  const key = dateKeyChicago(input);
  return key.slice(0, 7);
}

export function periodBoundsChicago(periodType: 'daily' | 'monthly', periodKey: string): { start: string; end: string } {
  if (periodType === 'daily') {
    return {
      start: new Date(`${periodKey}T00:00:00-05:00`).toISOString(),
      end: new Date(`${periodKey}T23:59:59-05:00`).toISOString(),
    };
  }
  const [year, month] = periodKey.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  return {
    start: new Date(`${year}-${mm}-01T00:00:00-05:00`).toISOString(),
    end: new Date(`${year}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59-05:00`).toISOString(),
  };
}

export function startOfWeekChicagoIso(): string {
  const now = new Date();
  const key = dateKeyChicago(now);
  const d = new Date(`${key}T12:00:00-05:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return new Date(`${dateKeyChicago(d)}T00:00:00-05:00`).toISOString();
}

export function formatChicagoDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, dateStyle: 'medium' }).format(d);
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

/** Short time only in Chicago, e.g. "9:30 AM" */
export function chicagoTimeShort(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}
