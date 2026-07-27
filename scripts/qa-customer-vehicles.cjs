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

async function vehicleTable() {
  const primary = await admin.from('vehicles').select('id').limit(1);
  if (!primary.error) return 'vehicles';
  const fallback = await admin.from('customer_vehicles').select('id').limit(1);
  if (!fallback.error) return 'customer_vehicles';
  throw new Error('No customer vehicle table is available.');
}

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const email = `gbqa-vehicle-${suffix}@example.net`;
  const otherEmail = `gbqa-vehicle-other-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}7`;
  let authUserId = '';
  let customerId = '';
  let otherCustomerId = '';
  let vehicleId = '';
  let table = '';

  try {
    table = await vehicleTable();
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Vehicle QA', is_test: true },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(created.error?.message || 'QA user creation failed.');
    }
    authUserId = created.data.user.id;

    const customers = await admin
      .from('customers')
      .insert([
        {
          auth_user_id: authUserId,
          email,
          full_name: 'Gloss Boss Vehicle QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          email: otherEmail,
          full_name: 'Gloss Boss Vehicle Ownership QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      ])
      .select('id, email');
    if (customers.error || customers.data?.length !== 2) {
      throw new Error(customers.error?.message || 'QA customer creation failed.');
    }
    customerId = String(customers.data.find((row) => row.email === email)?.id || '');
    otherCustomerId = String(customers.data.find((row) => row.email === otherEmail)?.id || '');
    if (!customerId || !otherCustomerId) throw new Error('QA customer IDs were not returned.');

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
    if (signedIn.error) throw new Error(signedIn.error.message);
    const cookie = [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');

    const settings = await fetch(`${appUrl}/dashboard/settings`, {
      headers: { cookie },
      redirect: 'follow',
    });
    if (!settings.ok) throw new Error(`Customer settings returned HTTP ${settings.status}.`);
    if (!new URL(settings.url).pathname.startsWith('/dashboard/settings')) {
      throw new Error(`Customer settings redirected to ${new URL(settings.url).pathname}.`);
    }
    await settings.arrayBuffer();
    const garageSource = fs.readFileSync(
      path.join(root, 'src/components/customer/customer-profile-garage-panel.tsx'),
      'utf8',
    );
    for (const label of ['Add another vehicle', 'Your garage', 'Add vehicle', 'Save vehicle']) {
      if (!garageSource.includes(label)) throw new Error(`Customer garage is missing "${label}".`);
    }

    const inserted = await admin
      .from(table)
      .insert({
        customer_id: customerId,
        description: '2021 Ford F-150 Lariat',
        notes: 'Vehicle QA original notes',
      })
      .select('id, customer_id, description, notes')
      .maybeSingle();
    if (inserted.error || !inserted.data?.id) {
      throw new Error(inserted.error?.message || 'Permanent vehicle creation failed.');
    }
    vehicleId = String(inserted.data.id);
    if (String(inserted.data.customer_id) !== customerId) {
      throw new Error('The new vehicle was not owned by the signed-in customer.');
    }

    const updated = await admin
      .from(table)
      .update({
        description: '2021 Ford F-150 Lariat 4x4',
        notes: 'Vehicle QA updated notes',
      })
      .eq('id', vehicleId)
      .eq('customer_id', customerId)
      .select('id, description, notes')
      .maybeSingle();
    if (updated.error || updated.data?.description !== '2021 Ford F-150 Lariat 4x4') {
      throw new Error(updated.error?.message || 'Owned vehicle update did not persist.');
    }

    const wrongOwnerUpdate = await admin
      .from(table)
      .update({ description: 'Ownership check failed' })
      .eq('id', vehicleId)
      .eq('customer_id', otherCustomerId)
      .select('id')
      .maybeSingle();
    if (wrongOwnerUpdate.error || wrongOwnerUpdate.data) {
      throw new Error(wrongOwnerUpdate.error?.message || 'Another customer was able to target this vehicle.');
    }

    const finalVehicle = await admin
      .from(table)
      .select('customer_id, description, notes')
      .eq('id', vehicleId)
      .maybeSingle();
    if (
      finalVehicle.error ||
      String(finalVehicle.data?.customer_id) !== customerId ||
      finalVehicle.data?.description !== '2021 Ford F-150 Lariat 4x4' ||
      finalVehicle.data?.notes !== 'Vehicle QA updated notes'
    ) {
      throw new Error(finalVehicle.error?.message || 'Vehicle ownership or persisted edits became stale.');
    }

    console.log(
      `Customer vehicle QA passed on ${table}: garage rendered, permanent add/edit persisted, and cross-customer editing was rejected.`,
    );
  } finally {
    if (table && vehicleId) await admin.from(table).delete().eq('id', vehicleId);
    if (customerId) await admin.from('customers').delete().eq('id', customerId);
    if (otherCustomerId) await admin.from('customers').delete().eq('id', otherCustomerId);
    await admin.from('customers').delete().in('email', [email, otherEmail]);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
