/** Human-readable appointment label for mileage, exports, and ops tables. */
export function formatAppointmentLabel(appt: Record<string, unknown> | null | undefined): string {
  if (!appt) return '—';
  const name = String(appt.guest_name ?? 'Customer').trim() || 'Customer';
  const start = appt.scheduled_start;
  if (!start) return name;
  const d = new Date(String(start));
  if (Number.isNaN(d.getTime())) return name;
  const when = d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${name} · ${when}`;
}
