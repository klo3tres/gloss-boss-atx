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
if (!url || !anonKey || !serviceKey) process.exit(1);

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const oldEmail = `gbqa-contact-old-${suffix}@example.net`;
  const newEmail = `gbqa-contact-new-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}7`;
  let authUserId = '';
  let customerId = '';

  try {
    const created = await admin.auth.admin.createUser({
      email: oldEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Contact QA', is_test: true },
    });
    if (created.error || !created.data.user?.id) throw new Error(created.error?.message || 'QA user creation failed.');
    authUserId = created.data.user.id;

    const customer = await admin
      .from('customers')
      .insert({
        auth_user_id: authUserId,
        email: oldEmail,
        full_name: 'Gloss Boss Contact QA',
        is_test: true,
        qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .maybeSingle();
    if (customer.error || !customer.data?.id) throw new Error(customer.error?.message || 'QA customer creation failed.');
    customerId = String(customer.data.id);

    const changed = await admin.auth.admin.updateUserById(authUserId, {
      email: newEmail,
      email_confirm: true,
    });
    if (changed.error) throw new Error(changed.error.message);

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
    const signedIn = await sessionClient.auth.signInWithPassword({ email: newEmail, password });
    if (signedIn.error) throw new Error(signedIn.error.message);
    const cookie = [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    const profileSync = await fetch(`${appUrl}/api/auth/ensure-profile`, {
      method: 'POST',
      headers: { cookie },
      redirect: 'follow',
    });
    if (!profileSync.ok) throw new Error(`Customer profile sync returned HTTP ${profileSync.status}.`);
    const settings = await fetch(`${appUrl}/dashboard/settings`, {
      headers: { cookie },
      redirect: 'follow',
    });
    if (!settings.ok) throw new Error(`Customer settings returned HTTP ${settings.status}.`);
    if (!new URL(settings.url).pathname.startsWith('/dashboard/settings')) {
      throw new Error(`Customer settings redirected to ${new URL(settings.url).pathname}.`);
    }

    const refreshed = await admin
      .from('customers')
      .select('email')
      .eq('id', customerId)
      .maybeSingle();
    if (refreshed.error || refreshed.data?.email !== newEmail) {
      throw new Error(refreshed.error?.message || 'Confirmed auth email did not sync to the CRM customer.');
    }
    console.log('Customer contact QA passed: confirmed email synchronized to the owned customer profile.');
  } finally {
    if (customerId) await admin.from('customers').delete().eq('id', customerId);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
