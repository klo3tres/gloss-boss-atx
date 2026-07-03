function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export type TimelineEventLabelInput = {
  event_type?: string | null;
  kind?: string | null;
  template_key?: string | null;
  channel?: string | null;
  guest_name?: string | null;
  customer_name?: string | null;
  service?: string | null;
  amount_cents?: number | null;
  meta?: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function guestFrom(input: TimelineEventLabelInput) {
  return str(input.guest_name || input.customer_name || input.meta?.guest_name || input.payload?.guest_name) || 'Customer';
}

function serviceFrom(input: TimelineEventLabelInput) {
  const raw =
    str(input.service) ||
    str(input.meta?.service_slug) ||
    str(input.payload?.service_slug) ||
    str(input.meta?.vehicles) ||
    str(input.payload?.vehicles);
  return raw ? raw.replace(/-/g, ' ') : '';
}

/** Human-readable Activity Center / timeline label. */
export function formatActivityEventLabel(input: TimelineEventLabelInput): string {
  const type = str(input.event_type || input.kind || input.template_key).toLowerCase();
  const guest = guestFrom(input);
  const service = serviceFrom(input);
  const servicePart = service ? ` — ${service}` : '';
  const channel = str(input.channel).toLowerCase();
  const amount =
    typeof input.amount_cents === 'number' && input.amount_cents > 0
      ? money(input.amount_cents)
      : typeof input.meta?.amount_cents === 'number'
        ? money(input.meta.amount_cents as number)
        : typeof input.payload?.amount_cents === 'number'
          ? money(input.payload.amount_cents as number)
          : '';

  if (type.includes('new_booking') || type === 'booking_created') {
    return `Booking created: ${guest}${servicePart}`;
  }
  if (type.includes('owner_sms') || (type.includes('sms') && type.includes('owner'))) {
    return `Owner SMS sent: ${guest}${servicePart}`;
  }
  if (type.includes('confirmation') && type.includes('email')) {
    return `📧 ${guest} — Confirmation email sent`;
  }
  if (type.includes('confirmation') && type.includes('sms')) {
    return `📱 ${guest} — SMS delivered`;
  }
  if (type.includes('customer_confirmation_sent')) {
    const total = str(input.meta?.total_cents || input.payload?.total_cents);
    return total ? `📧 ${guest} — Confirmation sent (${money(Number(total))} total)` : `📧 ${guest} — Confirmation sent`;
  }
  if (type.includes('google_calendar') || type.includes('calendar_sync') || type.includes('gcal')) {
    const when = str(input.meta?.when_label || input.payload?.when_label);
    return `📅 ${guest} — Google Calendar updated${when ? ` (${when})` : servicePart}`;
  }
  if (type.includes('payment_link')) {
    return `💵 ${guest} — Payment link${amount ? ` (${amount})` : ''}`;
  }
  if (type.includes('deposit_paid')) {
    return `💵 ${guest} — Deposit received${amount ? ` (${amount})` : ''}`;
  }
  if (type.includes('paid_full') || type.includes('payment_received')) {
    return `💵 ${guest} — Payment received${amount ? ` (${amount})` : ''}`;
  }
  if (type.includes('review')) {
    return `⭐ ${guest} — Review submitted`;
  }
  if (type.includes('password_reset')) {
    return type.includes('failed') ? `Password reset failed: ${guest}` : `Password reset sent: ${guest}`;
  }
  if (type.includes('rescheduled')) {
    return `Booking rescheduled: ${guest}${servicePart}`;
  }
  if (type.includes('cancelled')) {
    return `Booking cancelled: ${guest}${servicePart}`;
  }
  if (channel === 'sms' && type.includes('email')) {
    return `Email sent: ${guest} — ${type.replace(/_/g, ' ')}`;
  }
  if (channel === 'sms') {
    return `📱 ${guest} — SMS${servicePart}${amount ? ` · ${amount}` : ''}`;
  }
  if (channel === 'email') {
    return `📧 ${guest} — Email${servicePart}${amount ? ` · ${amount}` : ''}`;
  }

  const human = type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return `${human}: ${guest}${servicePart}`;
}

export function formatOwnerSmsBody(title: string, detail: string): string {
  const prefix = 'Gloss Boss ATX:';
  const t = str(title);
  const d = str(detail);
  if (t.startsWith(prefix)) return d ? `${t} ${d}` : t;
  if (d) return `${prefix} ${t} — ${d}`;
  return `${prefix} ${t}`;
}
