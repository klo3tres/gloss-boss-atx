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
  const pRes = await supabase.from('job_photos').select('*').limit(2);
  console.log('--- job_photos sample ---');
  console.log(JSON.stringify(pRes.data, null, 2));
  console.log('job_photos error:', pRes.error);

  const mRes = await supabase.from('job_media').select('*').limit(2);
  console.log('--- job_media sample ---');
  console.log(JSON.stringify(mRes.data, null, 2));
  console.log('job_media error:', mRes.error);

  // also let's look at all rows to see how many have photos
  const pCount = await supabase.from('job_photos').select('id', { count: 'exact', head: true });
  const mCount = await supabase.from('job_media').select('id', { count: 'exact', head: true });
  console.log(`Counts: job_photos: ${pCount.count}, job_media: ${mCount.count}`);
}

run();
