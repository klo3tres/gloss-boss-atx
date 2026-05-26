#!/usr/bin/env node
/**
 * FREE booking + core business flow — automated QA (API/DB).
 * Usage: node scripts/qa-free-flow.cjs [baseUrl]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] == null) process.env[key] = val;
  }
}

const base = process.argv[2] || 'http://localhost:3000';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const failures = [];

function fail(section, expected, actual, error, fix) {
  failures.push({ section, expected, actual, error, fix });
  console.log('\n--- FAIL:', section, '---');
  console.log('EXPECTED:', expected);
  console.log('ACTUAL:', actual);
  console.log('ERROR:', error);
  console.log('FIX PROMPT:', fix);
}

async function sb(pathSuffix, opts = {}) {
  const r = await fetch(`${url}/rest/v1/${pathSuffix}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || '',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { ok: r.ok, status: r.status, json, headers: r.headers };
}

function saturdaySlot(daysOut = 21) {
  const d = new Date();
  d.setDate(d.getDate() + daysOut);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  d.setHours(15, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  console.log('\n[qa-free-flow]', base, '\n');
  if (!url || !key) {
    fail('Setup', 'Supabase env present', 'Missing URL or service role key', 'ENOENT env', 'Set .env.local');
    process.exit(1);
  }

  // --- 1 Admin Promotions (DB + page source) ---
  const promoPageSrc = fs.readFileSync(path.join(root, 'src/app/(dashboard)/admin/promotions/page.tsx'), 'utf8');
  const freeSectionCount = (promoPageSrc.match(/FREE promo \(single control\)/g) || []).length;
  const enableFreeCheckboxCount = (promoPageSrc.match(/Enable FREE promo/g) || []).length;
  if (freeSectionCount !== 1 || enableFreeCheckboxCount !== 1) {
    fail(
      'Admin Promotions',
      'Exactly one FREE control section on promotions page',
      `freeSection=${freeSectionCount} enableCheckbox=${enableFreeCheckboxCount}`,
      'Duplicate FREE UI blocks in page.tsx',
      'Keep a single FreePromoSection; remove any legacy allow_free_test_promo toggle elsewhere.',
    );
  } else {
    console.log('PASS Admin: single FREE control in source');
  }

  // Enable FREE + save simulation via DB
  let freeRows = (await sb('promo_codes?code=eq.FREE&select=id,code,enabled,archived')).json;
  if (!Array.isArray(freeRows) || freeRows.length === 0) {
    await sb('promo_codes', {
      method: 'POST',
      body: JSON.stringify({
        code: 'FREE',
        description: 'QA FREE comp',
        enabled: true,
        discount_type: 'comp',
        discount_value: 100,
        rules: { appliesTo: 'order' },
      }),
      prefer: 'return=representation',
    });
    freeRows = (await sb('promo_codes?code=eq.FREE&select=id,code,enabled')).json;
  } else {
    const id = freeRows[0].id;
    await sb(`promo_codes?id=eq.${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: true, archived: false, archived_at: null, updated_at: new Date().toISOString() }),
      prefer: 'return=minimal',
    });
  }

  freeRows = (await sb('promo_codes?code=eq.FREE&select=enabled,archived')).json;
  const enabledAfterSave = freeRows?.[0]?.enabled === true && freeRows?.[0]?.archived !== true;
  if (!enabledAfterSave) {
    fail(
      'Admin Promotions',
      'FREE stays enabled after save/refresh',
      JSON.stringify(freeRows),
      'FREE row not enabled in promo_codes',
      'Fix savePromoCodeAction for FREE row; ensure enabled=true persists.',
    );
  } else {
    console.log('PASS Admin: FREE enabled in DB after save');
  }

  // --- 2 Booking ---
  let siteSettings;
  try {
    const r = await fetch(`${base}/api/public/site-settings`);
    siteSettings = await r.json();
  } catch (e) {
    fail('Booking', 'site-settings reachable', String(e), e.message, 'Start dev server: npm run dev');
  }

  if (siteSettings && siteSettings.allowFreeTestPromo !== true) {
    fail(
      'Booking',
      'site-settings allowFreeTestPromo true when FREE enabled (booking page hint)',
      `allowFreeTestPromo=${siteSettings.allowFreeTestPromo}`,
      'Public anon client cannot read promo_codes',
      'In site-settings/route.ts use tryCreateAdminSupabase() for isFreePromoEnabled(), not route public client first.',
    );
  }

  const promoRes = await fetch(`${base}/api/bookings/validate-promo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      promoCode: 'FREE',
      paymentChoice: 'full',
      lines: [{ serviceSlug: 'exterior-wash', vehicleClass: 'sedan', vehicleDescription: 'QA Sedan', vehicleColor: 'Black', addOnSlugs: [] }],
      addOns: [],
    }),
  });
  const promoJson = await promoRes.json();
  if (!promoJson.ok || promoJson.finalTotalCents !== 0 || !promoJson.comped) {
    fail(
      'Booking',
      'Apply FREE → summary $0 (validate-promo finalTotalCents=0)',
      JSON.stringify(promoJson),
      promoRes.status !== 200 ? `HTTP ${promoRes.status}` : 'Promo validation failed',
      'Ensure isFreePromoEnabled and promo-engine comp path for FREE + exterior-wash sedan.',
    );
  } else {
    console.log('PASS Booking: validate-promo $0 comped');
  }

  const email = `qa-free-flow-${Date.now()}@example.com`;
  let booked = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const slot = saturdaySlot(14 + attempt * 7);
    const bookRes = await fetch(`${base}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicles: [{ serviceSlug: 'exterior-wash', vehicleClass: 'sedan', vehicleDescription: '2021 QA Sedan', vehicleColor: 'Black', addOnSlugs: [] }],
        addOns: [],
        scheduledStart: slot,
        guestName: 'QA FREE Flow',
        guestEmail: email,
        guestPhone: '5125550142',
        serviceAddress: '100 QA Lane',
        serviceCity: 'Austin',
        serviceState: 'TX',
        serviceZip: '78701',
        serviceLocationType: 'house',
        waterAccess: 'yes',
        powerAccess: 'yes',
        parkingAccess: 'yes',
        promoCode: 'FREE',
        paymentChoice: 'full',
      }),
    });
    const bookJson = await bookRes.json();
    if (bookRes.ok && bookJson.skipPayment && bookJson.appointmentId) {
      booked = bookJson;
      break;
    }
    if (bookRes.status !== 409) {
      fail('Booking', 'Complete FREE booking skipPayment', JSON.stringify(bookJson), `HTTP ${bookRes.status}`, 'Fix /api/bookings FREE comp branch.');
      break;
    }
  }
  if (!booked) {
    if (!failures.some((f) => f.section === 'Booking' && f.expected.includes('Complete'))) {
      fail('Booking', 'Complete FREE booking', 'All slots conflicted', '409', 'Pick open slot or clear test appointments.');
    }
  } else {
    console.log('PASS Booking: created', booked.appointmentId);
    const confRes = await fetch(
      `${base}/book/confirmation?appointment_id=${booked.appointmentId}&token=${booked.accessToken}`,
    );
    if (confRes.status !== 200) {
      fail('Booking', 'Confirmation page HTTP 200', `HTTP ${confRes.status}`, 'Non-200', 'Fix /book/confirmation route.');
    } else {
      console.log('PASS Booking: confirmation page 200');
    }
  }

  const apptId = booked?.appointmentId;
  if (!apptId) {
    console.log('\nStopping admin/work-order checks — no appointment.\n');
    process.exit(failures.length ? 1 : 0);
  }

  // --- 3 Admin records ---
  const appt = (await sb(`appointments?id=eq.${apptId}&select=id,status,guest_name,service_slug`)).json?.[0];
  if (!appt?.id) {
    fail(
      'Admin',
      'Work order / appointment exists for booking',
      'No appointment row',
      'appointments select empty',
      'Verify booking insert creates appointments row.',
    );
  } else {
    console.log('PASS Admin: appointment exists (work order id = appointment id)');
  }

  const pays = (await sb(`payments?appointment_id=eq.${apptId}&select=status,amount_cents,payment_method`)).json;
  const comped = Array.isArray(pays) && pays.some((p) => p.status === 'comped' && p.amount_cents === 0);
  if (!comped) {
    fail(
      'Admin',
      'Payment row comped $0',
      JSON.stringify(pays),
      'Missing comped payment',
      'Ensure FREE branch in api/bookings inserts payments with status comped.',
    );
  } else {
    console.log('PASS Admin: comped payment');
  }

  const recs = (await sb(`receipts?appointment_id=eq.${apptId}&select=id,receipt_number,amount_cents,status`)).json;
  if (!Array.isArray(recs) || recs.length === 0) {
    fail(
      'Admin',
      'Receipt exists',
      JSON.stringify(recs),
      'No receipt row',
      'Ensure FREE booking inserts receipt in api/bookings.',
    );
  } else {
    console.log('PASS Admin: receipt', recs[0].receipt_number);
  }

  // --- 4 Work order (agreement + photo — API where possible) ---
  const signedBefore = (await sb(`signed_agreements?appointment_id=eq.${apptId}&select=id`)).json;
  // Agreement sign requires auth — check endpoint exists
  const ackRes = await fetch(`${base}/acknowledgement/${apptId}?token=${booked.accessToken}`, { redirect: 'manual' });
  if (ackRes.status !== 200 && ackRes.status !== 307 && ackRes.status !== 302) {
    fail(
      'Work order',
      'Agreement page reachable for appointment',
      `HTTP ${ackRes.status}`,
      'Agreement route failed',
      'Fix /acknowledgement/[appointmentId] for new bookings.',
    );
  } else {
    console.log('PASS Work order: agreement route reachable', ackRes.status);
  }

  // Agreement sign (customer token path)
  const apptRow = (await sb(`appointments?id=eq.${apptId}&select=access_token,intake_completed_at`)).json?.[0];
  const accessToken = booked.accessToken || apptRow?.access_token;
  if (accessToken) {
    const signRes = await fetch(`${base}/api/agreements/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appointmentId: apptId,
        accessToken,
        signerLegalName: 'QA FREE Flow',
        signatureType: 'typed',
        signatureData: 'QA FREE Flow',
        acknowledged: true,
      }),
    });
    const signJson = await signRes.json().catch(() => ({}));
    if (!signRes.ok) {
      fail(
        'Work order',
        'Save agreement updates signed_agreements',
        JSON.stringify(signJson),
        `HTTP ${signRes.status}`,
        'Fix /api/agreements/sign for FREE comp bookings (access_token match).',
      );
    } else {
      const signed = (await sb(`signed_agreements?appointment_id=eq.${apptId}&select=id`)).json;
      if (!Array.isArray(signed) || signed.length === 0) {
        fail(
          'Work order',
          'Agreement row exists after sign',
          JSON.stringify(signed),
          'No signed_agreements row',
          'Ensure agreements/sign inserts signed_agreements for appointment.',
        );
      } else {
        console.log('PASS Work order: agreement signed', signed.length, 'row(s)');
      }
      const apptAfter = (await sb(`appointments?id=eq.${apptId}&select=intake_completed_at`)).json?.[0];
      if (!apptAfter?.intake_completed_at) {
        fail(
          'Work order',
          'Progress updates after agreement (intake_completed_at set)',
          JSON.stringify(apptAfter),
          'intake_completed_at null',
          'Set intake_completed_at on agreement sign in agreements/sign route.',
        );
      } else {
        console.log('PASS Work order: intake_completed_at set');
      }
    }
  }

  console.log('\n[Work order] Before photo upload requires tech login — not run in this script.');
  console.log('Manual: /tech/work-orders/' + apptId + ' → upload before photo → verify thumbnails after refresh.\n');

  console.log('\n=== SUMMARY ===');
  console.log('Failures:', failures.length);
  if (failures.length) process.exit(1);
  console.log('All automated FREE flow checks passed.');
  console.log('Appointment ID for manual work-order test:', apptId);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
