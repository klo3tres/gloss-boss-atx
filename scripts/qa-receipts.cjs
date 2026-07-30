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

async function account(label, suffix) {
  const email = `gbqa-receipt-${label}-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Receipt ${label} QA`, is_test: true },
  });
  if (created.error || !created.data.user?.id) {
    throw new Error(created.error?.message || `${label} auth creation failed.`);
  }
  const authUserId = created.data.user.id;
  const cookieJar = new Map();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...cookieJar.entries()].map(([name, value]) => ({ name, value })),
      setAll: (items) => items.forEach((item) => cookieJar.set(item.name, item.value)),
    },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(signIn.error.message);
  const cookie = [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  const ensured = await fetch(`${appUrl}/api/auth/ensure-profile`, {
    method: 'POST',
    headers: { cookie },
  });
  if (!ensured.ok) throw new Error(`${label} profile sync returned HTTP ${ensured.status}.`);
  const customer = await admin.from('customers').select('id').eq('auth_user_id', authUserId).maybeSingle();
  if (customer.error || !customer.data?.id) throw new Error(customer.error?.message || 'Customer link missing.');
  return { authUserId, customerId: String(customer.data.id), email, cookie };
}

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const receiptNumber = `RCPT-QA-${suffix.slice(-10).toUpperCase()}`;
  let owner = null;
  let stranger = null;
  let appointmentId = '';
  let paymentId = '';
  let receiptId = '';

  try {
    owner = await account('owner', suffix);
    stranger = await account('stranger', suffix);
    await admin.from('customers').update({ is_test: true, qa_expires_at: expires }).in(
      'id',
      [owner.customerId, stranger.customerId],
    );

    const appointment = await admin.from('appointments').insert({
      customer_id: owner.customerId,
      guest_email: owner.email,
      guest_name: 'Receipt Owner QA',
      access_token: randomBytes(24).toString('hex'),
      status: 'confirmed',
      payment_status: 'deposit_paid',
      booking_vehicles: [{
        vehicle_description: 'Receipt QA Vehicle',
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        price_cents: 13000,
      }],
      vehicle_description: 'Receipt QA Vehicle',
      service_slug: 'full-detail',
      vehicle_class: 'sedan',
      base_price_cents: 13000,
      deposit_amount_cents: 3900,
      balance_due_cents: 9100,
      scheduled_start: new Date(Date.now() + 7 * 86400000).toISOString(),
      is_test: true,
      qa_expires_at: expires,
    }).select('id').maybeSingle();
    if (appointment.error || !appointment.data?.id) {
      throw new Error(appointment.error?.message || 'Receipt appointment creation failed.');
    }
    appointmentId = String(appointment.data.id);

    const payment = await admin.from('payments').insert({
      appointment_id: appointmentId,
      customer_id: owner.customerId,
      amount_cents: 4000,
      applied_amount_cents: 3900,
      tip_amount_cents: 100,
      status: 'succeeded',
      payment_method: 'external_card',
      payment_kind: 'deposit',
      provider: 'external',
      paid_at: new Date().toISOString(),
      is_test: true,
    }).select('id').maybeSingle();
    if (payment.error || !payment.data?.id) throw new Error(payment.error?.message || 'Receipt payment failed.');
    paymentId = String(payment.data.id);

    const receipt = await admin.from('receipts').insert({
      appointment_id: appointmentId,
      customer_id: owner.customerId,
      payment_id: paymentId,
      receipt_number: receiptNumber,
      amount_cents: 4000,
      payment_method: 'external_card',
      status: 'issued',
      paid_at: new Date().toISOString(),
      metadata: { source: 'qa_receipt' },
    }).select('id').maybeSingle();
    if (receipt.error || !receipt.data?.id) throw new Error(receipt.error?.message || 'Receipt record creation failed.');
    receiptId = String(receipt.data.id);

    const endpoint = `${appUrl}/api/receipts/${encodeURIComponent(receiptId)}/pdf?document=receipt`;
    assert((await fetch(endpoint)).status === 403, 'Anonymous receipt access was not rejected.');
    assert(
      (await fetch(endpoint, { headers: { cookie: stranger.cookie } })).status === 403,
      'Cross-customer receipt access was not rejected.',
    );

    const before = await admin.from('receipts').select('id', { count: 'exact', head: true }).eq('appointment_id', appointmentId);
    const download = await fetch(endpoint, { headers: { cookie: owner.cookie } });
    if (!download.ok) throw new Error(`Owned receipt returned HTTP ${download.status}: ${(await download.text()).slice(0, 200)}`);
    assert((download.headers.get('content-type') || '').includes('application/pdf'), 'Receipt was not a PDF.');
    const disposition = download.headers.get('content-disposition') || '';
    assert(disposition.startsWith('attachment;') && disposition.includes(receiptNumber), 'Receipt filename was unstable.');
    const bytes = Buffer.from(await download.arrayBuffer());
    assert(bytes.length > 4000 && bytes.subarray(0, 4).toString() === '%PDF', 'Receipt PDF was unusable.');
    const source = bytes.toString('latin1');
    assert(source.includes('RECEIPT'), 'Deposit receipt was incorrectly relabeled as an invoice.');
    assert(source.includes(receiptNumber), 'Receipt number was missing from the PDF.');
    assert(source.includes('Payment documented by this receipt'), 'Receipt-specific transaction amount was missing.');
    assert(source.includes('$40.00'), 'Receipt did not show the exact $40.00 tender.');
    assert(source.includes('$39.00'), 'Receipt did not show the $39.00 service principal.');
    assert(source.includes('$1.00'), 'Receipt did not show the separate $1.00 tip.');
    assert(source.includes('$91.00'), 'Receipt did not show the remaining $91.00 balance.');

    const view = await fetch(`${endpoint}&view=1`, { headers: { cookie: owner.cookie } });
    assert(view.ok && (view.headers.get('content-disposition') || '').startsWith('inline;'), 'Inline receipt view failed.');
    assert((await fetch(endpoint, { headers: { cookie: owner.cookie } })).ok, 'Repeat receipt download failed.');
    const after = await admin.from('receipts').select('id', { count: 'exact', head: true }).eq('appointment_id', appointmentId);
    assert((before.count || 0) === (after.count || 0), 'Receipt access created a duplicate receipt.');

    console.log(
      'Receipt production QA passed: owner-only inline view and repeat download, stable receipt identity, RECEIPT labeling with an unpaid balance, exact $40.00 tender / $39.00 applied / $1.00 tip / $91.00 due, and no duplicate receipt.',
    );
  } finally {
    if (receiptId) await admin.from('receipts').delete().eq('id', receiptId);
    if (paymentId) await admin.from('payments').delete().eq('id', paymentId);
    if (appointmentId) await admin.from('appointments').delete().eq('id', appointmentId);
    for (const value of [owner, stranger]) {
      if (!value) continue;
      await admin.from('customers').delete().eq('id', value.customerId);
      await admin.auth.admin.deleteUser(value.authUserId);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
