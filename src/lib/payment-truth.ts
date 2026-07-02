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

/** Human-readable payment state — never claims deposit paid without recorded payment. */
export function paymentStatusLabel(input: PaymentTruthInput): string {
  const pay = str(input.paymentStatus).toLowerCase();
  const depositPaid = actualDepositPaidCents(input.depositPaidCents);
  const required =
    typeof input.depositRequiredCents === 'number' && input.depositRequiredCents > 0
      ? input.depositRequiredCents
      : 0;
  const balance = typeof input.balanceDueCents === 'number' ? input.balanceDueCents : null;

  if (pay === 'test_comped' || pay.includes('comp')) return 'Comped — no charge';
  if (pay === 'paid' || pay.includes('paid_full') || pay.includes('paid_cash')) {
    return balance != null && balance <= 0 ? 'Paid in full' : 'Paid';
  }
  if (depositPaid > 0) return `Deposit paid (${displayMoney(depositPaid)})`;
  if (pay === 'awaiting_deposit' || (required > 0 && depositPaid === 0)) {
    return `Deposit required — unpaid${required > 0 ? ` (${displayMoney(required)})` : ''}`;
  }
  if (pay === 'awaiting_payment' || pay === 'pay_later' || pay.includes('pay_later')) return 'Pay in full later';
  if (balance != null && balance <= 0 && depositPaid === 0) return 'Paid in full';
  return 'Unpaid';
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
