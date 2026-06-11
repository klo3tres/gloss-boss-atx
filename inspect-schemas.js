const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

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
  const { data: cms, error: cmsErr } = await supabase.from('cms_documents').select('*').limit(1);
  console.log('CMS Documents row sample:', cms);
  
  const { data: settings, error: setErr } = await supabase.from('settings').select('*').limit(1);
  console.log('Settings row sample:', settings);
}

run();
