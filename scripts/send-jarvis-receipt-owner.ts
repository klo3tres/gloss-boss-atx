/**

 * Send receipt for Jarvis Henderson job ONLY to glossbossatx1@gmail.com.

 * Applies online discount via pricing engine when booking_source is online.

 * Run: npx tsx scripts/send-jarvis-receipt-owner.ts

 */

import fs from 'fs';

import path from 'path';

import { createClient } from '@supabase/supabase-js';

import { buildUnifiedReceiptView } from '../src/lib/unified-receipt';

import { formatTotalsRow } from '../src/lib/receipt-totals';

import { resendConfigured, sendResendHtml } from '../src/lib/email-send';

import { applyWorkOrderDiscountViaPricingEngine } from '../src/lib/work-order-discount-apply';

import type { Row } from '../src/lib/work-order-resolve';



const JARVIS_APPOINTMENT_ID = 'c4e49bc9-4dd8-4f9c-a931-9879a20f57e3';

const OWNER_EMAIL = 'glossbossatx1@gmail.com';



const root = path.join(__dirname, '..');

const envPath = path.join(root, '.env.local');

for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {

  const t = line.trim();

  if (!t || t.startsWith('#')) continue;

  const i = t.indexOf('=');

  if (i < 1) continue;

  const k = t.slice(0, i).trim();

  let v = t.slice(i + 1).trim();

  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);

  if (!process.env[k]) process.env[k] = v;

}



const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;

const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });



function str(v: unknown) {

  return v == null ? '' : String(v).trim();

}



async function main() {

  console.log('\n=== Jarvis Henderson — owner receipt send ===');

  console.log('Appointment:', JARVIS_APPOINTMENT_ID);

  console.log('To (only):', OWNER_EMAIL);



  const { data: jobRow } = await admin.from('appointments').select('*').eq('id', JARVIS_APPOINTMENT_ID).maybeSingle();

  if (!jobRow) throw new Error('Jarvis Henderson appointment not found');



  let job = jobRow as Row;

  console.log('Customer:', str(job.guest_name));

  console.log('booking_source:', str(job.booking_source));



  if (process.argv.includes('--apply-pricing-discounts') && str(job.booking_source) === 'online') {
    const applied = await applyWorkOrderDiscountViaPricingEngine(admin, JARVIS_APPOINTMENT_ID, 'online', true);
    if (applied.ok) {
      console.log('Online discount applied:', applied.message);
      job = applied.job;
    } else {
      console.warn('Online discount not applied:', applied.error);
    }
  }



  const { data: receiptRow } = await admin

    .from('receipts')

    .select('id, receipt_number, status')

    .eq('appointment_id', JARVIS_APPOINTMENT_ID)

    .order('updated_at', { ascending: false })

    .limit(1)

    .maybeSingle();



  const receiptNumber =

    str((receiptRow as { receipt_number?: string } | null)?.receipt_number) ||

    `RCPT-${JARVIS_APPOINTMENT_ID.slice(0, 8).toUpperCase()}`;

  const receiptId = str((receiptRow as { id?: string } | null)?.id);



  const view = await buildUnifiedReceiptView(admin, {

    job,

    appointmentId: JARVIS_APPOINTMENT_ID,

    receiptNumber,

    receiptId: receiptId || undefined,

  });



  const ledger = formatTotalsRow(view.parity.ledger);

  const email = formatTotalsRow(view.parity.email);

  console.log('\n--- Totals before send ---');

  console.log('Ledger  subtotal/discounts/final/paid/balance:', [

    ledger.grossSubtotal,

    ledger.totalDiscounts,

    ledger.finalTotal,

    ledger.totalPaid,

    ledger.balanceDue,

  ].join(' | '));

  console.log('Email   subtotal/discounts/final/paid/balance:', [

    email.grossSubtotal,

    email.totalDiscounts,

    email.finalTotal,

    email.totalPaid,

    email.balanceDue,

  ].join(' | '));

  console.log('Parity allMatch:', view.parity.allMatch);

  if (!view.parity.allMatch) {

    console.error('Mismatches:', view.parity.mismatches);

    process.exit(1);

  }



  const hasTotalPaid = /Total paid/i.test(view.emailHtml);

  const hasBalanceDue = /Balance due/i.test(view.emailHtml);

  console.log('Email HTML Total paid:', hasTotalPaid ? 'yes' : 'MISSING');

  console.log('Email HTML Balance due:', hasBalanceDue ? 'yes' : 'MISSING');



  if (!resendConfigured()) {

    console.error('\nResend not configured — set RESEND_API_KEY in .env.local');

    process.exit(1);

  }



  const sent = await sendResendHtml({

    to: OWNER_EMAIL,

    subject: `Gloss Boss ATX receipt ${view.receiptNumber} (Jarvis Henderson — owner copy)`,

    html: view.emailHtml,

  });



  if (!sent.ok) {

    console.error('Send failed:', sent.error);

    process.exit(1);

  }



  console.log('\nSent to', OWNER_EMAIL, sent.emailId ? `(id: ${sent.emailId})` : '');

  console.log('Customer guest_email was NOT used.\n');

}



main().catch((e) => {

  console.error(e);

  process.exit(1);

});


