export type ScheduleWidgetItem = {
  id: string;
  scheduledStart: string;
  title: string;
  subtitle?: string;
  meta?: string;
  href?: string;
  status?: string;
  address?: string;
};

export function scheduleDayKey(iso: string, timeZone = 'America/Chicago'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function formatScheduleTime(iso: string, timeZone = 'America/Chicago'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export function formatScheduleShortDate(iso: string, timeZone = 'America/Chicago'): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' }).format(d);
}
