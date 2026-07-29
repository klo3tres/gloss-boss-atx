const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
function loadEnv(file) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) return;
  for (const rawLine of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) value = value.slice(1, -1);
    if (!process.env[key] && value) process.env[key] = value;
  }
}
loadEnv('.env.production');
loadEnv('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.QA_PRODUCTION_URL || 'https://www.glossbossatx.com').replace(/\/$/, '');
if (!url || !serviceKey) process.exit(1);
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function loadSummary(appointmentId, token) {
  const response = await fetch(
    `${appUrl}/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
  );
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Booking state returned HTTP ${response.status}.`);
  return body;
}

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const email = `gbqa-deposit-${suffix}@example.net`;
  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let customerId = '';
  let appointmentId = '';
  const paymentIds = [];

  try {
    const customer = await admin
      .from('customers')
      .insert({
        email,
        full_name: 'Gloss Boss Deposit QA',
        is_test: true,
        qa_expires_at: expires,
      })
      .select('id')
      .maybeSingle();
    if (customer.error || !customer.data?.id) throw new Error(customer.error?.message || 'QA customer creation failed.');
    customerId = String(customer.data.id);

    const appointment = await admin
      .from('appointments')
      .insert({
        customer_id: customerId,
        guest_email: email,
        guest_name: 'Gloss Boss Deposit QA',
        access_token: token,
        status: 'awaiting_payment',
        payment_status: 'pending',
        payment_choice: 'deposit',
        vehicle_description: 'Deposit QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        base_price_cents: 13000,
        deposit_percent: 30,
        deposit_amount_cents: 3900,
        scheduled_start: future,
        is_test: true,
        qa_expires_at: expires,
      })
      .select('id')
      .maybeSingle();
    if (appointment.error || !appointment.data?.id) {
      throw new Error(appointment.error?.message || 'QA appointment creation failed.');
    }
    appointmentId = String(appointment.data.id);

    const unsigned = await loadSummary(appointmentId, token);
    assert(unsigned.sessionState?.nextStep === 'acknowledgement', 'Unsigned booking did not resolve acknowledgment first.');
    assert(unsigned.depositCents === 3900, 'Canonical deposit was not $39.00.');
    assert(unsigned.depositDueCents === 3900, 'Initial amount due was not the full $39.00 deposit.');

    const signedResponse = await fetch(`${appUrl}/api/agreements/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId,
        accessToken: token,
        signerLegalName: 'Gloss Boss Deposit QA',
        signatureType: 'typed',
        signatureData: 'Gloss Boss Deposit QA',
        acknowledged: true,
        marketingMediaConsent: false,
        smsConsent: false,
      }),
    });
    const signedBody = await signedResponse.json().catch(() => ({}));
    if (!signedResponse.ok) throw new Error(signedBody.error || `Agreement signing returned HTTP ${signedResponse.status}.`);

    const awaitingPayment = await loadSummary(appointmentId, token);
    assert(awaitingPayment.sessionState?.nextStep === 'payment', 'Signed booking did not resolve payment next.');

    const partial = await admin
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        customer_id: customerId,
        amount_cents: 1000,
        status: 'succeeded',
        payment_method: 'stripe',
        payment_kind: 'deposit',
        provider: 'stripe',
        stripe_checkout_session_id: `cs_test_partial_${suffix}`,
        paid_at: new Date().toISOString(),
        is_test: true,
      })
      .select('id')
      .maybeSingle();
    if (partial.error || !partial.data?.id) throw new Error(partial.error?.message || 'Partial deposit fixture failed.');
    paymentIds.push(String(partial.data.id));

    const partialState = await loadSummary(appointmentId, token);
    assert(partialState.depositPaidCents === 1000, 'Partial deposit paid amount was not visible.');
    assert(partialState.depositDueCents === 2900, 'Partial deposit did not leave exactly $29.00 due.');
    assert(partialState.sessionState?.nextStep === 'payment', 'Partial deposit incorrectly completed payment.');

    const checkout = await fetch(`${appUrl}/api/stripe/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, accessToken: token, paymentChoice: 'deposit' }),
    });
    const checkoutBody = await checkout.json().catch(() => ({}));
    const protectedLiveMode =
      checkout.status === 409 && checkoutBody.code === 'QA_REQUIRES_STRIPE_TEST_MODE';
    const testCheckoutCreated = checkout.ok && checkoutBody.ok === true && /^https:\/\//.test(String(checkoutBody.url || ''));
    assert(
      protectedLiveMode || testCheckoutCreated,
      checkoutBody.error || `Controlled checkout returned HTTP ${checkout.status}.`,
    );

    const remainder = await admin
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        customer_id: customerId,
        amount_cents: 2900,
        status: 'succeeded',
        payment_method: 'stripe',
        payment_kind: 'deposit',
        provider: 'stripe',
        stripe_checkout_session_id: `cs_test_remainder_${suffix}`,
        paid_at: new Date().toISOString(),
        is_test: true,
      })
      .select('id')
      .maybeSingle();
    if (remainder.error || !remainder.data?.id) throw new Error(remainder.error?.message || 'Deposit remainder fixture failed.');
    paymentIds.push(String(remainder.data.id));

    const complete = await loadSummary(appointmentId, token);
    assert(complete.depositPaidCents === 3900, 'Completed deposit was not exactly $39.00.');
    assert(complete.depositDueCents === 0, 'Completed deposit still showed an amount due.');
    assert(complete.sessionState?.nextStep === 'confirmation', 'Completed deposit did not resolve confirmation.');
    assert(complete.balanceDueCents === 9100, 'Post-deposit balance was not exactly $91.00.');

    const balanceCheckout = await fetch(`${appUrl}/api/stripe/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId, accessToken: token, paymentChoice: 'full' }),
    });
    const balanceCheckoutBody = await balanceCheckout.json().catch(() => ({}));
    const balanceProtectedLiveMode =
      balanceCheckout.status === 409 && balanceCheckoutBody.code === 'QA_REQUIRES_STRIPE_TEST_MODE';
    const balanceTestCheckoutCreated =
      balanceCheckout.ok &&
      balanceCheckoutBody.ok === true &&
      /^https:\/\//.test(String(balanceCheckoutBody.url || ''));
    assert(
      balanceProtectedLiveMode || balanceTestCheckoutCreated,
      balanceCheckoutBody.error || `Controlled balance checkout returned HTTP ${balanceCheckout.status}.`,
    );

    const fakeBalanceUrl = `https://example.com/gbqa-balance-${suffix}`;
    const linkUpdate = await admin
      .from('appointments')
      .update({
        final_payment_url: fakeBalanceUrl,
        balance_due_cents: 9100,
      })
      .eq('id', appointmentId);
    if (linkUpdate.error) throw new Error(linkUpdate.error.message);

    for (let clickIndex = 0; clickIndex < 2; clickIndex++) {
      const tracked = await fetch(
        `${appUrl}/pay/balance/${encodeURIComponent(appointmentId)}?t=${encodeURIComponent(token)}`,
        { redirect: 'manual' },
      );
      assert(
        [302, 303, 307, 308].includes(tracked.status),
        `Tracked balance link click ${clickIndex + 1} returned HTTP ${tracked.status} instead of redirecting.`,
      );
      assert(
        tracked.headers.get('location') === fakeBalanceUrl,
        `Tracked balance link click ${clickIndex + 1} did not preserve the secure payment destination.`,
      );
    }

    const finalBalance = await admin
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        customer_id: customerId,
        amount_cents: 9100,
        status: 'succeeded',
        payment_method: 'stripe',
        payment_kind: 'customer_final_balance',
        provider: 'stripe',
        stripe_checkout_session_id: `cs_test_balance_${suffix}`,
        paid_at: new Date().toISOString(),
        is_test: true,
      })
      .select('id')
      .maybeSingle();
    if (finalBalance.error || !finalBalance.data?.id) {
      throw new Error(finalBalance.error?.message || 'Final balance fixture failed.');
    }
    paymentIds.push(String(finalBalance.data.id));

    const paidInFull = await loadSummary(appointmentId, token);
    assert(paidInFull.totalPaidCents === 13000, 'Paid-in-full total was not exactly $130.00.');
    assert(paidInFull.balanceDueCents === 0, 'Paid-in-full booking still showed a balance.');
    assert(paidInFull.sessionState?.paidInFull === true, 'Paid-in-full state did not resolve.');

    console.log(
      `Customer payment production QA passed: acknowledgment → $39.00 deposit, $10.00 partial → $29.00 due, $91.00 final balance, repeat-safe tracked links, protected ${protectedLiveMode && balanceProtectedLiveMode ? 'live' : 'test'} Stripe checkout, and $130.00 paid-in-full state are operational.`,
    );
  } finally {
    if (paymentIds.length) await admin.from('payments').delete().in('id', paymentIds);
    if (appointmentId) {
      await admin.from('job_agreements').delete().eq('appointment_id', appointmentId);
      await admin.from('signed_agreements').delete().eq('appointment_id', appointmentId);
      await admin.from('appointments').delete().eq('id', appointmentId);
    }
    if (customerId) await admin.from('customers').delete().eq('id', customerId);
    await admin.from('customers').delete().eq('email', email);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
