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
  const { data: appts } = await supabase.from('appointments').select('*');
  console.log(`Total appointments: ${appts.length}`);
  
  for (const appt of appts) {
    console.log(`\nAppointment ID: ${appt.id}`);
    console.log(`Customer: ${appt.guest_name} | Status: ${appt.status} | Test: ${appt.is_test} | Base Price: $${(appt.base_price_cents/100).toFixed(2)}`);
    
    // Fetch payments for this appointment
    const { data: payments } = await supabase.from('payments').select('*').eq('appointment_id', appt.id);
    console.log(`  Payments (${payments.length}):`);
    payments.forEach(p => {
      console.log(`    - ID: ${p.id} | Amount: $${(p.amount_cents/100).toFixed(2)} | Method: ${p.payment_method} | Status: ${p.status} | Excluded: ${p.exclude_from_revenue} | Test: ${p.is_test} | Voided At: ${p.voided_at}`);
      if (p.metadata) console.log(`      Metadata: ${JSON.stringify(p.metadata)}`);
    });

    // Fetch receipts for this appointment
    const { data: receipts } = await supabase.from('receipts').select('*').eq('appointment_id', appt.id);
    console.log(`  Receipts (${receipts.length}):`);
    receipts.forEach(r => {
      const amt = r.amount_cents !== null ? r.amount_cents : r.final_total_cents;
      console.log(`    - ID: ${r.id} | Amount: $${(amt/100).toFixed(2)} | Method: ${r.payment_method} | Excluded: ${r.exclude_from_revenue} | Test: ${r.is_test} | Voided At: ${r.voided_at}`);
      if (r.metadata) console.log(`      Metadata: ${JSON.stringify(r.metadata)}`);
    });
  }
}

run();
