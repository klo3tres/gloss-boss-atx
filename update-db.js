const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Read .env.local
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
  console.log('Updating payments and receipts for Jarvis Henderson...');
  
  // 1. Exclude stripe deposit dbf0d651-68c1-47c2-995c-aaebdcde4a39
  const { data: p1, error: e1 } = await supabase
    .from('payments')
    .update({ exclude_from_revenue: true, status: 'voided', voided_at: new Date().toISOString() })
    .eq('id', 'dbf0d651-68c1-47c2-995c-aaebdcde4a39')
    .select();
  if (e1) console.error('Error excluding dbf0d651:', e1);
  else console.log('Successfully excluded dbf0d651:', p1);

  // 2. Exclude Zelle payment c1ea6ed1-f5b9-4bd6-bab2-149fcf5949f3
  const { data: p2, error: e2 } = await supabase
    .from('payments')
    .update({ exclude_from_revenue: true, status: 'voided', voided_at: new Date().toISOString() })
    .eq('id', 'c1ea6ed1-f5b9-4bd6-bab2-149fcf5949f3')
    .select();
  if (e2) console.error('Error excluding c1ea6ed1:', e2);
  else console.log('Successfully excluded c1ea6ed1:', p2);

  // 3. Make sure Zelle receipt 46d5ea2d-c876-4791-8671-3d87918de1d3 is active
  const { data: r1, error: er1 } = await supabase
    .from('receipts')
    .update({ exclude_from_revenue: false, status: 'issued', voided_at: null, is_test: false })
    .eq('id', '46d5ea2d-c876-4791-8671-3d87918de1d3')
    .select();
  if (er1) console.error('Error enabling receipt 46d5ea2d:', er1);
  else console.log('Successfully enabled receipt 46d5ea2d:', r1);
}

run();
