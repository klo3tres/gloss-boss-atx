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
  const email = `gbqa-referral-${suffix}@example.net`;
  const otherEmail = `gbqa-referral-other-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}7`;
  let authUserId = '';
  let customerId = '';
  let otherCustomerId = '';
  const eventIds = [];
  const rewardIds = [];

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Referral QA', is_test: true },
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
          full_name: 'Gloss Boss Referral QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          email: otherEmail,
          full_name: 'Gloss Boss Referral Ownership QA',
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

    const anonymous = await fetch(`${appUrl}/api/customer/referrals`);
    if (anonymous.status !== 401) {
      throw new Error(`Anonymous referral view returned HTTP ${anonymous.status} instead of 401.`);
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

    const initial = await fetch(`${appUrl}/api/customer/referrals`, { headers: { cookie } });
    const initialBody = await initial.json().catch(() => ({}));
    const code = String(initialBody.referral?.code || '');
    const link = String(initialBody.referral?.link || '');
    if (
      !initial.ok ||
      initialBody.ok !== true ||
      !code ||
      !link.endsWith(`/book?ref=${encodeURIComponent(code)}`)
    ) {
      throw new Error(initialBody.error || 'The customer referral code or link was not created.');
    }

    const statuses = ['clicked', 'booked', 'pending_completion', 'completed', 'reward_available', 'redeemed'];
    const events = await admin
      .from('referral_events')
      .insert([
        ...statuses.map((status, index) => ({
          referrer_customer_id: customerId,
          referral_code: code,
          referred_email: `gbqa-referred-${index}-${suffix}@example.net`,
          status,
          metadata: { is_test: true },
        })),
        {
          referrer_customer_id: otherCustomerId,
          referral_code: `OTHER${suffix}`,
          referred_email: `gbqa-referred-other-${suffix}@example.net`,
          status: 'completed',
          metadata: { is_test: true },
        },
      ])
      .select('id');
    if (events.error || events.data?.length !== statuses.length + 1) {
      throw new Error(events.error?.message || 'QA referral events could not be created.');
    }
    eventIds.push(...events.data.map((row) => String(row.id)));

    const rewards = await admin
      .from('referral_rewards')
      .insert([
        {
          customer_id: customerId,
          reward_type: 'percent',
          reward_value: 15,
          reward_label: 'Available referral QA reward',
          status: 'available',
          issuance_key: `qa-referral:${suffix}:available`,
          metadata: { is_test: true },
        },
        {
          customer_id: customerId,
          reward_type: 'percent',
          reward_value: 15,
          reward_label: 'Pending referral QA reward',
          status: 'pending',
          issuance_key: `qa-referral:${suffix}:pending`,
          metadata: { is_test: true },
        },
        {
          customer_id: otherCustomerId,
          reward_type: 'percent',
          reward_value: 99,
          reward_label: 'Other customer referral QA reward',
          status: 'available',
          issuance_key: `qa-referral:${suffix}:other`,
          metadata: { is_test: true },
        },
      ])
      .select('id');
    if (rewards.error || rewards.data?.length !== 3) {
      throw new Error(rewards.error?.message || 'QA referral rewards could not be created.');
    }
    rewardIds.push(...rewards.data.map((row) => String(row.id)));

    const response = await fetch(`${appUrl}/api/customer/referrals`, { headers: { cookie } });
    const body = await response.json().catch(() => ({}));
    const stats = body.referral?.stats;
    if (
      !response.ok ||
      body.ok !== true ||
      body.referral?.code !== code ||
      Number(stats?.sent) !== 6 ||
      Number(stats?.booked) !== 5 ||
      Number(stats?.completed) !== 3 ||
      Number(stats?.pending) !== 2 ||
      Number(stats?.rewardsEarned) !== 2 ||
      Number(stats?.rewardsAvailable) !== 1
    ) {
      throw new Error(body.error || 'Referral funnel or reward statistics are incorrect.');
    }

    console.log(
      'Customer referral QA passed: durable link, current funnel counts, reward counts, authentication, and ownership isolation are operational.',
    );
  } finally {
    if (rewardIds.length) await admin.from('referral_rewards').delete().in('id', rewardIds);
    if (eventIds.length) await admin.from('referral_events').delete().in('id', eventIds);
    if (customerId || otherCustomerId) {
      await admin.from('customer_referral_codes').delete().in('customer_id', [customerId, otherCustomerId].filter(Boolean));
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
