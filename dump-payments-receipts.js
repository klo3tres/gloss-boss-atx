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
  console.log('--- DUMPING PAYMENTS ---');
  const { data: payments, error: pError } = await supabase
    .from('payments')
    .select('id, amount_cents, status, payment_method, payment_kind, voided_at, created_at, paid_at, appointment_id, stripe_checkout_session_id, stripe_payment_intent_id, provider, is_test, exclude_from_revenue, refunded_at, metadata');
  if (pError) {
    console.error('Payments fetch error:', pError);
  } else {
    console.log(`Fetched ${payments.length} payments.`);
    for (const p of payments) {
      let apptDetails = 'None';
      if (p.appointment_id) {
        const { data: appt } = await supabase.from('appointments').select('status, is_test, guest_name, base_price_cents').eq('id', p.appointment_id).maybeSingle();
        if (appt) {
          apptDetails = `Appt Status: ${appt.status}, Test: ${appt.is_test}, Customer: ${appt.guest_name}, Base Price: $${(appt.base_price_cents/100).toFixed(2)}`;
        } else {
          apptDetails = 'Appt ID exists but appt not found';
        }
      }
      console.log(`ID: ${p.id} | Amount: $${(p.amount_cents/100).toFixed(2)} | Status: ${p.status} | Method: ${p.payment_method} | Excluded: ${p.exclude_from_revenue} | Test: ${p.is_test} | Linked Appt: ${apptDetails}`);
      if (p.metadata) {
        console.log(`  Metadata: ${JSON.stringify(p.metadata)}`);
      }
    }
  }

  console.log('\n--- DUMPING RECEIPTS ---');
  const { data: receipts, error: rError } = await supabase
    .from('receipts')
    .select('id, payment_id, amount_cents, final_total_cents, payment_method, created_at, appointment_id, metadata, is_test, exclude_from_revenue, voided_at, refunded_at');
  if (rError) {
    console.error('Receipts fetch error:', rError);
  } else {
    console.log(`Fetched ${receipts.length} receipts.`);
    for (const r of receipts) {
      let apptDetails = 'None';
      if (r.appointment_id) {
        const { data: appt } = await supabase.from('appointments').select('status, is_test, guest_name, base_price_cents').eq('id', r.appointment_id).maybeSingle();
        if (appt) {
          apptDetails = `Appt Status: ${appt.status}, Test: ${appt.is_test}, Customer: ${appt.guest_name}, Base Price: $${(appt.base_price_cents/100).toFixed(2)}`;
        } else {
          apptDetails = 'Appt ID exists but appt not found';
        }
      }
      const amt = r.amount_cents !== null ? r.amount_cents : r.final_total_cents;
      console.log(`ID: ${r.id} | Linked Pay ID: ${r.payment_id} | Amount: $${(amt/100).toFixed(2)} | Method: ${r.payment_method} | Excluded: ${r.exclude_from_revenue} | Test: ${r.is_test} | Voided At: ${r.voided_at} | Linked Appt: ${apptDetails}`);
      if (r.metadata) {
        console.log(`  Metadata: ${JSON.stringify(r.metadata)}`);
      }
    }
  }
}

run();
