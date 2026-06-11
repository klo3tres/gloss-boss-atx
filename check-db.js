const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Parse .env.local manually
const envFile = fs.readFileSync('./.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
  const { data: appts, error: apptErr } = await supabase.from('appointments').select('id, status, guest_name').limit(5);
  console.log('Appts:', appts);
  
  const { data: sigs, error: sigErr } = await supabase.from('signed_agreements').select('*').limit(5);
  console.log('Signed agreements:', sigs);
}

run();
