const TZ = 'America/Chicago';

function chicagoLocalParts(d: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const year = parts.find((p) => p.type === 'year')?.value ?? '0000';
  const month = parts.find((p) => p.type === 'month')?.value ?? '00';
  const day = parts.find((p) => p.type === 'day')?.value ?? '00';
  let hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  if (hour === '24') hour = '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return { ymd: `${year}-${month}-${day}`, hm: `${hour}:${minute}` };
}

/**
 * Parse a date + time (or datetime-local value) as America/Chicago local → UTC ISO.
 * Fixes server-side `new Date("YYYY-MM-DDTHH:mm")` interpreting as UTC on Vercel.
 */
export function parseChicagoLocalToIso(dateOrDatetime: string, timeInput?: string): string | null {
  let ymd: string;
  let hm: string;
  const raw = dateOrDatetime.trim();
  if (raw.includes('T')) {
    const [d, rest] = raw.split('T');
    ymd = d;
    hm = (rest ?? '').slice(0, 5);
  } else {
    ymd = raw;
    hm = (timeInput ?? '').trim().slice(0, 5);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^\d{2}:\d{2}$/.test(hm)) return null;

  for (const offset of ['-05:00', '-06:00'] as const) {
    const candidate = new Date(`${ymd}T${hm}:00${offset}`);
    if (Number.isNaN(candidate.getTime())) continue;
    const local = chicagoLocalParts(candidate);
    if (local.ymd === ymd && local.hm === hm) return candidate.toISOString();
  }
  const fallback = new Date(`${ymd}T${hm}:00-06:00`);
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
}

/** Format UTC ISO as `datetime-local` value in America/Chicago. */
export function toChicagoDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const { ymd, hm } = chicagoLocalParts(d);
  return `${ymd}T${hm}`;
}

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
