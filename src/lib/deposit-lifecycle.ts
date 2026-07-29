export type DepositAmountInput = {
  depositCents: number;
  depositPaidCents: number;
  finalTotalCents: number;
  totalPaidCents: number;
  paymentChoice?: 'deposit' | 'full';
};

function cents(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** The only amount a booking checkout is allowed to collect right now. */
export function resolveBookingCheckoutAmount(input: DepositAmountInput) {
  const depositCents = cents(input.depositCents);
  const depositPaidCents = cents(input.depositPaidCents);
  const finalTotalCents = cents(input.finalTotalCents);
  const totalPaidCents = cents(input.totalPaidCents);

  return input.paymentChoice === 'full'
    ? Math.max(0, finalTotalCents - totalPaidCents)
    : Math.max(0, depositCents - depositPaidCents);
}

export type CheckoutAmountValidation =
  | { ok: true }
  | { ok: false; code: 'PAYMENT_NOT_SETTLED' | 'INVALID_AMOUNT' | 'AMOUNT_MISMATCH'; error: string };

/** Refuse to advance a booking from an unpaid or incorrectly sized Stripe event. */
export function validateCompletedBookingCheckout(input: {
  paymentStatus: string | null | undefined;
  amountCents: number;
  expectedAmountCents: number;
  alreadyRecordedAmountCents?: number | null;
}): CheckoutAmountValidation {
  if (String(input.paymentStatus ?? '').toLowerCase() !== 'paid') {
    return {
      ok: false,
      code: 'PAYMENT_NOT_SETTLED',
      error: 'Stripe checkout completed without a settled payment.',
    };
  }

  const amountCents = cents(input.amountCents);
  if (amountCents < 50) {
    return { ok: false, code: 'INVALID_AMOUNT', error: 'Stripe checkout amount is below the card minimum.' };
  }

  const recorded = cents(input.alreadyRecordedAmountCents ?? 0);
  const expected = recorded > 0 ? recorded : cents(input.expectedAmountCents);
  if (expected < 50 || amountCents !== expected) {
    return {
      ok: false,
      code: 'AMOUNT_MISMATCH',
      error: `Stripe checkout amount ${amountCents} did not match the canonical amount ${expected}.`,
    };
  }

  return { ok: true };
}
