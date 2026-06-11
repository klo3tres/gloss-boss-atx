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
  const { data, error } = await supabase.from('site_settings').select('*');
  if (error) {
    console.error('Error fetching settings:', error);
  } else {
    console.log('Site settings keys:', data.map(d => d.key));
    const visuals = data.find(d => d.key === 'homepage_visuals');
    if (visuals) {
      console.log('homepage_visuals exists:', visuals.value);
    } else {
      console.log('homepage_visuals does NOT exist in site_settings');
    }
  }
}

run();
