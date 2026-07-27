const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error('Password reset QA could not run: Supabase credentials are missing.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  const suffix = `${Date.now()}-${randomBytes(3).toString('hex')}`;
  const qaEmail = `gbqa-reset-${suffix}@example.invalid`;
  const oldPassword = `Old!${randomBytes(18).toString('base64url')}7`;
  const newPassword = `New!${randomBytes(18).toString('base64url')}9`;
  let authUserId = '';

  try {
    const created = await admin.auth.admin.createUser({
      email: qaEmail,
      password: oldPassword,
      email_confirm: true,
      user_metadata: { full_name: 'Gloss Boss Reset QA', is_test: true },
    });
    if (created.error || !created.data.user?.id) {
      throw new Error(created.error?.message || 'QA reset user could not be created.');
    }
    authUserId = created.data.user.id;

    const generated = await admin.auth.admin.generateLink({
      type: 'recovery',
      email: qaEmail,
      options: {
        redirectTo:
          'https://www.glossbossatx.com/auth/callback?next=%2Freset-password%3Fnext%3D%252Fbooking%252Fqa-return&type=recovery',
      },
    });
    const tokenHash = generated.data?.properties?.hashed_token;
    if (generated.error || !tokenHash) {
      throw new Error(generated.error?.message || 'Recovery token could not be generated.');
    }

    const recoveryClient = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const verified = await recoveryClient.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    });
    if (verified.error || !verified.data.session?.user) {
      throw new Error(verified.error?.message || 'Recovery token did not establish a session.');
    }

    const updated = await recoveryClient.auth.updateUser({ password: newPassword });
    if (updated.error) throw new Error(updated.error.message);
    await recoveryClient.auth.signOut();

    const oldLogin = await recoveryClient.auth.signInWithPassword({
      email: qaEmail,
      password: oldPassword,
    });
    if (!oldLogin.error) throw new Error('The old password still authenticated after reset.');

    const newLogin = await recoveryClient.auth.signInWithPassword({
      email: qaEmail,
      password: newPassword,
    });
    if (newLogin.error || !newLogin.data.session?.user) {
      throw new Error(newLogin.error?.message || 'The new password did not authenticate.');
    }
    console.log('Password reset QA passed: recovery session, password update, and new login are operational.');
  } finally {
    if (authUserId) await admin.auth.admin.deleteUser(authUserId);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
