const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(__dirname, '..');
for (const file of ['.env.production', '.env.local']) {
  const fullPath = path.join(root, file);
  if (!fs.existsSync(fullPath)) continue;
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

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const token = randomBytes(24).toString('hex');
  const scheduled = new Date(Date.now() + 75 * 86400000);
  scheduled.setUTCHours(9, 17, 0, 0);
  const scheduledStart = scheduled.toISOString();
  const scheduledEnd = new Date(scheduled.getTime() + 180 * 60000).toISOString();
  const expires = new Date(Date.now() + 60 * 60000).toISOString();
  let appointmentId = '';
  const paymentIds = [];

  const summary = async () => {
    const response = await fetch(
      `${appUrl}/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!response.ok) {
      throw new Error(`Booking state returned HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
    }
    return response.json();
  };

  const updateAppointment = async (values) => {
    const result = await admin.from('appointments').update(values).eq('id', appointmentId);
    if (result.error) throw new Error(result.error.message);
  };

  const expectState = async (code, phrase) => {
    const state = await summary();
    assert(state.paymentStatus === code, `Expected ${code}, received ${state.paymentStatus}.`);
    assert(
      String(state.paymentStatusLabel || '').toLowerCase().includes(phrase),
      `${code} label did not contain "${phrase}".`,
    );
    return state;
  };

  try {
    const created = await admin.from('appointments').insert({
      guest_email: `gbqa-payment-status-${suffix}@example.net`,
      guest_name: 'Payment Status Reliability QA',
      access_token: token,
      status: 'confirmed',
      payment_status: 'awaiting_deposit',
      booking_vehicles: [{
        vehicle_description: 'Payment Status QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        price_cents: 13000,
      }],
      vehicle_description: 'Payment Status QA Vehicle',
      service_slug: 'full-detail',
      vehicle_class: 'sedan',
      base_price_cents: 13000,
      deposit_amount_cents: 3900,
      balance_due_cents: 13000,
      scheduled_start: scheduledStart,
      estimated_end: scheduledEnd,
      is_test: false,
      qa_expires_at: expires,
    }).select('id').maybeSingle();
    if (created.error || !created.data?.id) {
      throw new Error(created.error?.message || 'Payment status QA appointment creation failed.');
    }
    appointmentId = String(created.data.id);

    await expectState('deposit_due', 'deposit required');
    for (const [raw, expected, phrase, flag] of [
      ['payment_failed', 'failed', 'failed', 'paymentFailed'],
      ['payment_cancelled', 'cancelled', 'cancelled', 'paymentCancelled'],
      ['payment_expired', 'expired', 'expired', 'paymentExpired'],
      ['processing', 'processing', 'processing', null],
      ['pending', 'pending', 'pending', null],
    ]) {
      await updateAppointment({ payment_status: raw });
      const state = await expectState(expected, phrase);
      if (flag) assert(state.sessionState?.[flag] === true, `${flag} was not exposed to the recovery UI.`);
    }

    const firstPayment = await admin.from('payments').insert({
      appointment_id: appointmentId,
      amount_cents: 4000,
      applied_amount_cents: 3900,
      tip_amount_cents: 100,
      refunded_amount_cents: 0,
      status: 'succeeded',
      payment_method: 'external_card',
      payment_kind: 'deposit',
      provider: 'external',
      paid_at: new Date().toISOString(),
      is_test: true,
    }).select('id').maybeSingle();
    if (firstPayment.error || !firstPayment.data?.id) {
      throw new Error(firstPayment.error?.message || 'Payment status QA payment creation failed.');
    }
    paymentIds.push(String(firstPayment.data.id));
    await updateAppointment({ payment_status: 'deposit_paid', balance_due_cents: 9100 });
    await expectState('deposit_paid', 'deposit paid');

    await admin.from('payments').update({
      amount_cents: 13100,
      applied_amount_cents: 13000,
      tip_amount_cents: 100,
    }).eq('id', paymentIds[0]);
    await updateAppointment({ payment_status: 'deposit_paid', balance_due_cents: 0 });
    await expectState('paid', 'paid in full');

    await admin.from('payments').update({
      status: 'partially_refunded',
      refunded_amount_cents: 3000,
      refunded_at: new Date().toISOString(),
    }).eq('id', paymentIds[0]);
    await updateAppointment({ payment_status: 'partially_refunded', balance_due_cents: 3000 });
    await expectState('partially_refunded', 'partially refunded');

    await admin.from('payments').update({
      status: 'refunded',
      refunded_amount_cents: 13000,
      refunded_at: new Date().toISOString(),
    }).eq('id', paymentIds[0]);
    await updateAppointment({ payment_status: 'refunded', balance_due_cents: 13000 });
    await expectState('refunded', 'refunded');

    const blocksResponse = await fetch(
      `${appUrl}/api/public/booked-slots?from=${encodeURIComponent(new Date(scheduled.getTime() - 60000).toISOString())}&to=${encodeURIComponent(new Date(scheduled.getTime() + 86400000).toISOString())}`,
      { cache: 'no-store' },
    );
    const blocks = await blocksResponse.json();
    assert(
      Array.isArray(blocks.blocks) && blocks.blocks.some((block) => block.appointmentId === appointmentId),
      'A refunded but active appointment stopped blocking its reserved calendar slot.',
    );

    const repayment = await admin.from('payments').insert({
      appointment_id: appointmentId,
      amount_cents: 13000,
      applied_amount_cents: 13000,
      tip_amount_cents: 0,
      refunded_amount_cents: 0,
      status: 'succeeded',
      payment_method: 'external_card',
      payment_kind: 'balance',
      provider: 'external',
      paid_at: new Date().toISOString(),
      is_test: true,
    }).select('id').maybeSingle();
    if (repayment.error || !repayment.data?.id) {
      throw new Error(repayment.error?.message || 'Payment status QA repayment creation failed.');
    }
    paymentIds.push(String(repayment.data.id));
    await updateAppointment({ payment_status: 'refunded', balance_due_cents: 0 });
    await expectState('paid', 'paid in full');

    console.log(
      'Payment status production QA passed: deposit due, pending, processing, failed, cancelled, expired, deposit paid, paid, partial refund, full refund, repayment, recovery flags, and refunded appointment slot retention.',
    );
  } finally {
    if (paymentIds.length) await admin.from('payments').delete().in('id', paymentIds);
    if (appointmentId) await admin.from('appointments').delete().eq('id', appointmentId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
