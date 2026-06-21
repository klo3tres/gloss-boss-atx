const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { fetchPaymentsSince, summarizePayments, buildRevenueDiagnostics } = require('./src/lib/revenue-metrics');

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
  const fromIso = '2026-05-19T00:00:00.000Z'; // rolling 30 days or similar
  const now = new Date().toISOString();
  console.log(`Fetching payments since ${fromIso}...`);
  const rows = await fetchPaymentsSince(supabase, fromIso, now);
  console.log(`Fetched ${rows.length} rows.`);

  // Let's get apptById map
  const apptIds = [...new Set(rows.map(r => r.appointment_id).filter(Boolean))];
  const apptById = new Map();
  if (apptIds.length > 0) {
    const { data: appts } = await supabase.from('appointments').select('id, guest_email, guest_name, status, is_test').in('id', apptIds);
    if (appts) {
      appts.forEach(a => apptById.set(a.id, a));
    }
  }

  const summary = summarizePayments(rows, { excludeTest: true, apptById });
  console.log('Revenue Summary:', {
    gross: summary.grossCents / 100,
    cash: summary.cashCents / 100,
    zelle: summary.zelleCents / 100,
    stripe: summary.stripeCents / 100,
    other: summary.otherCents / 100,
    venmo: summary.venmoCents / 100,
    cashApp: summary.cashAppCents / 100,
    paymentCount: summary.paymentCount
  });

  const diagnostics = buildRevenueDiagnostics(rows, { excludeTest: true, apptById });
  console.log('Diagnostics rowsLoaded:', diagnostics.rowsLoaded);
  console.log('Diagnostics rowsCounted:', diagnostics.rowsCounted);
  console.log('Diagnostics rowsExcluded:', diagnostics.rowsExcluded);
  console.log('Diagnostics gross:', diagnostics.grossCents / 100);

  console.log('\nIncluded Rows:');
  diagnostics.auditRows.filter(r => r.included).forEach(r => {
    const appt = apptById.get(r.appointmentId);
    console.log(`- [${r.sourceTable}] ID: ${r.id} | Amount: $${(r.amountCents/100).toFixed(2)} | Method: ${r.method} | ApptID: ${r.appointmentId} (${appt ? appt.status : 'None'}, Test: ${appt ? appt.is_test : 'N/A'})`);
  });

  console.log('\nExcluded Rows:');
  diagnostics.auditRows.filter(r => !r.included).forEach(r => {
    console.log(`- [${r.sourceTable}] ID: ${r.id} | Amount: $${(r.amountCents/100).toFixed(2)} | Method: ${r.method} | Reason: ${r.reason}`);
  });
}

run();
