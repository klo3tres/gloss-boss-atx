const fs = require('node:fs');
const path = require('node:path');
const { createClient } = require('@supabase/supabase-js');

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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv('.env.production');
loadEnv('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Customer claim audit could not run: production Supabase credentials are missing.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function readAll(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const response = await admin
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (response.error) throw new Error(`${table}: ${response.error.message}`);
    rows.push(...(response.data || []));
    if ((response.data || []).length < pageSize) return rows;
  }
}

function normalizedEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.includes('@') ? email : '';
}

async function main() {
  const [appointments, customers] = await Promise.all([
    readAll(
      'appointments',
      'id, customer_id, account_claim_status, customer_claimed_account_at',
    ),
    readAll('customers', 'id, auth_user_id, email'),
  ]);

  const customersById = new Map(customers.map((row) => [String(row.id), row]));
  const claimedAppointments = appointments.filter(
    (row) =>
      String(row.account_claim_status || '') === 'linked' ||
      Boolean(row.customer_claimed_account_at),
  );
  const claimedWithoutCustomer = claimedAppointments.filter((row) => !row.customer_id);
  const claimedWithoutAuthOwner = claimedAppointments.filter((row) => {
    if (!row.customer_id) return false;
    return !customersById.get(String(row.customer_id))?.auth_user_id;
  });

  const customersByAuth = new Map();
  const authOwnersByEmail = new Map();
  for (const customer of customers) {
    const authUserId = String(customer.auth_user_id || '').trim();
    if (authUserId) {
      const owned = customersByAuth.get(authUserId) || [];
      owned.push(String(customer.id));
      customersByAuth.set(authUserId, owned);
    }
    const email = normalizedEmail(customer.email);
    if (email && authUserId) {
      const owners = authOwnersByEmail.get(email) || new Set();
      owners.add(authUserId);
      authOwnersByEmail.set(email, owners);
    }
  }

  const duplicateAuthOwners = [...customersByAuth.values()].filter((ids) => ids.length > 1);
  const conflictingEmailOwners = [...authOwnersByEmail.values()].filter((owners) => owners.size > 1);
  const failures = [
    ['claimed bookings missing a customer', claimedWithoutCustomer.length],
    ['claimed bookings whose customer has no login owner', claimedWithoutAuthOwner.length],
    ['login IDs attached to multiple customers', duplicateAuthOwners.length],
    ['customer emails attached to multiple login IDs', conflictingEmailOwners.length],
  ];

  console.log(`Customer claim audit: ${claimedAppointments.length} claimed bookings, ${customers.length} customer records.`);
  for (const [label, count] of failures) console.log(`- ${label}: ${count}`);
  if (failures.some(([, count]) => count > 0)) process.exit(1);
  console.log('Customer claim integrity passed.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
