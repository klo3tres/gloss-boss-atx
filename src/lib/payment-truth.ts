import { displayMoney } from '@/lib/display-format';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

/** Actual collected deposit — never infer from required deposit on file. */
export function actualDepositPaidCents(depositPaidCents?: number | null): number {
  return typeof depositPaidCents === 'number' && depositPaidCents > 0 ? depositPaidCents : 0;
}

export function formatDepositPaidDisplay(depositPaidCents?: number | null, empty = '—'): string {
  const cents = actualDepositPaidCents(depositPaidCents);
  return cents > 0 ? displayMoney(cents) : empty;
}

export function formatDepositRequiredDisplay(depositRequiredCents?: number | null, empty = '—'): string {
  const cents = typeof depositRequiredCents === 'number' && depositRequiredCents > 0 ? depositRequiredCents : 0;
  return cents > 0 ? displayMoney(cents) : empty;
}

export type PaymentTruthInput = {
  paymentStatus?: string | null;
  depositPaidCents?: number | null;
  depositRequiredCents?: number | null;
  balanceDueCents?: number | null;
  totalCents?: number | null;
};

export type CanonicalPaymentStatus =
  | 'balance_due'
  | 'deposit_due'
  | 'pending'
  | 'processing'
  | 'deposit_paid'
  | 'paid'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'partially_refunded'
  | 'refunded'
  | 'comped'
  | 'no_payment_required';

export type CanonicalPaymentState = {
  code: CanonicalPaymentStatus;
  label: string;
  balanceDueCents: number;
  totalPaidCents: number;
};

/** One aggregate payment state for a booking/work order, derived from money first and provider state second. */
export function resolveCanonicalPaymentState(
  input: PaymentTruthInput & {
    totalPaidCents?: number | null;
    refundedCents?: number | null;
    latestTransactionStatus?: string | null;
  },
): CanonicalPaymentState {
  const raw = str(input.paymentStatus).toLowerCase();
  const latest = str(input.latestTransactionStatus || raw).toLowerCase();
  const total = Math.max(0, input.totalCents ?? 0);
  const balance = Math.max(0, input.balanceDueCents ?? total);
  const totalPaid = Math.max(
    0,
    input.totalPaidCents ?? (total > 0 ? Math.max(0, total - balance) : 0),
  );
  const depositPaid = actualDepositPaidCents(input.depositPaidCents);
  const depositRequired = Math.max(0, input.depositRequiredCents ?? 0);
  const refunded = Math.max(0, input.refundedCents ?? 0);
  const result = (code: CanonicalPaymentStatus, label: string): CanonicalPaymentState => ({
    code,
    label,
    balanceDueCents: balance,
    totalPaidCents: totalPaid,
  });

  if (raw === 'test_comped' || raw === 'manual_comped' || raw === 'comped' || raw.includes('comp')) {
    return result('comped', 'Comped — no charge');
  }
  if (raw === 'no_payment_required' || (total === 0 && totalPaid === 0 && balance === 0)) {
    return result('no_payment_required', 'No payment required');
  }
  if (balance <= 0 && (totalPaid > 0 || ['paid', 'full_paid', 'paid_in_full', 'paid_cash'].includes(raw))) {
    return result('paid', 'Paid in full');
  }
  if ((refunded > 0 || raw === 'refunded') && balance > 0 && totalPaid <= 0) {
    return result('refunded', `Refunded — ${displayMoney(balance)} due`);
  }
  if ((refunded > 0 || raw === 'partially_refunded') && balance > 0) {
    return result('partially_refunded', `Partially refunded — ${displayMoney(balance)} due`);
  }
  if (latest.includes('processing')) return result('processing', 'Payment processing');
  if (latest === 'pending' || latest.includes('pending_payment')) return result('pending', 'Payment pending');
  if (latest.includes('fail')) return result('failed', 'Payment failed — retry available');
  if (latest.includes('cancel')) return result('cancelled', 'Payment cancelled — retry available');
  if (latest.includes('expire')) return result('expired', 'Checkout expired — retry available');
  if (totalPaid > 0 || depositPaid > 0) {
    if (depositPaid > 0) {
      return result('deposit_paid', `Deposit paid — ${displayMoney(balance)} due`);
    }
    return result('balance_due', `${displayMoney(balance)} due`);
  }
  if (depositRequired > 0 || raw === 'awaiting_deposit' || raw === 'deposit_required') {
    return result('deposit_due', `Deposit required — ${displayMoney(depositRequired || balance)} due`);
  }
  return result('balance_due', `${displayMoney(balance)} due`);
}

/** Human-readable payment state — never claims deposit paid without recorded payment. */
export function paymentStatusLabel(input: PaymentTruthInput): string {
  return resolveCanonicalPaymentState(input).label;
}

export function depositPaidLabel(input: PaymentTruthInput): string {
  const paid = actualDepositPaidCents(input.depositPaidCents);
  if (paid > 0) return `Deposit paid: ${displayMoney(paid)}`;
  const required =
    typeof input.depositRequiredCents === 'number' && input.depositRequiredCents > 0
      ? input.depositRequiredCents
      : 0;
  if (required > 0) return `Deposit required: ${displayMoney(required)} (unpaid)`;
  return 'No deposit recorded';
}
