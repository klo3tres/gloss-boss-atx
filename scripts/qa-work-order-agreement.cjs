#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}
const base = process.argv[2] || 'http://localhost:3000';
const apptId = process.argv[3];
if (!apptId) {
  console.error('Usage: node qa-work-order-agreement.cjs [baseUrl] <appointmentId>');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function sb(q) {
  const r = await fetch(`${url}/rest/v1/${q}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  return r.json();
}

async function main() {
  const appt = (await sb(`appointments?id=eq.${apptId}&select=access_token`))[0];
  const token = appt?.access_token;
  const ack = await fetch(`${base}/acknowledgement/${apptId}?token=${token}`, { redirect: 'manual' });
  console.log('acknowledgement', ack.status, ack.headers.get('location'));
  const sign = await fetch(`${base}/api/agreements/sign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appointmentId: apptId,
      accessToken: token,
      signerLegalName: 'QA FREE Flow',
      signatureType: 'typed',
      signatureData: 'QA FREE Flow',
      acknowledged: true,
    }),
  });
  console.log('sign', sign.status, await sign.text());
  const signed = await sb(`signed_agreements?appointment_id=eq.${apptId}&select=id`);
  console.log('signed_agreements', JSON.stringify(signed));
  const after = await sb(`appointments?id=eq.${apptId}&select=intake_completed_at`);
  console.log('intake_completed_at', JSON.stringify(after));
}

main();
