/**
 * Validates Jarvis Henderson revenue safety: real Stripe row counts once, repair row excluded.
 * Run: npx tsx scripts/validate-jarvis-revenue.ts
 */
import { createClient } from '@supabase/supabase-js';
import { summarizePayments, type PayRow } from '../src/lib/revenue-metrics';
import { shouldExcludeFromCashRevenue } from '../src/lib/payment-classification';

const JARVIS_APPT = 'c4e49bc9-4dd8-4f9c-a931-9879a20f57e3';
const REAL_STRIPE_ROW = 'dbf0d651-68c1-47c2-995c-aaebdcde4a39';
const REPAIR_ROW = '9b393e70-a173-430f-b7e7-0a29309fb35f';
const EXPECTED_CENTS = 5814;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const admin = createClient(url, key);
  const { data: rows, error } = await admin
    .from('payments')
    .select(
      'id, amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, paid_at, appointment_id, metadata, stripe_checkout_session_id, stripe_payment_intent_id, provider, is_test, exclude_from_revenue, refunded_at, refunded_amount_cents',
    )
    .eq('appointment_id', JARVIS_APPT);

  if (error) {
    console.error('Query failed:', error.message);
    process.exit(1);
  }

  const payments = (rows ?? []) as PayRow[];
  const real = payments.find((p) => String(p.id) === REAL_STRIPE_ROW);
  const repair = payments.find((p) => String(p.id) === REPAIR_ROW);
  const summary = summarizePayments(payments, { excludeTest: true });

  const failures: string[] = [];

  if (!real) failures.push(`Missing real Stripe payment row ${REAL_STRIPE_ROW}`);
  if (real && shouldExcludeFromCashRevenue(real)) failures.push(`Real Stripe row ${REAL_STRIPE_ROW} incorrectly excluded from cash revenue`);
  if (repair && !shouldExcludeFromCashRevenue(repair)) failures.push(`Repair row ${REPAIR_ROW} should be excluded from cash revenue`);
  if (summary.grossCents !== EXPECTED_CENTS) {
    failures.push(`Jarvis cash revenue expected ${EXPECTED_CENTS} cents, got ${summary.grossCents}`);
  }
  if (summary.paymentCount !== 1) {
    failures.push(`Jarvis should count exactly 1 cash payment, got ${summary.paymentCount}`);
  }
  if (summary.creditCents > 0) {
    failures.push(`Credits should not inflate Jarvis cash revenue (creditCents=${summary.creditCents})`);
  }

  if (failures.length > 0) {
    console.error('VALIDATION FAILED:');
    for (const f of failures) console.error(`  - ${f}`);
    console.error('\nPayments on file:', payments.map((p) => ({ id: p.id, amount: p.amount_cents, status: p.status, exclude: p.exclude_from_revenue })));
    process.exit(1);
  }

  console.log('OK — Jarvis revenue safety validated');
  console.log(`  Real row ${REAL_STRIPE_ROW}: $${(EXPECTED_CENTS / 100).toFixed(2)} counted once`);
  console.log(`  Repair row ${REPAIR_ROW}: excluded from cash revenue`);
  console.log(`  summarizePayments grossCents=${summary.grossCents} paymentCount=${summary.paymentCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
