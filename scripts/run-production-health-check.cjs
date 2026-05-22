#!/usr/bin/env node
/**
 * Production deploy readiness check — run: npm run health:check
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');

function loadEnvFile() {
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
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

loadEnvFile();

const checks = [];

function pass(name, detail) {
  checks.push({ name, ok: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail) {
  checks.push({ name, ok: false, detail });
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('\n[gloss-boss-atx] Production health check\n');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  const stripeWh = process.env.STRIPE_WEBHOOK_SECRET;

  if (url && anon) {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/services?select=id&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      if (res.ok) pass('Supabase reachable', `HTTP ${res.status}`);
      else fail('Supabase reachable', `HTTP ${res.status}`);
    } catch (e) {
      fail('Supabase reachable', String(e?.message || e));
    }
  } else {
    fail('Supabase configured', 'Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY');
  }

  if (service) pass('Supabase service role', 'present');
  else fail('Supabase service role', 'SUPABASE_SERVICE_ROLE_KEY missing (bookings/webhooks need this)');

  if (stripeSecret) pass('Stripe secret key', 'present');
  else fail('Stripe secret key', 'STRIPE_SECRET_KEY missing');

  if (stripeWh) pass('Stripe webhook secret', 'present');
  else fail('Stripe webhook secret', 'STRIPE_WEBHOOK_SECRET missing (deposit webhooks will not verify)');

  const appDir = path.join(root, 'src', 'app');
  const requiredRoutes = [
    'api/bookings/route.ts',
    'api/stripe/webhook/route.ts',
    'api/stripe/create-checkout-session/route.ts',
    'api/services/route.ts',
    'api/public/site-data/route.ts',
    'book/page.tsx',
    'acknowledgement/[appointmentId]/page.tsx',
  ];
  let routesOk = true;
  for (const r of requiredRoutes) {
    if (!fs.existsSync(path.join(appDir, r))) {
      routesOk = false;
      fail('Route exists', r);
    }
  }
  if (routesOk) pass('Critical routes', `${requiredRoutes.length} paths found`);

  try {
    const catalog = require(path.join(root, 'src', 'lib', 'catalog-fallback.ts'));
    void catalog;
  } catch {
    /* TS module — verify fallback file exists */
  }
  if (fs.existsSync(path.join(root, 'src', 'lib', 'catalog-fallback.ts'))) {
    pass('Catalog fallback module', 'catalog-fallback.ts');
  } else {
    fail('Catalog fallback module', 'missing');
  }

  if (fs.existsSync(path.join(root, 'src', 'lib', 'safe-price-resolver.ts'))) {
    pass('safePriceResolver module', 'present');
  } else {
    fail('safePriceResolver module', 'missing');
  }

  const resendOk = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  const twilioOk = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_MESSAGING_SERVICE_SID || process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_FROM),
  );
  pass('Resend email (optional)', resendOk ? 'configured for transactional mail' : 'not configured — booking emails log only');
  pass('Twilio SMS (optional)', twilioOk ? 'configured for job SMS' : 'not configured — SMS hooks log only');

  const failed = checks.filter((c) => !c.ok);
  const result = failed.length === 0 ? 'PASS' : 'FAIL';
  console.log(`\nResult: ${result} (${checks.length - failed.length}/${checks.length} checks passed)\n`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
