/**
 * End-to-end trace: Jarvis Henderson $58.14 Stripe payment.
 * Run: npx tsx scripts/trace-jarvis-stripe.ts
 */
import fs from 'fs';
import path from 'path';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const JARVIS_ID = 'c4e49bc9-4dd8-4f9c-a931-9879a20f57e3';
const TARGET_CENTS = 5814;

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

function section(title: string) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

async function main() {
  section('1. DATABASE — Jarvis appointment');
  const { data: appt, error: apptErr } = await admin.from('appointments').select('*').eq('id', JARVIS_ID).maybeSingle();
  if (apptErr || !appt) {
    console.error('Appointment load failed:', apptErr?.message ?? 'not found');
    process.exit(1);
  }
  const a = appt as Record<string, unknown>;
  console.log({
    id: a.id,
    guest_name: a.guest_name,
    guest_email: a.guest_email,
    customer_id: a.customer_id,
    status: a.status,
    payment_status: a.payment_status,
    deposit_amount_cents: a.deposit_amount_cents,
    stripe_checkout_session_id: a.stripe_checkout_session_id,
    stripe_payment_intent_id: a.stripe_payment_intent_id,
    final_payment_checkout_session_id: a.final_payment_checkout_session_id,
    created_at: a.created_at,
    deposit_paid_at: a.deposit_paid_at,
  });

  section('2. DATABASE — payments linked to Jarvis');
  const { data: payments } = await admin.from('payments').select('*').eq('appointment_id', JARVIS_ID);
  console.log(`Count: ${payments?.length ?? 0}`);
  for (const p of payments ?? []) {
    const row = p as Record<string, unknown>;
    console.log({
      id: row.id,
      amount_cents: row.amount_cents,
      status: row.status,
      payment_method: row.payment_method,
      payment_kind: row.payment_kind,
      stripe_checkout_session_id: row.stripe_checkout_session_id,
      stripe_payment_intent_id: row.stripe_payment_intent_id,
      stripe_charge_id: row.stripe_charge_id,
      exclude_from_revenue: row.exclude_from_revenue,
      metadata: row.metadata,
      paid_at: row.paid_at,
      created_at: row.created_at,
    });
  }

  section('3. DATABASE — payments by Stripe IDs on appointment');
  const sessionId = String(a.stripe_checkout_session_id ?? a.final_payment_checkout_session_id ?? '').trim();
  const piOnAppt = String(a.stripe_payment_intent_id ?? '').trim();
  if (sessionId) {
    const { data: bySession } = await admin.from('payments').select('id, appointment_id, amount_cents, stripe_payment_intent_id').eq('stripe_checkout_session_id', sessionId);
    console.log('payments.stripe_checkout_session_id match:', bySession);
  }
  if (piOnAppt) {
    const { data: byPi } = await admin.from('payments').select('id, appointment_id, amount_cents').eq('stripe_payment_intent_id', piOnAppt);
    console.log('payments.stripe_payment_intent_id match:', byPi);
  }

  section('4. DATABASE — orphan $58.14 payments (any appointment)');
  const { data: orphan5814 } = await admin
    .from('payments')
    .select('id, appointment_id, amount_cents, status, stripe_checkout_session_id, stripe_payment_intent_id, metadata')
    .eq('amount_cents', TARGET_CENTS)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log(orphan5814);

  section('5. DATABASE — payment_debug + notification_outbox');
  const { data: debugEvents } = await admin
    .from('payment_debug_events')
    .select('*')
    .or(`appointment_id.eq.${JARVIS_ID},customer_email.ilike.%jarvis%`)
    .order('created_at', { ascending: false })
    .limit(30);
  console.log('payment_debug_events:', debugEvents?.length ?? 0);
  for (const e of debugEvents ?? []) {
    const row = e as Record<string, unknown>;
    console.log({ event_type: row.event_type, error: row.error_message, metadata: row.metadata, created_at: row.created_at });
  }

  const { data: outbox } = await admin
    .from('notification_outbox')
    .select('kind, status, error_message, payload, created_at')
    .eq('appointment_id', JARVIS_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  console.log('notification_outbox for Jarvis:', outbox);

  const { data: stripeOutbox } = await admin
    .from('notification_outbox')
    .select('kind, status, payload, created_at')
    .in('kind', ['stripe_webhook_received', 'stripe_webhook_failed', 'stripe_payment_automated', 'stripe_payment_unmatched'])
    .order('created_at', { ascending: false })
    .limit(30);
  console.log('Recent stripe webhook outbox (global):', stripeOutbox?.slice(0, 10));

  section('6. STRIPE API — retrieve objects');
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    console.log('BLOCKER: STRIPE_SECRET_KEY not set in .env.local');
    return;
  }
  const mode = secretKey.startsWith('sk_live') ? 'live' : secretKey.startsWith('sk_test') ? 'test' : 'unknown';
  console.log('Stripe key mode:', mode);

  const stripe = new Stripe(secretKey);
  let sessionObj: Stripe.Checkout.Session | null = null;
  let paymentIntent: Stripe.PaymentIntent | null = null;
  let charge: Stripe.Charge | null = null;

  if (sessionId) {
    try {
      sessionObj = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['payment_intent', 'payment_intent.latest_charge'] });
      console.log('\nCheckout Session:', sessionObj.id);
      console.log('  amount_total:', sessionObj.amount_total);
      console.log('  payment_status:', sessionObj.payment_status);
      console.log('  status:', sessionObj.status);
      console.log('  metadata:', JSON.stringify(sessionObj.metadata, null, 2));
      console.log('  customer_email:', sessionObj.customer_email ?? sessionObj.customer_details?.email);
      const pi = sessionObj.payment_intent;
      if (typeof pi === 'object' && pi) {
        paymentIntent = pi as Stripe.PaymentIntent;
        console.log('\nPaymentIntent (from session):', paymentIntent.id);
        console.log('  amount:', paymentIntent.amount);
        console.log('  amount_received:', paymentIntent.amount_received);
        console.log('  status:', paymentIntent.status);
        console.log('  metadata:', JSON.stringify(paymentIntent.metadata, null, 2));
        const lc = paymentIntent.latest_charge;
        if (typeof lc === 'object' && lc) {
          charge = lc as Stripe.Charge;
        }
      }
    } catch (e) {
      console.log('Session retrieve FAILED:', e instanceof Error ? e.message : e);
      if (mode === 'test') console.log('  ^ Likely live payment invisible with test key');
    }
  } else {
    console.log('No stripe_checkout_session_id on appointment — cannot retrieve session directly');
  }

  if (!paymentIntent && piOnAppt) {
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(piOnAppt, { expand: ['latest_charge'] });
      console.log('\nPaymentIntent (from appointment):', paymentIntent.id);
      console.log('  metadata:', JSON.stringify(paymentIntent.metadata, null, 2));
    } catch (e) {
      console.log('PI retrieve failed:', e instanceof Error ? e.message : e);
    }
  }

  if (!charge && !sessionId) {
    console.log('\nScanning Stripe charges for $58.14...');
    try {
      const charges = await stripe.charges.list({ limit: 100 });
      const matches = charges.data.filter((c) => c.amount === TARGET_CENTS && c.status === 'succeeded');
      console.log(`Found ${matches.length} succeeded charge(s) at ${TARGET_CENTS} cents`);
      for (const c of matches) {
        console.log({
          id: c.id,
          email: c.billing_details?.email,
          created: new Date(c.created * 1000).toISOString(),
          payment_intent: typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent?.id,
          metadata: c.metadata,
        });
        if (!charge) charge = c;
        if (!paymentIntent && typeof c.payment_intent === 'string') {
          paymentIntent = await stripe.paymentIntents.retrieve(c.payment_intent).catch(() => null);
        }
      }
    } catch (e) {
      console.log('Charge scan failed:', e instanceof Error ? e.message : e);
    }
  }

  if (charge) {
    console.log('\nCharge:', charge.id);
    console.log('  metadata:', JSON.stringify(charge.metadata, null, 2));
    const bt = charge.balance_transaction;
    if (typeof bt === 'string') {
      try {
        const tx = await stripe.balanceTransactions.retrieve(bt);
        console.log('\nBalance Transaction:', tx.id, 'net:', tx.net, 'fee:', tx.fee);
      } catch {
        /* */
      }
    }
  }

  section('7. ROOT CAUSE ANALYSIS');
  const hasMetadataApptId = sessionObj?.metadata?.appointment_id === JARVIS_ID;
  const sessionOnAppt = sessionId && sessionObj?.id === sessionId;
  const dbPaymentWithStripeIds = (payments ?? []).some(
    (p) => (p as { stripe_payment_intent_id?: string }).stripe_payment_intent_id || (p as { stripe_checkout_session_id?: string }).stripe_checkout_session_id,
  );
  const repairOnlyPayment = (payments ?? []).some(
    (p) => String((p as { metadata?: { source?: string } }).metadata?.source ?? '').includes('repair'),
  );

  console.log({
    webhook_would_match_by_metadata: hasMetadataApptId,
    appointment_has_session_id: Boolean(sessionId),
    session_retrieved_from_stripe: Boolean(sessionObj),
    stripe_metadata_appointment_id: sessionObj?.metadata?.appointment_id ?? paymentIntent?.metadata?.appointment_id ?? charge?.metadata?.appointment_id ?? null,
    stripe_metadata_fallback_id: sessionObj?.metadata?.fallback_booking_id ?? null,
    db_payment_has_stripe_ids: dbPaymentWithStripeIds,
    db_payment_from_manual_repair_script: repairOnlyPayment,
    automateStripePayment_would_match:
      hasMetadataApptId ||
      sessionOnAppt ||
      Boolean(sessionId && sessionObj) ||
      false,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
