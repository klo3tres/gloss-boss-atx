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
  const { data, error } = await supabase.from('loyalty_card_designs').select('*').limit(3);
  console.log('loyalty_card_designs data:', data);
  console.log('error:', error);

  // Test insert
  const { data: ins, error: insErr } = await supabase.from('loyalty_card_designs').insert({
    name: 'Test Design',
    tier: 'default',
    front_image_url: 'https://placehold.co/600x400',
    back_image_url: 'https://placehold.co/600x400'
  }).select('id').maybeSingle();
  console.log('Insert test result:', ins, 'error:', insErr);

  // Clean up test insert
  if (ins?.id) {
    const { error: delErr } = await supabase.from('loyalty_card_designs').delete().eq('id', ins.id);
    console.log('Cleanup error:', delErr);
  }
}

run();
