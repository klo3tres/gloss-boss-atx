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
  const email = `gbqa-reward-${suffix}@example.net`;
  const otherEmail = `gbqa-reward-other-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}7`;
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  let authUserId = '';
  let customerId = '';
  let otherCustomerId = '';
  const creditIds = [];
  const rewardIds = [];

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Reward QA', is_test: true },
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
          full_name: 'Gloss Boss Reward QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          email: otherEmail,
          full_name: 'Gloss Boss Reward Ownership QA',
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

    const credits = await admin
      .from('customer_credits')
      .insert([
        {
          customer_id: customerId,
          amount_cents: 2500,
          remaining_cents: 2500,
          type: 'promo',
          reason: 'Available QA credit',
          source: `qa:reward:${suffix}:available`,
          status: 'active',
          expires_at: null,
        },
        {
          customer_id: customerId,
          amount_cents: 1200,
          remaining_cents: 0,
          type: 'loyalty_reward',
          reason: 'Used QA credit',
          source: `qa:reward:${suffix}:used`,
          status: 'used',
          expires_at: null,
        },
        {
          customer_id: customerId,
          amount_cents: 900,
          remaining_cents: 0,
          type: 'manual',
          reason: 'Voided QA credit',
          source: `qa:reward:${suffix}:voided`,
          status: 'voided',
          expires_at: null,
        },
        {
          customer_id: customerId,
          amount_cents: 800,
          remaining_cents: 800,
          type: 'birthday',
          reason: 'Expired QA credit',
          source: `qa:reward:${suffix}:expired`,
          status: 'active',
          expires_at: past,
        },
        {
          customer_id: otherCustomerId,
          amount_cents: 9900,
          remaining_cents: 9900,
          type: 'manual',
          reason: 'Other customer QA credit',
          source: `qa:reward:${suffix}:other`,
          status: 'active',
          expires_at: null,
        },
      ])
      .select('id, customer_id, reason');
    if (credits.error || credits.data?.length !== 5) {
      throw new Error(credits.error?.message || 'QA credits could not be created.');
    }
    creditIds.push(...credits.data.map((row) => String(row.id)));
    const availableCreditId = String(
      credits.data.find((row) => row.reason === 'Available QA credit')?.id || '',
    );

    const rewardFixtures = [
      ['percent', 15, 'Available percent QA reward', 'available'],
      ['dollar', 25, 'Reserved dollar QA reward', 'reserved'],
      ['free_addon', 0, 'Locked add-on QA reward', 'locked'],
      ['free_service', 150, 'Redeemed service QA reward', 'redeemed'],
      ['membership_credit', 30, 'Pending membership QA reward', 'pending'],
      ['custom', 0, 'Voided custom QA reward', 'voided'],
    ];
    const rewardRows = rewardFixtures.map(([rewardType, rewardValue, rewardLabel, status], index) => ({
      customer_id: customerId,
      reward_type: rewardType,
      reward_value: rewardValue,
      reward_label: rewardLabel,
      status,
      issuance_key: `qa-reward:${suffix}:${index}`,
      eligibility: {},
      metadata: { is_test: true },
    }));
    rewardRows.push({
      customer_id: customerId,
      reward_type: 'dollar',
      reward_value: 25,
      reward_label: 'Linked credit must not duplicate',
      status: 'available',
      issuance_key: `qa-reward:${suffix}:linked`,
      eligibility: {},
      metadata: { is_test: true },
      customer_credit_id: availableCreditId,
    });
    rewardRows.push({
      customer_id: otherCustomerId,
      reward_type: 'percent',
      reward_value: 99,
      reward_label: 'Other customer reward',
      status: 'available',
      issuance_key: `qa-reward:${suffix}:other`,
      eligibility: {},
      metadata: { is_test: true },
    });
    const rewards = await admin
      .from('referral_rewards')
      .insert(rewardRows)
      .select('id');
    if (rewards.error || rewards.data?.length !== rewardRows.length) {
      throw new Error(rewards.error?.message || 'QA rewards could not be created.');
    }
    rewardIds.push(...rewards.data.map((row) => String(row.id)));

    const anonymous = await fetch(`${appUrl}/api/customer/rewards`);
    if (anonymous.status !== 401) {
      throw new Error(`Anonymous reward view returned HTTP ${anonymous.status} instead of 401.`);
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
    const response = await fetch(`${appUrl}/api/customer/rewards`, { headers: { cookie } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok !== true || !Array.isArray(body.items)) {
      throw new Error(body.error || `Customer rewards returned HTTP ${response.status}.`);
    }
    const statuses = new Set(body.items.map((item) => String(item.status)));
    const requiredStatuses = ['active', 'used', 'voided', 'expired', 'available', 'reserved', 'locked', 'redeemed', 'pending'];
    if (
      body.items.length !== 10 ||
      Number(body.availableCreditCents) !== 2500 ||
      requiredStatuses.some((status) => !statuses.has(status)) ||
      body.items.some((item) => item.title === 'Linked credit must not duplicate') ||
      body.items.some((item) => item.title === 'Other customer reward') ||
      body.items.some((item) => item.title === 'Other customer QA credit')
    ) {
      throw new Error('Reward statuses, credit balance, deduplication, or customer ownership is incorrect.');
    }

    console.log(
      'Customer reward QA passed: full wallet lifecycle, balance, linked-credit deduplication, and ownership isolation are operational.',
    );
  } finally {
    if (rewardIds.length) await admin.from('referral_rewards').delete().in('id', rewardIds);
    if (creditIds.length) await admin.from('customer_credits').delete().in('id', creditIds);
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
