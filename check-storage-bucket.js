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
  const { data: buckets, error: bucketErr } = await supabase.storage.listBuckets();
  console.log('Buckets:', buckets);
  console.log('Error listing buckets:', bucketErr);

  const testBuf = Buffer.from('test data');
  const { data: up, error: upErr } = await supabase.storage
    .from('loyalty-cards')
    .upload('test/test-upload.txt', testBuf, { contentType: 'text/plain', upsert: true });
  console.log('Upload test result:', up);
  console.log('Upload error:', upErr);

  if (up) {
    const { data: del, error: delErr } = await supabase.storage
      .from('loyalty-cards')
      .remove(['test/test-upload.txt']);
    console.log('Cleanup result:', del, 'error:', delErr);
  }
}

run();
