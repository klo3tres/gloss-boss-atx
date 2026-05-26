#!/usr/bin/env node
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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

const base = process.argv[2] || 'http://localhost:3000';
const tests = [];

async function t(name, fn) {
  try {
    await fn();
    tests.push({ name, ok: true });
    console.log('PASS', name);
  } catch (e) {
    tests.push({ name, ok: false, err: e.message });
    console.log('FAIL', name, '-', e.message);
  }
}

async function main() {
  console.log('\n[qa-smoke-api]', base, '\n');

  await t('GET /book', async () => {
    const r = await fetch(`${base}/book`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const h = await r.text();
    if (!/book|Book/i.test(h)) throw new Error('missing book UI marker');
  });

  await t('GET /api/public/site-settings', async () => {
    const r = await fetch(`${base}/api/public/site-settings`);
    const j = await r.json();
    console.log('  allowFreeTestPromo=', j.allowFreeTestPromo, 'canBookOnline=', j.canBookOnline);
  });

  await t('POST validate-promo FREE sedan exterior', async () => {
    const r = await fetch(`${base}/api/bookings/validate-promo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promoCode: 'FREE',
        paymentChoice: 'full',
        lines: [
          {
            serviceSlug: 'exterior-wash',
            vehicleClass: 'sedan',
            vehicleDescription: 'QA Test Sedan',
            vehicleColor: 'Black',
            addOnSlugs: [],
          },
        ],
        addOns: [],
      }),
    });
    const j = await r.json();
    console.log('  promo response', JSON.stringify(j));
    if (!j.ok) throw new Error(j.error || 'not ok');
    if (j.finalTotalCents !== 0) throw new Error(`finalTotalCents=${j.finalTotalCents} expected 0`);
    if (!j.comped) throw new Error('comped false');
  });

  await t('GET /api/gallery/public — no filename captions', async () => {
    const r = await fetch(`${base}/api/gallery/public`);
    const j = await r.json();
    const imgs = j.images || [];
    console.log('  gallery count', imgs.length);
    const filenameRe = /\.(jpe?g|png|webp|gif|heic)$/i;
    for (const img of imgs) {
      const cap = String(img.caption || '');
      if (filenameRe.test(cap) || (cap.includes('/') && cap.length < 120)) {
        throw new Error(`filename-like caption: ${cap}`);
      }
    }
  });

  await t('GET /admin/promotions (auth gate)', async () => {
    const r = await fetch(`${base}/admin/promotions`, { redirect: 'manual' });
    console.log('  status', r.status, 'location', r.headers.get('location'));
    if (r.status !== 307 && r.status !== 302 && r.status !== 303) {
      throw new Error(`expected redirect, got ${r.status}`);
    }
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    await t('Supabase FREE promo row', async () => {
      const r = await fetch(
        `${url.replace(/\/$/, '')}/rest/v1/promo_codes?code=eq.FREE&select=code,enabled,archived,discount_type,discount_value`,
        { headers: { apikey: key, Authorization: `Bearer ${key}` } },
      );
      const j = await r.json();
      console.log('  FREE row', JSON.stringify(j));
      const row = Array.isArray(j) ? j[0] : null;
      if (!row) throw new Error('FREE row missing in promo_codes');
    });

    await t('Supabase notification_templates count', async () => {
      const r = await fetch(
        `${url.replace(/\/$/, '')}/rest/v1/notification_templates?select=id`,
        { headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact' } },
      );
      const range = r.headers.get('content-range') || '';
      console.log('  templates content-range', range);
      const m = range.match(/\/(\d+)$/);
      const count = m ? Number(m[1]) : null;
      if (count == null) throw new Error('could not read template count');
      if (count < 1) throw new Error(`template count ${count}`);
    });

    await t('Supabase operations tables', async () => {
      for (const table of ['business_expenses', 'job_mileage_logs']) {
        const r = await fetch(`${url.replace(/\/$/, '')}/rest/v1/${table}?select=id&limit=1`, {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
        });
        if (!r.ok) {
          const err = await r.text();
          throw new Error(`${table}: HTTP ${r.status} ${err.slice(0, 120)}`);
        }
      }
    });
  }

  const failed = tests.filter((x) => !x.ok);
  console.log(`\nSummary: ${tests.length - failed.length}/${tests.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
