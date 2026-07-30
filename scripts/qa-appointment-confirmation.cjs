const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.QA_PRODUCTION_URL || 'https://www.glossbossatx.com').replace(/\/$/, '');
if (!url || !anonKey || !serviceKey) process.exit(1);
const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const email = `gbqa-confirm-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}`;
  const token = randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  let authUserId = '';
  let appointmentId = '';
  let paymentId = '';
  let intakeId = '';

  try {
    const createdUser = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Confirmation Reliability QA', is_test: true },
    });
    if (createdUser.error || !createdUser.data.user?.id) {
      throw new Error(createdUser.error?.message || 'QA admin user could not be created.');
    }
    authUserId = createdUser.data.user.id;
    const cookieJar = new Map();
    const auth = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
        setAll: (items) => items.forEach((item) => cookieJar.set(item.name, item.value)),
      },
    });
    const signedIn = await auth.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error(signedIn.error.message);
    const cookie = [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    const ensured = await fetch(`${appUrl}/api/auth/ensure-profile`, { method: 'POST', headers: { cookie } });
    if (!ensured.ok) throw new Error(`Profile setup returned HTTP ${ensured.status}.`);
    const promoted = await admin.from('profiles').update({ role: 'super_admin' }).eq('id', authUserId);
    if (promoted.error) throw new Error(promoted.error.message);

    const created = await admin.from('appointments').insert({
      guest_email: email,
      guest_name: 'Confirmation Reliability QA',
      access_token: token,
      status: 'awaiting_payment',
      lifecycle_stage: 'approved',
      payment_status: 'awaiting_deposit',
      payment_choice: 'deposit',
      booking_vehicles: [{
        vehicle_description: 'Confirmation QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        price_cents: 13000,
      }],
      vehicle_description: 'Confirmation QA Vehicle',
      service_slug: 'full-detail',
      vehicle_class: 'sedan',
      base_price_cents: 13000,
      deposit_amount_cents: 3900,
      balance_due_cents: 13000,
      booking_pricing_breakdown: {
        serviceSubtotalCents: 13000,
        finalTotalCents: 13000,
        depositCents: 3900,
        depositRequiredCents: 3900,
      },
      scheduled_start: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      is_test: true,
      qa_expires_at: expires,
    }).select('id').maybeSingle();
    if (created.error || !created.data?.id) {
      throw new Error(created.error?.message || 'QA appointment could not be created.');
    }
    appointmentId = String(created.data.id);

    const confirmUrl = `${appUrl}/api/admin/appointments/${encodeURIComponent(appointmentId)}/confirm`;
    const confirm = (body = {}) => fetch(confirmUrl, {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let response = await confirm();
    let body = await response.json();
    assert(response.status === 409 && body.code === 'ACKNOWLEDGEMENT_REQUIRED', 'Unsigned booking was confirmable.');

    const intake = await admin.from('intake_submissions').insert({
      appointment_id: appointmentId,
      form_data: { deposit_legal_ack: true, qa: true },
    }).select('id').maybeSingle();
    if (intake.error || !intake.data?.id) throw new Error(intake.error?.message || 'QA acknowledgement failed.');
    intakeId = String(intake.data.id);

    response = await confirm();
    body = await response.json();
    assert(response.status === 409 && body.code === 'PAYMENT_REQUIRED', 'Unpaid deposit booking was confirmable.');

    response = await confirm({ overrideEligibility: true });
    assert(response.status === 400, 'Admin override did not require an audit reason.');

    const payment = await admin.from('payments').insert({
      appointment_id: appointmentId,
      amount_cents: 3900,
      applied_amount_cents: 3900,
      status: 'succeeded',
      payment_method: 'external_card',
      payment_kind: 'deposit',
      provider: 'external',
      paid_at: new Date().toISOString(),
      is_test: true,
    }).select('id').maybeSingle();
    if (payment.error || !payment.data?.id) throw new Error(payment.error?.message || 'QA deposit failed.');
    paymentId = String(payment.data.id);
    const paymentState = await admin.from('appointments').update({
      payment_status: 'deposit_paid',
      balance_due_cents: 9100,
    }).eq('id', appointmentId);
    if (paymentState.error) throw new Error(paymentState.error.message);

    response = await confirm();
    body = await response.json();
    assert(response.ok && body.ok, `Eligible confirmation failed: ${body.error || response.status}`);
    const firstEvents = await admin.from('work_order_transition_events')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .eq('to_stage', 'scheduled');

    response = await confirm();
    body = await response.json();
    assert(response.ok && body.ok && body.alreadyConfirmed, 'Repeat confirmation was not idempotent.');
    const secondEvents = await admin.from('work_order_transition_events')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .eq('to_stage', 'scheduled');
    assert((firstEvents.count || 0) === (secondEvents.count || 0), 'Repeat confirmation duplicated transition events.');

    const row = await admin.from('appointments').select('status, lifecycle_stage').eq('id', appointmentId).maybeSingle();
    assert(row.data?.status === 'confirmed' && row.data?.lifecycle_stage === 'scheduled', 'Canonical confirmed state was not stored.');
    const summaryResponse = await fetch(
      `${appUrl}/api/public/booking-confirmation?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    const summary = await summaryResponse.json();
    assert(summaryResponse.ok && summary.sessionState?.nextStep === 'confirmation', 'Customer did not resolve to confirmation.');

    const cancelled = await admin.from('appointments').update({
      status: 'cancelled',
      lifecycle_stage: 'cancelled',
    }).eq('id', appointmentId);
    if (cancelled.error) throw new Error(cancelled.error.message);
    response = await confirm();
    assert(response.status === 409, 'Cancelled appointment was confirmable.');

    console.log(
      'Appointment confirmation production QA passed: acknowledgement and payment gates, audited override guard, canonical confirmed state, customer confirmation resolution, repeat-call idempotency, and inactive-booking rejection.',
    );
  } finally {
    if (appointmentId) {
      await admin.from('work_order_transition_events').delete().eq('appointment_id', appointmentId);
      await admin.from('booking_availability_blocks').delete().eq('appointment_id', appointmentId);
    }
    if (paymentId) await admin.from('payments').delete().eq('id', paymentId);
    if (intakeId) await admin.from('intake_submissions').delete().eq('id', intakeId);
    if (appointmentId) await admin.from('appointments').delete().eq('id', appointmentId);
    if (authUserId) {
      await admin.from('customers').delete().eq('auth_user_id', authUserId);
      await admin.from('profiles').delete().eq('id', authUserId);
      await admin.auth.admin.deleteUser(authUserId);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
