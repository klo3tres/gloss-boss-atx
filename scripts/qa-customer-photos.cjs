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
  const email = `gbqa-photo-${suffix}@example.net`;
  const otherEmail = `gbqa-photo-other-${suffix}@example.net`;
  const password = `Gb!${randomBytes(18).toString('base64url')}7`;
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  let authUserId = '';
  let customerId = '';
  let otherCustomerId = '';
  let appointmentId = '';
  let otherAppointmentId = '';
  let mediaId = '';
  let storageBucket = '';
  let storagePath = '';
  let stage = 'setup';

  try {
    stage = 'create auth user';
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Photo QA', is_test: true },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(created.error?.message || 'QA user creation failed.');
    }
    authUserId = created.data.user.id;

    stage = 'create customers';
    const customers = await admin
      .from('customers')
      .insert([
        {
          auth_user_id: authUserId,
          email,
          full_name: 'Gloss Boss Photo QA',
          is_test: true,
          qa_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        },
        {
          email: otherEmail,
          full_name: 'Gloss Boss Photo Ownership QA',
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
    stage = 'create appointments';
    const appointments = await admin
      .from('appointments')
      .insert([
        {
          customer_id: customerId,
          guest_email: email,
          guest_name: 'Gloss Boss Photo QA',
          status: 'awaiting_payment',
          vehicle_description: 'Photo QA Vehicle',
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
          guest_name: 'Gloss Boss Photo Ownership QA',
          status: 'awaiting_payment',
          vehicle_description: 'Other Photo QA Vehicle',
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

    stage = 'sign in';
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

    stage = 'reject wrong owner upload';
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    );
    const rejectedForm = new FormData();
    rejectedForm.set('appointmentId', otherAppointmentId);
    rejectedForm.set('note', 'This must not upload.');
    rejectedForm.set('file', new File([png], 'ownership-check.png', { type: 'image/png' }));
    const rejected = await fetch(`${appUrl}/api/customer/media`, {
      method: 'POST',
      headers: { cookie },
      body: rejectedForm,
    });
    if (rejected.status !== 403) {
      throw new Error(`Cross-customer photo upload returned HTTP ${rejected.status} instead of 403.`);
    }

    stage = 'upload owned photo';
    const uploadForm = new FormData();
    uploadForm.set('appointmentId', appointmentId);
    uploadForm.set('note', 'Customer photo acceptance test');
    uploadForm.set('file', new File([png], 'vehicle.png', { type: 'image/png' }));
    const upload = await fetch(`${appUrl}/api/customer/media`, {
      method: 'POST',
      headers: { cookie },
      body: uploadForm,
    });
    const uploadBody = await upload.json().catch(() => ({}));
    if (!upload.ok || uploadBody.ok !== true || !uploadBody.id || !uploadBody.fileUrl) {
      throw new Error(uploadBody.error || `Customer upload returned HTTP ${upload.status}.`);
    }
    mediaId = String(uploadBody.id);

    stage = 'verify photo metadata';
    const media = await admin
      .from('job_media')
      .select(
        'id, appointment_id, customer_id, uploaded_by, file_url, storage_bucket, storage_path, visible_to_customer, approved_for_customer, publish_to_gallery, notes',
      )
      .eq('id', mediaId)
      .maybeSingle();
    if (
      media.error ||
      String(media.data?.appointment_id) !== appointmentId ||
      String(media.data?.customer_id) !== customerId ||
      String(media.data?.uploaded_by) !== authUserId ||
      media.data?.visible_to_customer !== true ||
      media.data?.approved_for_customer !== true ||
      media.data?.publish_to_gallery !== false ||
      media.data?.notes !== 'Customer photo acceptance test'
    ) {
      throw new Error(media.error?.message || 'Uploaded photo metadata or ownership is incorrect.');
    }
    storageBucket = String(media.data.storage_bucket || '');
    storagePath = String(media.data.storage_path || '');

    stage = 'verify customer read';
    const ownRead = await fetch(
      `${appUrl}/api/customer/media?appointmentId=${encodeURIComponent(appointmentId)}`,
      { headers: { cookie } },
    );
    const ownReadBody = await ownRead.json().catch(() => ({}));
    if (
      !ownRead.ok ||
      ownReadBody.ok !== true ||
      !Array.isArray(ownReadBody.photos) ||
      !ownReadBody.photos.some((photo) => String(photo.id) === mediaId)
    ) {
      throw new Error(ownReadBody.error || 'The customer cannot view their uploaded photo.');
    }
    const wrongOwnerRead = await fetch(
      `${appUrl}/api/customer/media?appointmentId=${encodeURIComponent(otherAppointmentId)}`,
      { headers: { cookie } },
    );
    if (wrongOwnerRead.status !== 403) {
      throw new Error(`Cross-customer photo view returned HTTP ${wrongOwnerRead.status} instead of 403.`);
    }

    stage = 'verify photo delivery';
    const fileResponse = await fetch(String(uploadBody.fileUrl));
    if (!fileResponse.ok) throw new Error(`Uploaded photo URL returned HTTP ${fileResponse.status}.`);

    console.log(
      'Customer photo QA passed: ownership rejection, upload, metadata, customer read access, and photo delivery are operational.',
    );
  } catch (error) {
    throw new Error(`${stage}: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    if (storageBucket && storagePath) {
      await admin.storage.from(storageBucket).remove([storagePath]);
    }
    if (mediaId) await admin.from('job_media').delete().eq('id', mediaId);
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
