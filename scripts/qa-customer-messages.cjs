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
  const email = `gbqa-message-${suffix}@example.net`;
  const otherEmail = `gbqa-message-other-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}7`;
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let authUserId = '';
  let customerId = '';
  let otherCustomerId = '';
  let appointmentId = '';
  let otherAppointmentId = '';
  const messageIds = [];

  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Message QA', is_test: true },
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
          full_name: 'Gloss Boss Message QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          email: otherEmail,
          full_name: 'Gloss Boss Message Ownership QA',
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

    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const appointments = await admin
      .from('appointments')
      .insert([
        {
          customer_id: customerId,
          guest_email: email,
          guest_name: 'Gloss Boss Message QA',
          status: 'awaiting_payment',
          vehicle_description: 'Message QA Vehicle',
          service_slug: 'full-detail',
          vehicle_class: 'sedan',
          base_price_cents: 10000,
          deposit_percent: 30,
          deposit_amount_cents: 3000,
          scheduled_start: future,
          is_test: true,
          qa_expires_at: expires,
        },
        {
          customer_id: otherCustomerId,
          guest_email: otherEmail,
          guest_name: 'Gloss Boss Message Ownership QA',
          status: 'awaiting_payment',
          vehicle_description: 'Other Message QA Vehicle',
          service_slug: 'full-detail',
          vehicle_class: 'sedan',
          base_price_cents: 10000,
          deposit_percent: 30,
          deposit_amount_cents: 3000,
          scheduled_start: future,
          is_test: true,
          qa_expires_at: expires,
        },
      ])
      .select('id, customer_id');
    if (appointments.error || appointments.data?.length !== 2) {
      throw new Error(appointments.error?.message || 'QA appointments could not be created.');
    }
    appointmentId = String(
      appointments.data.find((row) => String(row.customer_id) === customerId)?.id || '',
    );
    otherAppointmentId = String(
      appointments.data.find((row) => String(row.customer_id) === otherCustomerId)?.id || '',
    );
    if (!appointmentId || !otherAppointmentId) throw new Error('QA appointment IDs were not returned.');

    const anonymous = await fetch(`${appUrl}/api/customer/messages`);
    if (anonymous.status !== 401) {
      throw new Error(`Anonymous message view returned HTTP ${anonymous.status} instead of 401.`);
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

    const wrongOwner = await fetch(`${appUrl}/api/customer/messages`, {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Must not send',
        message: 'This appointment belongs to another customer.',
        appointmentId: otherAppointmentId,
      }),
    });
    if (wrongOwner.status !== 403) {
      throw new Error(`Cross-customer appointment message returned HTTP ${wrongOwner.status} instead of 403.`);
    }

    const sent = await fetch(`${appUrl}/api/customer/messages`, {
      method: 'POST',
      headers: { cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'Customer portal message QA',
        message: 'Please confirm this message is attached to my appointment.',
        appointmentId,
      }),
    });
    const sentBody = await sent.json().catch(() => ({}));
    if (
      !sent.ok ||
      sentBody.ok !== true ||
      !sentBody.id ||
      sentBody.emailNotificationSkipped !== true ||
      sentBody.note !== 'test notification skipped'
    ) {
      throw new Error(sentBody.error || `Customer message send returned HTTP ${sent.status}.`);
    }
    const sentMessageId = String(sentBody.id);
    messageIds.push(sentMessageId);

    const stored = await admin
      .from('messages')
      .select('id, customer_id, thread_id, from_email, body, status')
      .eq('id', sentMessageId)
      .maybeSingle();
    if (
      stored.error ||
      String(stored.data?.customer_id) !== customerId ||
      String(stored.data?.thread_id) !== appointmentId ||
      stored.data?.from_email !== email ||
      stored.data?.status !== 'new'
    ) {
      throw new Error(stored.error?.message || 'The sent message was not linked to the customer and appointment.');
    }

    const legacy = await admin
      .from('messages')
      .insert({
        from_name: 'Gloss Boss Message QA',
        from_email: email,
        subject: 'Legacy customer message QA',
        body: 'This older unlinked message must remain visible.',
        message: 'This older unlinked message must remain visible.',
        customer_id: null,
        status: 'read',
        direction: 'inbound',
      })
      .select('id')
      .maybeSingle();
    const otherMessage = await admin
      .from('messages')
      .insert({
        from_name: 'Other Customer',
        from_email: otherEmail,
        subject: 'Other customer message QA',
        body: 'This message must stay isolated.',
        message: 'This message must stay isolated.',
        customer_id: otherCustomerId,
        status: 'new',
        direction: 'inbound',
      })
      .select('id')
      .maybeSingle();
    if (legacy.error || otherMessage.error || !legacy.data?.id || !otherMessage.data?.id) {
      throw new Error(legacy.error?.message || otherMessage.error?.message || 'QA message history could not be created.');
    }
    messageIds.push(String(legacy.data.id), String(otherMessage.data.id));

    const repliedAt = new Date().toISOString();
    const replied = await admin
      .from('messages')
      .update({
        status: 'replied',
        admin_reply: 'Your appointment message was received.',
        reply_body: 'Your appointment message was received.',
        replied_at: repliedAt,
      })
      .eq('id', sentMessageId);
    if (replied.error) throw new Error(replied.error.message);

    const received = await fetch(`${appUrl}/api/customer/messages`, { headers: { cookie } });
    const receivedBody = await received.json().catch(() => ({}));
    if (!received.ok || !Array.isArray(receivedBody.messages)) {
      throw new Error(receivedBody.error || `Customer message view returned HTTP ${received.status}.`);
    }
    const sentView = receivedBody.messages.find((message) => message.id === sentMessageId);
    if (
      receivedBody.messages.length !== 2 ||
      !sentView ||
      sentView.adminReply !== 'Your appointment message was received.' ||
      sentView.status !== 'replied' ||
      !receivedBody.messages.some((message) => message.subject === 'Legacy customer message QA') ||
      receivedBody.messages.some((message) => message.subject === 'Other customer message QA')
    ) {
      throw new Error('Message history, admin reply, legacy recovery, or customer isolation is incorrect.');
    }

    console.log(
      'Customer message QA passed: send, receive, appointment ownership, legacy history, reply visibility, finite notification handling, and customer isolation are operational.',
    );
  } finally {
    if (messageIds.length) await admin.from('messages').delete().in('id', messageIds);
    if (appointmentId || otherAppointmentId) {
      await admin.from('appointments').delete().in('id', [appointmentId, otherAppointmentId].filter(Boolean));
    }
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
