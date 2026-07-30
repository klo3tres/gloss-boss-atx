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
  const email = `gbqa-refund-${suffix}@example.net`;
  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let customerId = '';
  let appointmentId = '';
  let paymentId = '';
  const refundIds = [];

  try {
    const customer = await admin
      .from('customers')
      .insert({ email, full_name: 'Gloss Boss Refund QA', is_test: true, qa_expires_at: expires })
      .select('id')
      .maybeSingle();
    if (customer.error || !customer.data?.id) throw new Error(customer.error?.message || 'QA customer creation failed.');
    customerId = String(customer.data.id);

    const appointment = await admin
      .from('appointments')
      .insert({
        customer_id: customerId,
        guest_email: email,
        guest_name: 'Gloss Boss Refund QA',
        access_token: token,
        status: 'confirmed',
        payment_status: 'paid',
        vehicle_description: 'Refund QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        base_price_cents: 13000,
        deposit_percent: 30,
        deposit_amount_cents: 3900,
        balance_due_cents: 0,
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

    const payment = await admin
      .from('payments')
      .insert({
        appointment_id: appointmentId,
        customer_id: customerId,
        amount_cents: 13000,
        applied_amount_cents: 13000,
        tip_amount_cents: 0,
        status: 'succeeded',
        payment_method: 'external_card',
        payment_kind: 'manual',
        provider: 'external',
        paid_at: new Date().toISOString(),
        is_test: true,
      })
      .select('id')
      .maybeSingle();
    if (payment.error || !payment.data?.id) throw new Error(payment.error?.message || 'QA payment creation failed.');
    paymentId = String(payment.data.id);

    const paid = await loadSummary(appointmentId, token);
    assert(paid.totalPaidCents === 13000 && paid.balanceDueCents === 0, 'Initial payment was not paid in full.');

    const partialRefundId = `manual_refund_${suffix}_partial`;
    const partialRecord = await admin
      .from('payment_refunds')
      .insert({
        stripe_refund_id: partialRefundId,
        amount_cents: 3000,
        status: 'succeeded',
        appointment_id: appointmentId,
        customer_id: customerId,
        payload: { payment_id: paymentId, reason: 'Controlled partial refund' },
      })
      .select('id')
      .maybeSingle();
    if (partialRecord.error || !partialRecord.data?.id) {
      throw new Error(partialRecord.error?.message || 'Partial refund record failed.');
    }
    refundIds.push(String(partialRecord.data.id));
    const partialUpdate = await admin
      .from('payments')
      .update({
        refunded_amount_cents: 3000,
        refunded_at: null,
        status: 'partially_refunded',
      })
      .eq('id', paymentId);
    if (partialUpdate.error) throw new Error(partialUpdate.error.message);
    await admin
      .from('appointments')
      .update({ payment_status: 'partially_refunded', balance_due_cents: 3000 })
      .eq('id', appointmentId);

    const partial = await loadSummary(appointmentId, token);
    assert(partial.totalPaidCents === 10000, 'Partial refund did not leave exactly $100.00 collected.');
    assert(partial.balanceDueCents === 3000, 'Partial refund did not reopen exactly $30.00.');
    assert(partial.paymentStatus === 'partially_refunded', 'Partial refund status was not visible.');

    const fullRefundId = `manual_refund_${suffix}_remainder`;
    const fullRecord = await admin
      .from('payment_refunds')
      .insert({
        stripe_refund_id: fullRefundId,
        amount_cents: 10000,
        status: 'succeeded',
        appointment_id: appointmentId,
        customer_id: customerId,
        payload: { payment_id: paymentId, reason: 'Controlled refund remainder' },
      })
      .select('id')
      .maybeSingle();
    if (fullRecord.error || !fullRecord.data?.id) {
      throw new Error(fullRecord.error?.message || 'Full refund record failed.');
    }
    refundIds.push(String(fullRecord.data.id));
    const fullUpdate = await admin
      .from('payments')
      .update({
        refunded_amount_cents: 13000,
        refunded_at: new Date().toISOString(),
        status: 'refunded',
      })
      .eq('id', paymentId);
    if (fullUpdate.error) throw new Error(fullUpdate.error.message);
    await admin
      .from('appointments')
      .update({ payment_status: 'refunded', balance_due_cents: 13000 })
      .eq('id', appointmentId);

    const full = await loadSummary(appointmentId, token);
    assert(full.totalPaidCents === 0, 'Full refund left collected service principal.');
    assert(full.balanceDueCents === 13000, 'Full refund did not reopen the full $130.00 balance.');
    assert(full.paymentStatus === 'refunded', 'Full refund status was not visible.');

    console.log(
      'Refund production QA passed: $30.00 partial refund, $100.00 net collected, $30.00 reopened balance, cumulative $130.00 full refund, and refund records are operational.',
    );
  } finally {
    if (refundIds.length) await admin.from('payment_refunds').delete().in('id', refundIds);
    if (paymentId) await admin.from('payments').delete().eq('id', paymentId);
    if (appointmentId) await admin.from('appointments').delete().eq('id', appointmentId);
    if (customerId) await admin.from('customers').delete().eq('id', customerId);
    await admin.from('customers').delete().eq('email', email);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
