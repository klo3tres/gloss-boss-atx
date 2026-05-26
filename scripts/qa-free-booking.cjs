#!/usr/bin/env node
/** One-shot FREE comp booking smoke test (localhost). */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const envPath = path.join(root, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 1) continue;
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] == null) process.env[key] = val;
  }
}

const base = process.argv[2] || 'http://localhost:3000';

function nextSlot() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
  d.setHours(14, 30, 0, 0);
  return d.toISOString();
}

async function main() {
  const body = {
    vehicles: [
      {
        serviceSlug: 'exterior-wash',
        vehicleClass: 'sedan',
        vehicleDescription: '2020 Honda Accord QA',
        vehicleColor: 'Black',
        addOnSlugs: [],
      },
    ],
    addOns: [],
    scheduledStart: nextSlot(),
    guestName: 'QA Admin Test',
    guestEmail: `qa-free-${Date.now()}@example.com`,
    guestPhone: '5125550199',
    serviceAddress: '123 Test St',
    serviceCity: 'Austin',
    serviceState: 'TX',
    serviceZip: '78701',
    serviceLocationType: 'house',
    waterAccess: 'yes',
    powerAccess: 'yes',
    parkingAccess: 'yes',
    promoCode: 'FREE',
    paymentChoice: 'full',
    notes: 'QA FREE comp smoke test',
  };

  const res = await fetch(`${base}/api/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  console.log('HTTP', res.status);
  console.log(JSON.stringify(json, null, 2));

  if (!res.ok) process.exit(1);
  if (!json.skipPayment) {
    console.error('FAIL: expected skipPayment true for FREE');
    process.exit(1);
  }
  if (!json.appointmentId) {
    console.error('FAIL: missing appointmentId');
    process.exit(1);
  }

  const adminKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  if (adminKey && url) {
    const apptId = json.appointmentId;
    const pay = await fetch(`${url}/rest/v1/payments?appointment_id=eq.${apptId}&select=status,amount_cents,payment_method`, {
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
    });
    const pays = await pay.json();
    console.log('payments', JSON.stringify(pays));
    const rec = await fetch(`${url}/rest/v1/receipts?appointment_id=eq.${apptId}&select=receipt_number,amount_cents,status`, {
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
    });
    console.log('receipts', JSON.stringify(await rec.json()));
    const wo = await fetch(`${url}/rest/v1/work_orders?appointment_id=eq.${apptId}&select=id,status`, {
      headers: { apikey: adminKey, Authorization: `Bearer ${adminKey}` },
    });
    console.log('work_orders', JSON.stringify(await wo.json()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
