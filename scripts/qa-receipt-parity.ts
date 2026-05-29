/**
 * Receipt totals parity — ledger, preview, PDF input, email (no browser).
 * Run: npx tsx scripts/qa-receipt-parity.ts [appointmentId] [--seed-qa-discounts]
 *
 * Discounts: use --seed-qa-discounts only for synthetic multi-car QA.
 * Otherwise discounts must already exist via UI / applyWorkOrderDiscountViaPricingEngine.
 */
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { buildUnifiedReceiptView } from '../src/lib/unified-receipt';
import { formatTotalsRow } from '../src/lib/receipt-totals';
import { resolveJobPricing } from '../src/lib/job-pricing-display';
import { fetchPaymentsForJob } from '../src/lib/payments-resolve';
import { applyWorkOrderDiscountViaPricingEngine } from '../src/lib/work-order-discount-apply';
import {
  mergePricingBreakdownWithLineItems,
  readCustomLineItems,
  type WorkOrderLineItem,
} from '../src/lib/work-order-line-items';
import type { Row } from '../src/lib/work-order-resolve';

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

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function pickAppointmentId(): Promise<string> {
  const arg = args[0]?.trim();
  if (arg) return arg;

  const { data } = await admin
    .from('appointments')
    .select('id, guest_name, booking_vehicles, created_at')
    .not('status', 'eq', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(30);

  for (const row of data ?? []) {
    const vehicles = (row as { booking_vehicles?: unknown }).booking_vehicles;
    if (Array.isArray(vehicles) && vehicles.length >= 2) return String((row as { id: string }).id);
  }
  const first = data?.[0] as { id?: string } | undefined;
  if (first?.id) return String(first.id);
  throw new Error('No appointments found');
}

/** @deprecated DB-only seed — invalid for online/multi-car parity. Use --seed-qa-discounts only. */
async function seedWorkOrderDbOnly(apptId: string) {
  console.warn('WARN: --seed-qa-discounts uses DB-only breakdown JSON (invalid for online/multi-car). Prefer UI pricing engine.');
  const { data: jobRow } = await admin.from('appointments').select('*').eq('id', apptId).maybeSingle();
  if (!jobRow) throw new Error('Appointment not found');

  const job = jobRow as Row;
  const vehicles = Array.isArray(job.booking_vehicles) ? [...(job.booking_vehicles as Row[])] : [];
  if (vehicles.length < 2) {
    const base = vehicles[0] ?? {
      service_slug: 'exterior-wash',
      vehicle_class: 'sedan',
      vehicle_description: '2020 Honda Accord',
      vehicle_color: 'Black',
      price_cents: 6000,
    };
    vehicles.push({
      ...base,
      vehicle_description: '2019 Toyota Camry',
      vehicle_color: 'Silver',
      price_cents: 6000,
    });
  }

  const vehicleSubtotalCents = vehicles.reduce((s, v) => s + (typeof v.price_cents === 'number' ? v.price_cents : 6000), 0);
  const onlineDiscountCents = 500;
  const multiCarDiscountCents = 1000;
  const manualDiscountCents = 300;

  const items: WorkOrderLineItem[] = readCustomLineItems(job).filter((i) => i.kind !== 'discount_adjustment');
  items.push({
    id: `qa-manual-${Date.now()}`,
    kind: 'discount_adjustment',
    label: 'QA manual discount',
    amountCents: -manualDiscountCents,
    customerVisible: true,
    createdAt: new Date().toISOString(),
    createdBy: 'qa-script',
  });

  const finalTotalCents = Math.max(
    0,
    vehicleSubtotalCents - onlineDiscountCents - multiCarDiscountCents - manualDiscountCents,
  );

  const breakdown = mergePricingBreakdownWithLineItems(job, items, {
    vehicleSubtotalCents,
    addOnSubtotalCents: 0,
    onlineDiscountCents,
    multiCarDiscountCents,
    promoDiscountCents: 0,
    manualDiscountCents,
    prePromoCents: vehicleSubtotalCents,
    finalTotalCents,
    customLineItemsCents: -manualDiscountCents,
  });

  await admin
    .from('appointments')
    .update({
      booking_vehicles: vehicles,
      booking_pricing_breakdown: breakdown,
      base_price_cents: finalTotalCents,
      balance_due_cents: finalTotalCents,
      updated_at: new Date().toISOString(),
    })
    .eq('id', apptId);

  const { data: refreshed } = await admin.from('appointments').select('*').eq('id', apptId).maybeSingle();
  return refreshed as Row;
}

async function applyPricingEngineDiscounts(apptId: string, job: Row): Promise<Row> {
  const vehicles = Array.isArray(job.booking_vehicles) ? job.booking_vehicles : [];
  let current = job;

  if (str(job.booking_source) === 'online') {
    const online = await applyWorkOrderDiscountViaPricingEngine(admin, apptId, 'online', true);
    if (!online.ok) console.warn('Online discount:', online.error);
    else {
      console.log('Applied online discount (pricing engine):', online.message);
      current = online.job;
    }
  }

  if (vehicles.length >= 2) {
    const multi = await applyWorkOrderDiscountViaPricingEngine(admin, apptId, 'multi_car', true);
    if (!multi.ok) console.warn('Multi-car discount:', multi.error);
    else {
      console.log('Applied multi-car discount (pricing engine):', multi.message);
      current = multi.job;
    }
  }

  return current;
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function printParityTable(view: Awaited<ReturnType<typeof buildUnifiedReceiptView>>) {
  const ledger = formatTotalsRow(view.parity.ledger);
  const receiptView = formatTotalsRow(view.parity.receiptView);
  const pdf = formatTotalsRow(view.parity.pdf);
  const email = formatTotalsRow(view.parity.email);

  console.log('\n--- Parity table ---');
  console.log('allMatch:', view.parity.allMatch);
  if (view.parity.mismatches.length) {
    console.log('mismatches:');
    for (const m of view.parity.mismatches) console.log('  -', m);
  }
  const rows = [
    ['Field', 'Ledger', 'Preview', 'PDF', 'Email'],
    ['Subtotal', ledger.grossSubtotal, receiptView.grossSubtotal, pdf.grossSubtotal, email.grossSubtotal],
    ['Discounts', ledger.totalDiscounts, receiptView.totalDiscounts, pdf.totalDiscounts, email.totalDiscounts],
    ['Final', ledger.finalTotal, receiptView.finalTotal, pdf.finalTotal, email.finalTotal],
    ['Paid', ledger.totalPaid, receiptView.totalPaid, pdf.totalPaid, email.totalPaid],
    ['Balance', ledger.balanceDue, receiptView.balanceDue, pdf.balanceDue, email.balanceDue],
  ];
  for (const r of rows) console.log(r.map((c) => String(c).padEnd(14)).join(''));

  const html = view.emailHtml;
  const hasTotalPaid = /Total paid/i.test(html);
  const hasBalanceDue = /Balance due/i.test(html);
  console.log('\nEmail HTML payment summary:');
  console.log('  Total paid line:', hasTotalPaid ? 'yes' : 'MISSING');
  console.log('  Balance due line:', hasBalanceDue ? 'yes' : 'MISSING');

  return { allMatch: view.parity.allMatch, hasTotalPaid, hasBalanceDue };
}

async function main() {
  const apptId = await pickAppointmentId();
  console.log('\n=== Receipt parity QA ===');
  console.log('Appointment / work order ID:', apptId);

  let job: Row;
  if (flags.has('--seed-qa-discounts')) {
    job = await seedWorkOrderDbOnly(apptId);
  } else {
    const { data: jobRow } = await admin.from('appointments').select('*').eq('id', apptId).maybeSingle();
    if (!jobRow) throw new Error('Appointment not found');
    job = jobRow as Row;
    if (flags.has('--apply-pricing-discounts')) {
      job = await applyPricingEngineDiscounts(apptId, job);
    }
  }

  const { data: guest } = await admin.from('appointments').select('guest_name, booking_source').eq('id', apptId).maybeSingle();
  console.log('Customer:', (guest as { guest_name?: string })?.guest_name ?? '—');
  console.log('booking_source:', (guest as { booking_source?: string })?.booking_source ?? '—');

  const payments = await fetchPaymentsForJob(admin, job, { appointmentId: apptId, isFallback: false });
  const pricing = resolveJobPricing(job, payments);
  console.log('Pricing:', money(pricing.finalTotalCents), 'paid:', money(pricing.totalPaidCents), 'balance:', money(pricing.remainingBalanceCents));
  console.log('Ledger discounts count:', (await buildUnifiedReceiptView(admin, { job, appointmentId: apptId, receiptNumber: `QA-${apptId.slice(0, 8)}` })).ledger.discounts.length);

  const view = await buildUnifiedReceiptView(admin, {
    job,
    appointmentId: apptId,
    receiptNumber: `QA-${apptId.slice(0, 8)}`,
  });

  const result = printParityTable(view);
  console.log('\nLedger warnings:', view.ledger.warnings?.length ? view.ledger.warnings : '(none)');

  if (!result.allMatch) {
    console.error('\nFAIL: parity mismatch — fix before customer send.');
    process.exit(1);
  }
  if (!result.hasTotalPaid || !result.hasBalanceDue) {
    console.error('\nFAIL: email HTML missing Total paid or Balance due summary.');
    process.exit(1);
  }
  console.log('\nPASS: All five fields match (ledger / preview / PDF / email).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
