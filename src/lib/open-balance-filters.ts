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
  stripe_checkout_session_id?: string | null;
  fallback_booking_id?: string | null;
};

export type OpenBalanceContext = {
  cashCollectedCents?: number;
  hasRealStripePayment?: boolean;
};

export type PendingDepositAppt = OpenBalanceAppt;

export type PendingDepositContext = {
  hasRealStripePayment?: boolean;
  hasActiveCommunication?: boolean;
  paymentLinkValid?: boolean;
};

const STALE_MS = 24 * 60 * 60 * 1000;

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function anchorMs(appt: OpenBalanceAppt) {
  const anchor = str(appt.scheduled_start) || str(appt.created_at) || str(appt.updated_at);
  const ms = anchor ? new Date(anchor).getTime() : NaN;
  return Number.isFinite(ms) ? ms : Date.now();
}

function isTerminalStatus(status: string, paymentStatus: string) {
  return (
    ['cancelled', 'canceled', 'deleted', 'archived', 'voided', 'comped', 'test'].includes(status) ||
    paymentStatus === 'comped' ||
    paymentStatus === 'manual_comped' ||
    paymentStatus === 'paid'
  );
}

function isConfirmedJob(status: string, paymentStatus: string) {
  return (
    ['confirmed', 'assigned', 'deposit_paid', 'balance_due', 'in_progress', 'completed'].includes(status) ||
    paymentStatus.includes('deposit') ||
    paymentStatus === 'confirmed'
  );
}

/** Jobs excluded from active owner open-balance totals (still visible under diagnostics). */
export function classifyOpenBalance(
  appt: OpenBalanceAppt,
  ctx?: OpenBalanceContext,
): {
  actionable: boolean;
  stale: boolean;
  reason: string;
} {
  const balance = Math.max(0, cents(appt.balance_due_cents));
  if (balance <= 0) return { actionable: false, stale: false, reason: 'No balance due' };

  const status = str(appt.status).toLowerCase();
  const paymentStatus = str(appt.payment_status).toLowerCase();

  if (isTerminalStatus(status, paymentStatus)) {
    return { actionable: false, stale: true, reason: `Status: ${status || paymentStatus}` };
  }
  if (appt.archived === true || str(appt.archived_at) || str(appt.deleted_at)) {
    return { actionable: false, stale: true, reason: 'Archived or deleted row' };
  }
  if (isTestLikeJob(appt)) {
    return { actionable: false, stale: true, reason: 'Test/sandbox job' };
  }

  const ageMs = Date.now() - anchorMs(appt);
  const confirmed = isConfirmedJob(status, paymentStatus);
  const hasPaymentActivity = Boolean(ctx?.hasRealStripePayment) || cents(ctx?.cashCollectedCents) > 0;

  if (str(appt.fallback_booking_id) && ageMs > STALE_MS && !hasPaymentActivity) {
    return { actionable: false, stale: true, reason: 'Stale fallback/test booking (>24h, no payment)' };
  }
  if (ageMs > STALE_MS && !hasPaymentActivity && !confirmed) {
    return { actionable: false, stale: true, reason: 'No real payment activity >24h' };
  }
  if (ageMs > STALE_MS && !confirmed && status === 'pending') {
    return { actionable: false, stale: true, reason: 'Pending >24h without confirmation' };
  }
  if (ageMs > STALE_MS * 7 && status === 'pending') {
    return { actionable: false, stale: true, reason: 'Stale pending job (>7 days)' };
  }

  return { actionable: true, stale: false, reason: 'Live actionable balance' };
}

export function isActionableOpenBalance(appt: OpenBalanceAppt, ctx?: OpenBalanceContext) {
  return classifyOpenBalance(appt, ctx).actionable;
}

export function isStaleOpenBalance(appt: OpenBalanceAppt, ctx?: OpenBalanceContext) {
  const c = classifyOpenBalance(appt, ctx);
  return c.stale && Math.max(0, cents(appt.balance_due_cents)) > 0;
}

/** Pending deposits excluded from active dashboard unless still live and collectible. */
export function classifyPendingDeposit(
  appt: PendingDepositAppt,
  ctx?: PendingDepositContext,
): {
  actionable: boolean;
  stale: boolean;
  reason: string;
} {
  const deposit = Math.max(0, cents(appt.deposit_amount_cents));
  if (deposit <= 0) return { actionable: false, stale: false, reason: 'No deposit due' };

  const status = str(appt.status).toLowerCase();
  const paymentStatus = str(appt.payment_status).toLowerCase();
  if (paymentStatus !== 'awaiting_deposit' && status !== 'pending') {
    return { actionable: false, stale: false, reason: 'Not awaiting deposit' };
  }
  if (isTerminalStatus(status, paymentStatus)) {
    return { actionable: false, stale: true, reason: `Status: ${status || paymentStatus}` };
  }
  if (appt.archived === true || str(appt.archived_at) || str(appt.deleted_at)) {
    return { actionable: false, stale: true, reason: 'Archived or deleted row' };
  }
  if (isTestLikeJob(appt)) {
    return { actionable: false, stale: true, reason: 'Test/sandbox job' };
  }

  const ageMs = Date.now() - anchorMs(appt);
  const scheduledMs = str(appt.scheduled_start) ? new Date(str(appt.scheduled_start)).getTime() : NaN;
  const scheduledInFuture = Number.isFinite(scheduledMs) && scheduledMs > Date.now();
  const confirmed = isConfirmedJob(status, paymentStatus);
  const hasStripe = Boolean(ctx?.hasRealStripePayment) || Boolean(str(appt.stripe_checkout_session_id));
  const paymentLinkValid = ctx?.paymentLinkValid ?? hasStripe;
  const hasCommunication = ctx?.hasActiveCommunication ?? false;

  if (ageMs <= STALE_MS) {
    return { actionable: true, stale: false, reason: 'Active pending deposit' };
  }

  if (confirmed && (scheduledInFuture || paymentLinkValid || hasCommunication)) {
    return { actionable: true, stale: false, reason: 'Confirmed pending deposit with live collection path' };
  }

  return { actionable: false, stale: true, reason: 'Stale pending deposit (>24h without confirmation)' };
}

export function isActionablePendingDeposit(appt: PendingDepositAppt, ctx?: PendingDepositContext) {
  return classifyPendingDeposit(appt, ctx).actionable;
}

export function isStalePendingDeposit(appt: PendingDepositAppt, ctx?: PendingDepositContext) {
  const c = classifyPendingDeposit(appt, ctx);
  const deposit = Math.max(0, cents(appt.deposit_amount_cents));
  return c.stale && deposit > 0;
}
