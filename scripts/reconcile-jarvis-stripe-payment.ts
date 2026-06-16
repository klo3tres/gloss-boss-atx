/**
 * One-time reconcile: Jarvis Henderson $58.14 Stripe deposit.
 * Run: npx tsx scripts/reconcile-jarvis-stripe-payment.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { upsertMergedStripePayment } from '../src/lib/stripe-payment-resolve';

const APPOINTMENT_ID = 'c4e49bc9-4dd8-4f9c-a931-9879a20f57e3';
const SESSION_ID = 'cs_live_a1aIctW5zC7fgb5XdcR7PG2VYv3AgxkX4k7ujwXJnACAFPtqO456aJmuyx';
const PAYMENT_INTENT_ID = 'pi_3TXo00FYEug3QHN40B8FfwxV';
const AMOUNT_CENTS = 5814;
const ORPHAN_PAYMENT_ID = 'dbf0d651-68c1-47c2-995c-aaebdcde4a39';
const REPAIR_PAYMENT_ID = '9b393e70-a173-430f-b7e7-0a29309fb35f';

const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const { data: appt } = await admin.from('appointments').select('id, guest_email, customer_id, deposit_paid_at').eq('id', APPOINTMENT_ID).maybeSingle();
  if (!appt) throw new Error('Jarvis appointment not found');

  const paidAt =
    (appt as { deposit_paid_at?: string }).deposit_paid_at ??
    new Date('2026-05-16T19:32:40.780Z').toISOString();

  const result = await upsertMergedStripePayment(admin, null, {
    appointmentId: APPOINTMENT_ID,
    customerId: (appt as { customer_id?: string }).customer_id ?? null,
    amountCents: AMOUNT_CENTS,
    status: 'succeeded',
    paymentKind: 'deposit',
    stripeCheckoutSessionId: SESSION_ID,
    stripePaymentIntentId: PAYMENT_INTENT_ID,
    paidAt,
    email: (appt as { guest_email?: string }).guest_email ?? 'hendersonjarvis751@yahoo.com',
    source: 'jarvis_stripe_reconcile',
    matchReason: 'manual_reconcile_known_ids',
    metadata: {
      reconciled: true,
      original_orphan_payment_id: ORPHAN_PAYMENT_ID,
      original_repair_payment_id: REPAIR_PAYMENT_ID,
    },
  });

  console.log('Merge result:', result);

  const { data: payments } = await admin
    .from('payments')
    .select('id, appointment_id, amount_cents, stripe_payment_intent_id, stripe_checkout_session_id, exclude_from_revenue, status, metadata')
    .or(`appointment_id.eq.${APPOINTMENT_ID},id.eq.${ORPHAN_PAYMENT_ID},id.eq.${REPAIR_PAYMENT_ID},stripe_payment_intent_id.eq.${PAYMENT_INTENT_ID}`);

  console.log('\nPayments after reconcile:');
  for (const p of payments ?? []) {
    console.log(p);
  }

  const active = (payments ?? []).filter(
    (p) =>
      (p as { appointment_id?: string }).appointment_id === APPOINTMENT_ID &&
      (p as { exclude_from_revenue?: boolean }).exclude_from_revenue !== true &&
      (p as { status?: string }).status !== 'voided' &&
      (p as { amount_cents?: number }).amount_cents === AMOUNT_CENTS,
  );
  console.log(`\nActive $58.14 rows on Jarvis WO: ${active.length} (expect 1)`);
  if (active.length !== 1) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
