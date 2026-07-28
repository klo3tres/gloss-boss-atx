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
  const email = `gbqa-membership-${suffix}@example.net`;
  const otherEmail = `gbqa-membership-other-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}7`;
  let authUserId = '';
  let customerId = '';
  let otherCustomerId = '';
  let planId = '';
  const membershipIds = [];

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Membership QA', is_test: true },
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
          full_name: 'Gloss Boss Membership QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          email: otherEmail,
          full_name: 'Gloss Boss Membership Ownership QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
      ])
      .select('id, email');
    if (customers.error || customers.data?.length !== 2) {
      throw new Error(customers.error?.message || 'QA customers could not be created.');
    }
    customerId = String(customers.data.find((row) => row.email === email)?.id || '');
    otherCustomerId = String(customers.data.find((row) => row.email === otherEmail)?.id || '');
    if (!customerId || !otherCustomerId) throw new Error('QA customer IDs were not returned.');

    const plan = await admin
      .from('membership_plans')
      .insert({
        name: 'Customer Membership QA Plan',
        slug: `gbqa-membership-${suffix}`,
        tier: 'qa',
        price_cents: 4900,
        billing_interval: 'month',
        discount_percent: 12,
        benefits: ['QA member pricing', 'QA priority booking'],
        included_services: ['full-detail'],
        show_on_homepage: false,
        show_on_services: false,
        archived: true,
      })
      .select('id')
      .maybeSingle();
    if (plan.error || !plan.data?.id) {
      throw new Error(plan.error?.message || 'QA membership plan could not be created.');
    }
    planId = String(plan.data.id);

    const memberships = await admin
      .from('customer_memberships')
      .insert([
        {
          customer_id: customerId,
          membership_plan_id: planId,
          status: 'active',
          billing_interval: 'monthly',
          price_cents: 4900,
          credit_balance_cents: 2500,
          notes: 'Customer membership active QA',
        },
        {
          customer_id: customerId,
          membership_plan_id: planId,
          status: 'canceled',
          billing_interval: 'monthly',
          price_cents: 4900,
          credit_balance_cents: 0,
          notes: 'Customer membership history QA',
        },
        {
          customer_id: otherCustomerId,
          membership_plan_id: planId,
          status: 'active',
          billing_interval: 'monthly',
          price_cents: 4900,
          credit_balance_cents: 0,
          notes: 'Must not be visible to the signed-in customer',
        },
      ])
      .select('id, customer_id');
    if (memberships.error || memberships.data?.length !== 3) {
      throw new Error(memberships.error?.message || 'QA memberships could not be created.');
    }
    membershipIds.push(...memberships.data.map((row) => String(row.id)));
    const otherMembershipId = String(
      memberships.data.find((row) => String(row.customer_id) === otherCustomerId)?.id || '',
    );

    const anonymous = await fetch(`${appUrl}/api/customer/memberships`);
    if (anonymous.status !== 401) {
      throw new Error(`Anonymous membership view returned HTTP ${anonymous.status} instead of 401.`);
    }

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
    const response = await fetch(`${appUrl}/api/customer/memberships`, {
      headers: { cookie },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true || !Array.isArray(body.memberships)) {
      throw new Error(body.error || `Customer memberships returned HTTP ${response.status}.`);
    }
    const ownMemberships = body.memberships.filter((membership) =>
      membershipIds.includes(String(membership.id)),
    );
    const statuses = new Set(ownMemberships.map((membership) => String(membership.status)));
    if (
      ownMemberships.length !== 2 ||
      !statuses.has('active') ||
      !statuses.has('canceled') ||
      ownMemberships.some((membership) => String(membership.id) === otherMembershipId) ||
      ownMemberships.some(
        (membership) => membership.membership_plans?.name !== 'Customer Membership QA Plan',
      )
    ) {
      throw new Error('Membership history, plan details, or customer ownership is incorrect.');
    }

    console.log(
      'Customer membership QA passed: authenticated active/history viewing and customer ownership isolation are operational.',
    );
  } finally {
    if (membershipIds.length) {
      await admin.from('customer_memberships').delete().in('id', membershipIds);
    }
    if (planId) await admin.from('membership_plans').delete().eq('id', planId);
    if (customerId || otherCustomerId) {
      await admin.from('customers').delete().in('id', [customerId, otherCustomerId].filter(Boolean));
    }
    await admin.from('customers').delete().in('email', [email, otherEmail]);
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
