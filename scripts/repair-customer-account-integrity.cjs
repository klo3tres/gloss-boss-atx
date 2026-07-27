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
    if (!process.env[key] && value) process.env[key] = value;
  }
}

loadEnv('.env.production');
loadEnv('.env.local');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Customer account repair could not run: production Supabase credentials are missing.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function text(value) {
  return String(value || '').trim();
}

function email(value) {
  return text(value).toLowerCase();
}

function displayName(user) {
  return (
    text(user.user_metadata?.full_name) ||
    text(user.user_metadata?.name) ||
    email(user.email).split('@')[0] ||
    'Customer'
  );
}

async function roleForUser(user) {
  const normalizedEmail = email(user.email);
  const ownerEmails = [
    process.env.OWNER_EMAIL,
    process.env.NEXT_PUBLIC_OWNER_EMAIL,
    process.env.ADMIN_EMAIL,
  ]
    .map(email)
    .filter(Boolean);
  if (ownerEmails.includes(normalizedEmail)) return 'super_admin';

  const invite = await admin
    .from('staff_invites')
    .select('role')
    .or(`auth_user_id.eq.${user.id},email.ilike.${normalizedEmail}`)
    .in('status', ['accepted', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const inviteRole = text(invite.data?.role);
  if (['super_admin', 'admin', 'dispatcher', 'technician', 'viewer'].includes(inviteRole)) {
    return inviteRole;
  }
  return 'customer';
}

async function ensureCustomerLink(user) {
  const normalizedEmail = email(user.email);
  if (!normalizedEmail) throw new Error(`Auth user ${user.id} has no email.`);
  const existingByAuth = await admin
    .from('customers')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (existingByAuth.error) throw new Error(existingByAuth.error.message);
  if (existingByAuth.data?.id) return 'already-linked';

  const existingByEmail = await admin
    .from('customers')
    .select('id, auth_user_id')
    .ilike('email', normalizedEmail)
    .maybeSingle();
  if (existingByEmail.error) throw new Error(existingByEmail.error.message);
  if (existingByEmail.data?.id) {
    const owner = text(existingByEmail.data.auth_user_id);
    if (owner && owner !== user.id) {
      throw new Error(`Email ownership conflict for auth user ${String(user.id).slice(-8)}.`);
    }
    const linked = await admin
      .from('customers')
      .update({
        auth_user_id: user.id,
        portal_account_linked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingByEmail.data.id)
      .is('auth_user_id', null);
    if (linked.error) throw new Error(linked.error.message);
    return 'linked-existing';
  }

  const inserted = await admin.from('customers').insert({
    auth_user_id: user.id,
    email: normalizedEmail,
    full_name: displayName(user),
    portal_account_linked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (inserted.error) throw new Error(inserted.error.message);
  return 'created-customer';
}

async function main() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const response = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (response.error) throw new Error(response.error.message);
    users.push(...response.data.users);
    if (response.data.users.length < 1000) break;
  }
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, role');
  if (profileError) throw new Error(profileError.message);
  const profilesById = new Map((profiles || []).map((row) => [String(row.id), row]));

  let profilesCreated = 0;
  let customerLinksRepaired = 0;
  for (const user of users.filter((entry) => entry.email_confirmed_at)) {
    let profile = profilesById.get(String(user.id));
    if (!profile) {
      const role = await roleForUser(user);
      const now = new Date().toISOString();
      const created = await admin.from('profiles').upsert(
        {
          id: user.id,
          email: email(user.email),
          full_name: displayName(user),
          display_name: displayName(user),
          role,
          active: true,
          updated_at: now,
        },
        { onConflict: 'id' },
      );
      if (created.error) throw new Error(created.error.message);
      profile = { id: user.id, role };
      profilesCreated += 1;
    }
    if (text(profile.role) === 'customer') {
      const result = await ensureCustomerLink(user);
      if (result !== 'already-linked') customerLinksRepaired += 1;
    }
  }

  console.log(
    `Customer account repair complete: ${profilesCreated} profiles created, ${customerLinksRepaired} CRM links repaired.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
