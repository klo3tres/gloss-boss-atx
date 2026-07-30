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
  const email = `gbqa-manual-${suffix}@example.net`;
  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let customerId = '';
  let appointmentId = '';
  const paymentIds = [];

  try {
    const customer = await admin
      .from('customers')
      .insert({ email, full_name: 'Gloss Boss Manual Payment QA', is_test: true, qa_expires_at: expires })
      .select('id')
      .maybeSingle();
    if (customer.error || !customer.data?.id) throw new Error(customer.error?.message || 'QA customer creation failed.');
    customerId = String(customer.data.id);

    const appointment = await admin
      .from('appointments')
      .insert({
        customer_id: customerId,
        guest_email: email,
        guest_name: 'Gloss Boss Manual Payment QA',
        access_token: token,
        status: 'confirmed',
        payment_status: 'pending',
        vehicle_description: 'Manual Payment QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        base_price_cents: 13000,
        deposit_percent: 30,
        deposit_amount_cents: 3900,
        balance_due_cents: 13000,
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

    const cashKey = `qa-manual-cash-${suffix}`;
    const cash = await admin.rpc('record_manual_payment_atomic', {
      p_appointment_id: appointmentId,
      p_amount_cents: 3900,
      p_tip_amount_cents: 100,
      p_method: 'cash',
      p_paid_at: new Date().toISOString(),
      p_reference_number: `CASH-${suffix}`,
      p_note: 'Controlled cash deposit with separate tip',
      p_attachment_url: '',
      p_receipt_requested: false,
      p_recorded_by: null,
      p_idempotency_key: cashKey,
    });
    if (cash.error) throw new Error(cash.error.message);
    const cashRow = Array.isArray(cash.data) ? cash.data[0] : cash.data;
    const cashPaymentId = String(cashRow?.payment_id || '');
    assert(cashPaymentId, 'Cash payment RPC did not return a payment ID.');
    paymentIds.push(cashPaymentId);

    const cashStored = await admin
      .from('payments')
      .select('amount_cents, applied_amount_cents, tip_amount_cents, payment_method, payment_kind, status')
      .eq('id', cashPaymentId)
      .maybeSingle();
    assert(!cashStored.error, cashStored.error?.message || 'Cash payment could not be read.');
    assert(cashStored.data?.amount_cents === 4000, 'Cash tender total did not preserve the $1.00 tip.');
    assert(cashStored.data?.applied_amount_cents === 3900, 'Cash principal was not exactly $39.00.');
    assert(cashStored.data?.tip_amount_cents === 100, 'Cash tip was not exactly $1.00.');

    const cashReplay = await admin.rpc('record_manual_payment_atomic', {
      p_appointment_id: appointmentId,
      p_amount_cents: 3900,
      p_tip_amount_cents: 100,
      p_method: 'cash',
      p_paid_at: new Date().toISOString(),
      p_reference_number: `CASH-${suffix}`,
      p_note: 'Idempotent replay',
      p_attachment_url: '',
      p_receipt_requested: false,
      p_recorded_by: null,
      p_idempotency_key: cashKey,
    });
    if (cashReplay.error) throw new Error(cashReplay.error.message);
    const replayRow = Array.isArray(cashReplay.data) ? cashReplay.data[0] : cashReplay.data;
    assert(String(replayRow?.payment_id || '') === cashPaymentId, 'Manual payment replay created a different payment.');

    const afterCash = await loadSummary(appointmentId, token);
    assert(afterCash.depositPaidCents === 3900, 'Cash deposit did not satisfy the canonical deposit.');
    assert(afterCash.totalPaidCents === 3900, 'The $1.00 tip incorrectly reduced the service balance.');
    assert(afterCash.balanceDueCents === 9100, 'Cash deposit left a balance other than $91.00.');

    const external = await admin.rpc('record_manual_payment_atomic', {
      p_appointment_id: appointmentId,
      p_amount_cents: 9100,
      p_tip_amount_cents: 0,
      p_method: 'external_card',
      p_paid_at: new Date().toISOString(),
      p_reference_number: `TERM-${suffix}`,
      p_note: 'Controlled external terminal balance',
      p_attachment_url: '',
      p_receipt_requested: false,
      p_recorded_by: null,
      p_idempotency_key: `qa-external-card-${suffix}`,
    });
    if (external.error) throw new Error(external.error.message);
    const externalRow = Array.isArray(external.data) ? external.data[0] : external.data;
    const externalPaymentId = String(externalRow?.payment_id || '');
    assert(externalPaymentId, 'External-card RPC did not return a payment ID.');
    paymentIds.push(externalPaymentId);

    const paid = await loadSummary(appointmentId, token);
    assert(paid.totalPaidCents === 13000, 'Manual and external principal did not total exactly $130.00.');
    assert(paid.balanceDueCents === 0, 'Manual and external payments did not clear the balance.');
    assert(paid.sessionState?.paidInFull === true, 'Manual and external payments did not resolve paid in full.');

    const paymentCount = await admin
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId);
    assert(paymentCount.count === 2, `Expected two payment rows, found ${paymentCount.count}.`);

    console.log(
      'Manual/external payment production QA passed: atomic cash deposit, separate tip, idempotent replay, external-card balance, canonical $91.00 remainder, and $130.00 paid-in-full state are operational.',
    );
  } finally {
    if (paymentIds.length) await admin.from('payments').delete().in('id', paymentIds);
    if (appointmentId) await admin.from('appointments').delete().eq('id', appointmentId);
    if (customerId) await admin.from('customers').delete().eq('id', customerId);
    await admin.from('customers').delete().eq('email', email);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
