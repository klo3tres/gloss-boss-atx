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
  | 'comp'
  | 'other';

export function classifyPaymentChannel(methodRaw: string, kindRaw: string, row?: Row): PaymentChannel {
  const method = methodRaw.toLowerCase();
  const kind = kindRaw.toLowerCase();
  const source = `${method} ${kind}`;
  if (source.includes('comp') || source.includes('free')) return 'comp';
  if (source.includes('zelle')) return 'zelle';
  if (source.includes('venmo')) return 'venmo';
  if (source.includes('cash_app') || source.includes('cashapp')) return 'cash_app';
  if (source.includes('apple_pay') || source.includes('apple pay')) return 'apple_pay';
  if (source.includes('check')) return 'check';
  if (source.includes('cash')) return 'cash';
  if (row && isRealStripePayment(row)) return 'stripe';
  if (source.includes('stripe') || source.includes('card')) {
    if (row && hasStripeProviderEvidence(row)) return 'stripe';
    return 'other';
  }
  if (source.includes('manual') && source.includes('card')) return 'manual_card';
  return 'other';
}
