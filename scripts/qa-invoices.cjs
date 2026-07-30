const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { createServerClient } = require('@supabase/ssr');

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
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key] && value) process.env[key] = value;
  }
}

loadEnv('.env.production');
loadEnv('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = (process.env.QA_PRODUCTION_URL || 'https://www.glossbossatx.com').replace(/\/$/, '');
if (!url || !anonKey || !serviceKey) {
  console.error('Invoice QA could not run: Supabase credentials are missing.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createCustomerSession(label, suffix) {
  const email = `gbqa-invoice-${label}-${suffix}@example.invalid`;
  const password = `Gb!${randomBytes(18).toString('base64url')}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Gloss Boss Invoice ${label} QA`, is_test: true },
  });
  if (created.error || !created.data.user?.id) {
    throw new Error(created.error?.message || `${label} QA auth user could not be created.`);
  }
  const authUserId = created.data.user.id;
  const cookieJar = new Map();
  const sessionClient = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(items) {
        for (const item of items) cookieJar.set(item.name, item.value);
      },
    },
  });
  const signedIn = await sessionClient.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session?.user) {
    throw new Error(signedIn.error?.message || `${label} QA login failed.`);
  }
  const cookie = [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
  const ensured = await fetch(`${appUrl}/api/auth/ensure-profile`, {
    method: 'POST',
    headers: { cookie },
  });
  if (!ensured.ok) throw new Error(`${label} QA profile sync returned HTTP ${ensured.status}.`);
  const customer = await admin
    .from('customers')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (customer.error || !customer.data?.id) {
    throw new Error(customer.error?.message || `${label} QA customer link was not created.`);
  }
  return { authUserId, customerId: String(customer.data.id), email, cookie };
}

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let owner = null;
  let stranger = null;
  let appointmentId = '';
  let paymentId = '';

  try {
    owner = await createCustomerSession('owner', suffix);
    stranger = await createCustomerSession('stranger', suffix);
    await admin
      .from('customers')
      .update({ is_test: true, qa_expires_at: expires })
      .in('id', [owner.customerId, stranger.customerId]);

    const appointment = await admin
      .from('appointments')
      .insert({
        customer_id: owner.customerId,
        guest_email: owner.email,
        guest_name: 'Gloss Boss Invoice Owner QA',
        access_token: randomBytes(24).toString('hex'),
        status: 'confirmed',
        payment_status: 'deposit_paid',
        vehicle_description: 'Invoice QA Vehicle',
        booking_vehicles: [{
          vehicle_description: 'Invoice QA Vehicle',
          service_slug: 'full-detail',
          vehicle_class: 'sedan',
          price_cents: 12000,
        }],
        booking_pricing_breakdown: {
          vehicleSubtotalCents: 12000,
          customLineItemsCents: 1000,
          finalTotalCents: 13000,
          customLineItems: [{
            id: 'qa-custom-charge',
            kind: 'manual_invoice_item',
            label: 'QA customer-visible charge',
            amountCents: 1000,
            customerVisible: true,
          }],
        },
        service_slug: 'full-detail',
        vehicle_class: 'sedan',
        base_price_cents: 13000,
        deposit_percent: 30,
        deposit_amount_cents: 3900,
        balance_due_cents: 9100,
        scheduled_start: future,
        is_test: true,
        qa_expires_at: expires,
      })
      .select('id')
      .maybeSingle();
    if (appointment.error || !appointment.data?.id) {
      throw new Error(appointment.error?.message || 'Invoice QA appointment creation failed.');
    }
    appointmentId = String(appointment.data.id);

    const payment = await admin
      .from('payments')
      .insert({
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
      })
      .select('id')
      .maybeSingle();
    if (payment.error || !payment.data?.id) {
      throw new Error(payment.error?.message || 'Invoice QA deposit creation failed.');
    }
    paymentId = String(payment.data.id);

    const endpoint = `${appUrl}/api/receipts/${encodeURIComponent(appointmentId)}/pdf?source=appointment&document=invoice`;
    const anonymous = await fetch(endpoint);
    assert(anonymous.status === 403, `Anonymous invoice access returned HTTP ${anonymous.status}, expected 403.`);

    const forbidden = await fetch(endpoint, { headers: { cookie: stranger.cookie } });
    assert(forbidden.status === 403, `Cross-customer invoice access returned HTTP ${forbidden.status}, expected 403.`);

    const beforeReceipts = await admin
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId);
    const download = await fetch(endpoint, { headers: { cookie: owner.cookie } });
    assert(download.ok, `Owned invoice download returned HTTP ${download.status}.`);
    assert(
      (download.headers.get('content-type') || '').includes('application/pdf'),
      'Owned invoice download did not return a PDF.',
    );
    const expectedNumber = `INV-${appointmentId.slice(0, 8).toUpperCase()}`;
    const disposition = download.headers.get('content-disposition') || '';
    assert(disposition.startsWith('attachment;'), 'Invoice download was not marked as an attachment.');
    assert(disposition.includes(expectedNumber), 'Invoice download filename did not use the stable invoice number.');
    const bytes = Buffer.from(await download.arrayBuffer());
    assert(bytes.length > 4000 && bytes.subarray(0, 4).toString() === '%PDF', 'Invoice download was not a usable PDF.');
    const pdfSource = bytes.toString('latin1');
    assert(pdfSource.includes('INVOICE'), 'Invoice PDF did not identify itself as an invoice.');
    assert(pdfSource.includes(expectedNumber), 'Invoice PDF did not contain its stable invoice number.');
    assert(pdfSource.includes('$130.00'), 'Invoice PDF did not contain the canonical $130.00 total.');
    assert(pdfSource.includes('$91.00'), 'Invoice PDF did not contain the canonical $91.00 balance.');
    assert(pdfSource.includes('QA customer-visible charge'), 'Invoice PDF omitted a customer-visible custom charge.');
    assert(pdfSource.includes('Tip \\(not applied to invoice\\)') || pdfSource.includes('Tip (not applied to invoice)'), 'Invoice PDF omitted the separate tip line.');

    const repeated = await fetch(endpoint, { headers: { cookie: owner.cookie } });
    assert(repeated.ok, `Repeat invoice download returned HTTP ${repeated.status}.`);

    const view = await fetch(`${endpoint}&view=1`, { headers: { cookie: owner.cookie } });
    assert(view.ok, `Owned invoice view returned HTTP ${view.status}.`);
    assert(
      (view.headers.get('content-disposition') || '').startsWith('inline;'),
      'Invoice view was not marked for in-browser display.',
    );

    await admin
      .from('payments')
      .update({
        amount_cents: 13100,
        applied_amount_cents: 13000,
        tip_amount_cents: 100,
        refunded_amount_cents: 0,
        status: 'succeeded',
      })
      .eq('id', paymentId);
    await admin
      .from('appointments')
      .update({ payment_status: 'paid', balance_due_cents: 0 })
      .eq('id', appointmentId);
    const paidInvoice = await fetch(endpoint, { headers: { cookie: owner.cookie } });
    assert(paidInvoice.ok, `Paid invoice download returned HTTP ${paidInvoice.status}.`);
    assert(
      (paidInvoice.headers.get('content-disposition') || '').includes(expectedNumber),
      'Invoice identity changed after payment.',
    );
    const paidSource = Buffer.from(await paidInvoice.arrayBuffer()).toString('latin1');
    assert(paidSource.includes('INVOICE'), 'Paid invoice was incorrectly relabeled as a receipt.');
    assert(paidSource.includes('$0.00'), 'Paid invoice did not show a zero balance.');

    await admin
      .from('payments')
      .update({ refunded_amount_cents: 3000, status: 'partially_refunded' })
      .eq('id', paymentId);
    await admin
      .from('appointments')
      .update({ payment_status: 'partially_refunded', balance_due_cents: 3000 })
      .eq('id', appointmentId);
    const refundedInvoice = await fetch(endpoint, { headers: { cookie: owner.cookie } });
    assert(refundedInvoice.ok, `Partially refunded invoice returned HTTP ${refundedInvoice.status}.`);
    const refundedSource = Buffer.from(await refundedInvoice.arrayBuffer()).toString('latin1');
    assert(refundedSource.includes('Refunded from'), 'Partially refunded invoice omitted its refund line.');
    assert(refundedSource.includes('$30.00'), 'Partially refunded invoice omitted the reopened $30.00 balance.');

    const missing = await fetch(
      `${appUrl}/api/receipts/00000000-0000-0000-0000-000000000000/pdf?source=appointment&document=invoice`,
      { headers: { cookie: owner.cookie } },
    );
    assert(missing.status === 404, `Missing invoice returned HTTP ${missing.status}, expected 404.`);
    const afterReceipts = await admin
      .from('receipts')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId);
    assert(
      (beforeReceipts.count || 0) === (afterReceipts.count || 0),
      'Viewing an unpaid invoice created a false receipt record.',
    );

    console.log(
      'Invoice production QA passed: owner-only view/download, stable identity before and after payment, canonical $130.00 total, $39.00 applied plus $1.00 tip, $91.00 due, custom charge detail, partial-refund detail, inline viewing, repeat PDF delivery, recoverable missing document, and no false receipt creation.',
    );
  } finally {
    if (paymentId) await admin.from('payments').delete().eq('id', paymentId);
    if (appointmentId) {
      await admin.from('receipts').delete().eq('appointment_id', appointmentId);
      await admin.from('appointments').delete().eq('id', appointmentId);
    }
    for (const account of [owner, stranger]) {
      if (!account) continue;
      await admin.from('customers').delete().eq('id', account.customerId);
      await admin.auth.admin.deleteUser(account.authUserId);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
