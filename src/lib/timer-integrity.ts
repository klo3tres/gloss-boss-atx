export const MAX_VALID_TIMER_MINUTES = 12 * 60;
export const MAX_VALID_TIMER_SECONDS = MAX_VALID_TIMER_MINUTES * 60;

type TimerRow = Record<string, unknown>;
type LinkedWorkOrder = Record<string, unknown> | null | undefined;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isoMs(v: unknown) {
  const s = str(v);
  if (!s) return null;
  const ms = new Date(s).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export function timerDurationSeconds(row: TimerRow, nowMs = Date.now()): number | null {
  const explicit = Number(row.duration_seconds);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const startMs = isoMs(row.started_at) ?? isoMs(row.created_at);
  if (!startMs) return null;
  const endMs = isoMs(row.ended_at) ?? nowMs;
  const seconds = Math.round((endMs - startMs) / 1000);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

export function timerDurationMinutes(row: TimerRow, nowMs = Date.now()): number | null {
  const seconds = timerDurationSeconds(row, nowMs);
  return seconds == null ? null : Math.round(seconds / 60);
}

export function formatTimerMinutes(minutes: number | null | undefined) {
  if (minutes == null || !Number.isFinite(minutes)) return 'Not recorded';
  const h = Math.floor(minutes / 60);
  const m = Math.max(0, minutes % 60);
  if (h <= 0) return `${m} min`;
  return `${h} hr ${m} min`;
}

export function timerHasWorkOrderLink(row: TimerRow) {
  return Boolean(str(row.appointment_id) || str(row.fallback_booking_id) || str(row.work_order_id));
}

function isClosedWorkOrder(row: LinkedWorkOrder) {
  if (!row) return false;
  const status = str(row.status).toLowerCase();
  return (
    ['completed', 'cancelled', 'canceled', 'archived', 'deleted', 'voided', 'test_comped'].includes(status) ||
    Boolean(row.archived === true || str(row.archived_at) || str(row.deleted_at))
  );
}

export function timerInvalidReasons(
  row: TimerRow,
  opts: { appointment?: LinkedWorkOrder; fallback?: LinkedWorkOrder; nowMs?: number } = {},
): string[] {
  const reasons: string[] = [];
  const seconds = timerDurationSeconds(row, opts.nowMs);
  if (seconds == null || seconds < 0) reasons.push('missing_timer_duration');
  else if (seconds > MAX_VALID_TIMER_SECONDS) reasons.push('duration_over_12_hours');

  const hasAppointmentId = Boolean(str(row.appointment_id));
  const hasFallbackId = Boolean(str(row.fallback_booking_id));
  if (!timerHasWorkOrderLink(row)) reasons.push('missing_work_order_link');
  if (hasAppointmentId && opts.appointment === null) reasons.push('orphaned_appointment_timer');
  if (hasFallbackId && opts.fallback === null) reasons.push('orphaned_fallback_timer');

  const linked = opts.appointment ?? opts.fallback;
  const running = row.running === true || (!str(row.ended_at) && str(row.status).toLowerCase() !== 'stopped');
  if (running && isClosedWorkOrder(linked)) reasons.push('running_for_closed_work_order');
  if (!str(row.customer_id) && linked && !str(linked.customer_id) && !str(linked.guest_email) && !str(linked.guest_phone)) {
    reasons.push('missing_customer_reference');
  }
  return [...new Set(reasons)];
}

export function isValidTimerForAnalytics(row: TimerRow, opts: { appointment?: LinkedWorkOrder; fallback?: LinkedWorkOrder; nowMs?: number } = {}) {
  return timerInvalidReasons(row, opts).length === 0;
}
