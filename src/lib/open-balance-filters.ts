import { isTestLikeJob } from '@/lib/tech-job-filters';

export type OpenBalanceAppt = {
  id?: string;
  status?: string | null;
  payment_status?: string | null;
  balance_due_cents?: number | null;
  deposit_amount_cents?: number | null;
  scheduled_start?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  guest_email?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  notes?: string | null;
  archived?: boolean | null;
  archived_at?: string | null;
  deleted_at?: string | null;
};

const STALE_MS = 24 * 60 * 60 * 1000;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Jobs excluded from active owner open-balance totals (still visible under diagnostics). */
export function classifyOpenBalance(appt: OpenBalanceAppt): {
  actionable: boolean;
  stale: boolean;
  reason: string;
} {
  const balance = Math.max(0, cents(appt.balance_due_cents));
  if (balance <= 0) return { actionable: false, stale: false, reason: 'No balance due' };

  const status = str(appt.status).toLowerCase();
  const paymentStatus = str(appt.payment_status).toLowerCase();

  if (['cancelled', 'deleted', 'archived', 'voided'].includes(status)) {
    return { actionable: false, stale: true, reason: `Status: ${status}` };
  }
  if (appt.archived === true || str(appt.archived_at) || str(appt.deleted_at)) {
    return { actionable: false, stale: true, reason: 'Archived or deleted row' };
  }
  if (paymentStatus === 'comped' || paymentStatus === 'manual_comped' || paymentStatus === 'paid') {
    return { actionable: false, stale: true, reason: `Payment status: ${paymentStatus}` };
  }
  if (isTestLikeJob(appt)) {
    return { actionable: false, stale: true, reason: 'Test/sandbox job' };
  }

  const anchor = str(appt.scheduled_start) || str(appt.created_at) || str(appt.updated_at);
  const anchorMs = anchor ? new Date(anchor).getTime() : NaN;
  const ageMs = Number.isFinite(anchorMs) ? Date.now() - anchorMs : STALE_MS + 1;
  const confirmed =
    ['confirmed', 'assigned', 'deposit_paid', 'balance_due', 'in_progress', 'completed'].includes(status) ||
    paymentStatus.includes('deposit') ||
    paymentStatus === 'confirmed';

  if (ageMs > STALE_MS && !confirmed && status === 'pending') {
    return { actionable: false, stale: true, reason: 'Pending >24h without confirmation' };
  }
  if (ageMs > STALE_MS * 7 && status === 'pending') {
    return { actionable: false, stale: true, reason: 'Stale pending job (>7 days)' };
  }

  return { actionable: true, stale: false, reason: 'Live actionable balance' };
}

export function isActionableOpenBalance(appt: OpenBalanceAppt) {
  return classifyOpenBalance(appt).actionable;
}

export function isStaleOpenBalance(appt: OpenBalanceAppt) {
  const c = classifyOpenBalance(appt);
  return c.stale && Math.max(0, cents(appt.balance_due_cents)) > 0;
}
