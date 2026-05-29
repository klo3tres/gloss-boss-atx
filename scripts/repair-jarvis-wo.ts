/**
 * Repair Jarvis Henderson WO: correct vehicle prices, engine discounts, payments, receipt totals.
 * Run: npx tsx scripts/repair-jarvis-wo.ts
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { computeBookingPricing } from '../src/lib/booking-pricing';
import { loadDealConfigForBooking } from '../src/lib/booking-server-shared';
import { isPricingDuplicateOrPaymentLine } from '../src/lib/pricing-custom-lines';
import { resolveJobPricing, syncJobBalanceDue } from '../src/lib/job-pricing-display';
import { fetchPaymentsForJob } from '../src/lib/payments-resolve';
import { resolveOrderLedger } from '../src/lib/order-ledger';
import { buildUnifiedReceiptView } from '../src/lib/unified-receipt';
import { formatTotalsRow } from '../src/lib/receipt-totals';
import { readCustomLineItems } from '../src/lib/work-order-line-items';
import { vehiclesFromRow, type Row } from '../src/lib/work-order-resolve';

const ID = 'c4e49bc9-4dd8-4f9c-a931-9879a20f57e3';
const DEPOSIT_CENTS = 5814;
const ZELLE_CENTS = 15000;

const root = path.join(__dirname, '..');
for (const line of fs.readFileSync(path.join(root, '.env.local'), 'utf8').split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (!process.env[k]) process.env[k] = v;
}

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

async function main() {
  const { data: jobRow } = await admin.from('appointments').select('*').eq('id', ID).maybeSingle();
  if (!jobRow) throw new Error('Jarvis appointment not found');

  const job = jobRow as Row;
  const depositOnFile = typeof job.deposit_amount_cents === 'number' ? job.deposit_amount_cents : DEPOSIT_CENTS;
  const targetFinalCents = Math.round(depositOnFile / 0.3);

  const vehicles = vehiclesFromRow(job).map((v) => ({
    ...v,
    price_cents: 12000,
  }));

  const deals = await loadDealConfigForBooking(admin);
  const lineCents = vehicles.map((v) => (typeof v.price_cents === 'number' ? v.price_cents : 12000));
  const quote = computeBookingPricing({
    vehicleLineCents: lineCents,
    addOnCentsSum: 0,
    deals: { ...deals, websitePromoActive: true },
    claimedOffer: null,
    depositPercent: 30,
  });
  if ('kind' in quote) throw new Error('Invalid pricing');

  const keptCustom = readCustomLineItems(job).filter((i) => !isPricingDuplicateOrPaymentLine(i));

  const breakdown = {
    ...(job.booking_pricing_breakdown as Record<string, unknown>),
    ...quote,
    customLineItems: keptCustom,
    customLineItemsCents: keptCustom.reduce((s, i) => s + i.amountCents, 0),
    onlineDiscountDisabled: false,
    multiCarDisabled: false,
    adminOverrideFinalTotalCents: undefined,
    adminOverrideReason: undefined,
    balanceClearedAt: undefined,
    balanceClearedBy: undefined,
    balanceClearedReason: undefined,
  };

  const finalTotalCents = quote.finalTotalCents;
  console.log('Target final (from deposit):', (targetFinalCents / 100).toFixed(2));
  console.log('Engine final:', (finalTotalCents / 100).toFixed(2));
  console.log('Multi-car −', (quote.multiCarDiscountCents / 100).toFixed(2));
  console.log('Online −', (quote.websitePromoDiscountCents / 100).toFixed(2));

  await admin
    .from('appointments')
    .update({
      booking_vehicles: vehicles,
      booking_pricing_breakdown: breakdown,
      base_price_cents: finalTotalCents,
      deposit_amount_cents: quote.depositCents,
      balance_due_cents: Math.max(0, finalTotalCents - DEPOSIT_CENTS - ZELLE_CENTS),
      updated_at: new Date().toISOString(),
    })
    .eq('id', ID);

  const { data: existingPay } = await admin.from('payments').select('id, amount_cents, status, payment_method, payment_kind').eq('appointment_id', ID);
  const hasDeposit = (existingPay ?? []).some(
    (p) =>
      (p as { status: string }).status !== 'voided' &&
      (String((p as { payment_kind?: string }).payment_kind).includes('deposit') ||
        ((p as { amount_cents: number }).amount_cents === DEPOSIT_CENTS &&
          !String((p as { payment_method?: string }).payment_method).includes('zelle'))),
  );

  if (!hasDeposit) {
    const { error: insErr } = await admin.from('payments').insert({
      appointment_id: ID,
      amount_cents: DEPOSIT_CENTS,
      status: 'succeeded',
      payment_method: 'stripe',
      payment_kind: 'deposit',
      paid_at: job.created_at ?? new Date().toISOString(),
      metadata: { source: 'repair_jarvis_wo', note: 'Stripe booking deposit $58.14' },
    });
    if (insErr) console.warn('Deposit payment insert:', insErr.message);
    else console.log('Inserted Stripe deposit payment $58.14');
  }

  const { data: refreshed } = await admin.from('appointments').select('*').eq('id', ID).single();
  const fresh = refreshed as Row;
  const payments = await fetchPaymentsForJob(admin, fresh, { appointmentId: ID, isFallback: false });
  const pricing = resolveJobPricing(fresh, payments);
  await syncJobBalanceDue(admin, fresh, pricing, { appointmentId: ID, isFallback: false });

  const ledger = await resolveOrderLedger(admin, { workOrderId: ID, appointmentId: ID });
  const view = await buildUnifiedReceiptView(admin, { job: fresh, appointmentId: ID, receiptNumber: 'REPAIR-QA' });

  console.log('\n--- After repair ---');
  console.log('Pricing:', {
    final: (pricing.finalTotalCents / 100).toFixed(2),
    paid: (pricing.totalPaidCents / 100).toFixed(2),
    deposit: (pricing.depositPaidCents / 100).toFixed(2),
    zelle: (pricing.zellePaidCents / 100).toFixed(2),
    balance: (pricing.remainingBalanceCents / 100).toFixed(2),
    onlineDisc: (pricing.onlineDiscountCents / 100).toFixed(2),
    multiDisc: (pricing.multiCarDiscountCents / 100).toFixed(2),
  });
  console.log('Ledger discounts:', ledger?.discounts.map((d) => `${d.label} −$${(d.amountCents / 100).toFixed(2)}`));
  const row = formatTotalsRow(view.parity.ledger);
  console.log('Receipt totals:', row);
  console.log('Parity:', view.parity.allMatch, view.parity.mismatches);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
