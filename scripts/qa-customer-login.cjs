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
  console.error('Customer login QA could not run: Supabase credentials are missing.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const qaEmail = `gbqa-login-${suffix}@example.invalid`;
  const qaPassword = `Gb!${randomBytes(18).toString('base64url')}`;
  let authUserId = '';
  let customerId = '';

  try {
    const created = await admin.auth.admin.createUser({
      email: qaEmail,
      password: qaPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Login QA', is_test: true },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(created.error?.message || 'QA login user could not be created.');
    }
    authUserId = created.data.user.id;

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
    const signedIn = await sessionClient.auth.signInWithPassword({
      email: qaEmail,
      password: qaPassword,
    });
    if (signedIn.error || !signedIn.data.session?.user) {
      throw new Error(signedIn.error?.message || 'QA password login did not establish a session.');
    }

    const cookieHeader = [...cookieJar.entries()]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
    const ensured = await fetch(`${appUrl}/api/auth/ensure-profile`, {
      method: 'POST',
      headers: { cookie: cookieHeader },
      redirect: 'follow',
    });
    const ensuredBody = await ensured.json().catch(() => ({}));
    if (!ensured.ok || ensuredBody.ok !== true) {
      throw new Error(`Profile sync failed with HTTP ${ensured.status}.`);
    }

    const [profile, customer] = await Promise.all([
      admin.from('profiles').select('id, role').eq('id', authUserId).maybeSingle(),
      admin.from('customers').select('id, auth_user_id').eq('auth_user_id', authUserId).maybeSingle(),
    ]);
    if (profile.error || profile.data?.role !== 'customer') {
      throw new Error(profile.error?.message || 'Customer role was not resolved after login.');
    }
    if (customer.error || !customer.data?.id) {
      throw new Error(customer.error?.message || 'Customer CRM link was not resolved after login.');
    }
    customerId = String(customer.data.id);
    console.log('Customer login QA passed: password session, profile resolution, and CRM link are operational.');
  } finally {
    if (customerId) await admin.from('customers').delete().eq('id', customerId);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
