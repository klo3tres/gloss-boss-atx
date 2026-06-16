/**
 * Payment truth rules — never infer Stripe deposits from appointment fields alone.
 */
import type { Row } from '@/lib/work-order-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function num(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function isPaymentVoided(p: Row | { status?: unknown; voided_at?: unknown; voided?: unknown }) {
  return Boolean((p as Row).voided_at || (p as Row).voided === true) || str((p as Row).status).toLowerCase() === 'voided';
}

export function isPaymentSucceeded(p: Row | { status?: unknown }) {
  const st = str((p as Row).status).toLowerCase();
  return st === 'succeeded' || st === 'paid' || st === 'comped' || st === 'manual_comped';
}

/** Cash, Zelle, Venmo, check, Cash App, Apple Pay, manual transfer — never Stripe deposit. */
export function isManualFieldPayment(p: Row): boolean {
  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  if (method.includes('cash')) return true;
  if (method.includes('zelle') || method.includes('venmo') || method.includes('cash_app') || method.includes('cashapp')) return true;
  if (method.includes('apple_pay') || method.includes('apple pay')) return true;
  if (method.includes('check') || method.includes('transfer')) return true;
  if (method.includes('manual') && !method.includes('stripe')) return true;
  const kind = str(p.payment_kind).toLowerCase();
  if (kind === 'manual' || kind === 'field_cash' || kind === 'field_balance') return true;
  return false;
}

export function hasStripeProviderEvidence(p: Row): boolean {
  const method = str(p.payment_method).toLowerCase();
  const provider = str((p as Record<string, unknown>).provider).toLowerCase();
  const hasIds = Boolean(str(p.stripe_checkout_session_id) || str(p.stripe_payment_intent_id));
  const methodStripe = method.includes('stripe') || method === 'card' || method.includes('card');
  const providerStripe = provider === 'stripe';
  return hasIds && (methodStripe || providerStripe || method === '');
}

/** Real Stripe charge — requires provider evidence, succeeded, non-zero amount. */
export function isRealStripePayment(p: Row): boolean {
  if (!isPaymentSucceeded(p) || isPaymentVoided(p)) return false;
  if (isManualFieldPayment(p)) return false;
  if (num(p.amount_cents) <= 0) return false;
  return hasStripeProviderEvidence(p);
}

/** Stripe deposit only when Stripe evidence + deposit kind (never from appointment deposit_amount alone). */
export function isRealStripeDeposit(p: Row): boolean {
  if (!isRealStripePayment(p)) return false;
  const kind = str(p.payment_kind).toLowerCase();
  return kind.includes('deposit') || kind === 'booking_deposit';
}

/** Payment row that should not count toward revenue (inferred/fake — no row id is always excluded). */
export function isInferredDepositWithoutRow(): boolean {
  return false;
}

export type PaymentChannel =
  | 'stripe'
  | 'cash'
  | 'zelle'
  | 'venmo'
  | 'cash_app'
  | 'apple_pay'
  | 'check'
  | 'manual_card'
  | 'bank_transfer'
  | 'comp'
  | 'credit'
  | 'other';

/** Real collected cash channels — credits, comps, and discounts never qualify. */
export function isCashRevenueChannel(channel: PaymentChannel): boolean {
  return (
    channel === 'stripe' ||
    channel === 'cash' ||
    channel === 'zelle' ||
    channel === 'venmo' ||
    channel === 'cash_app' ||
    channel === 'apple_pay' ||
    channel === 'check' ||
    channel === 'manual_card' ||
    channel === 'bank_transfer'
  );
}

function paymentSourceText(row?: Row): string {
  if (!row) return '';
  const meta = (row as Record<string, unknown>).metadata;
  const metaSource =
    meta && typeof meta === 'object' && !Array.isArray(meta) ? str((meta as Record<string, unknown>).source) : '';
  const rowSource = str((row as Record<string, unknown>).source);
  return `${rowSource} ${metaSource}`.toLowerCase();
}

const NON_CASH_METHOD_TOKENS = [
  'customer_credit',
  'store_credit',
  'complimentary_credit',
  'loyalty_reward',
  'loyalty',
  'gift_card',
  'giftcard',
  'promo_discount',
  'membership_discount',
  'reward',
  'discount',
  'comp',
  'complimentary',
  'free',
];

/** True when a succeeded payment row must never count toward cash revenue. */
export function shouldExcludeFromCashRevenue(
  p: Row & {
    exclude_from_revenue?: boolean | null;
    is_test?: boolean | null;
    metadata?: Record<string, unknown> | null;
    refunded_at?: string | null;
    provider?: string | null;
  },
): boolean {
  if (p.exclude_from_revenue === true) return true;
  if (p.is_test === true) return true;
  if (isPaymentVoided(p)) return true;
  if (p.refunded_at) return true;

  const status = str(p.status).toLowerCase();
  if (['voided', 'test', 'excluded', 'comped', 'manual_comped', 'failed', 'canceled', 'cancelled'].includes(status)) {
    return true;
  }

  const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : null;
  if (meta?.duplicate_of_stripe === true || meta?.merged_into_payment_id) return true;
  if (meta?.is_test === true || meta?.test === true) return true;
  if (meta?.exclude_from_revenue === true) return true;

  const method = str(p.payment_method ?? p.payment_kind).toLowerCase();
  const kind = str(p.payment_kind).toLowerCase();
  const source = `${method} ${kind} ${paymentSourceText(p)}`;
  if (NON_CASH_METHOD_TOKENS.some((token) => source.includes(token))) return true;
  if (source.includes('repair_') && !hasStripeProviderEvidence(p)) return true;

  const channel = classifyPaymentChannel(method, kind, p);
  return !isCashRevenueChannel(channel);
}

export function classifyPaymentChannel(methodRaw: string, kindRaw: string, row?: Row): PaymentChannel {
  const method = methodRaw.toLowerCase();
  const kind = kindRaw.toLowerCase();
  const source = `${method} ${kind} ${paymentSourceText(row)}`;
  if (
    source.includes('customer_credit') ||
    source.includes('store_credit') ||
    source.includes('complimentary_credit') ||
    source.includes('loyalty') ||
    source.includes('reward') ||
    source.includes('gift_card') ||
    source.includes('giftcard')
  ) {
    return 'credit';
  }
  if (source.includes('promo_discount') || source.includes('membership_discount') || source.includes('discount')) {
    return 'comp';
  }
  if (source.includes('credit')) return 'credit';
  if (source.includes('comp') || source.includes('free')) return 'comp';
  if (source.includes('zelle')) return 'zelle';
  if (source.includes('venmo')) return 'venmo';
  if (source.includes('cash_app') || source.includes('cashapp')) return 'cash_app';
  if (source.includes('apple_pay') || source.includes('apple pay')) return 'apple_pay';
  if (source.includes('check')) return 'check';
  if (source.includes('bank_transfer') || source.includes('bank transfer') || source.includes('ach')) return 'bank_transfer';
  if (source.includes('cash')) return 'cash';
  if (row && isRealStripePayment(row)) return 'stripe';
  if (source.includes('stripe') || source.includes('card')) {
    if (row && hasStripeProviderEvidence(row)) return 'stripe';
    return 'other';
  }
  if (source.includes('manual') && source.includes('card')) return 'manual_card';
  return 'other';
}
