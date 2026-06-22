const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const env = {};
for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const i = line.indexOf('=');
  if (i < 1 || line.trim().startsWith('#')) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
}

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const EUGENE = 'b1b8e56c-9eec-4ea9-bcb8-60cda7311301';
const JARVIS = 'c4e49bc9-4dd8-4f9c-a931-9879a20f57e3';
const JARVIS_STRIPE = 'dbf0d651-68c1-47c2-995c-aaebdcde4a39';
const JARVIS_STRIPE_DUP = '9b393e70-a173-430f-b7e7-0a29309fb35f';
const JARVIS_ZELLE = 'c1ea6ed1-f5b9-4bd6-bab2-149fcf5949f3';
const JARVIS_RECEIPT = '46d5ea2d-c876-4791-8671-3d87918de1d3';
const EUGENE_RECEIPT = 'd7ed670e-2675-412a-b4f6-8f96fdb95355';

async function update(table, id, patch) {
  const { error } = await db.from(table).update(patch).eq('id', id);
  if (error) throw new Error(`${table} ${id}: ${error.message}`);
}

async function main() {
  const now = new Date().toISOString();

  await update('appointments', EUGENE, {
    deposit_amount_cents: 0,
    balance_due_cents: 0,
    payment_status: 'paid_cash',
    updated_at: now,
  });

  await update('payments', JARVIS_STRIPE, {
    appointment_id: JARVIS,
    amount_cents: 5814,
    status: 'succeeded',
    payment_method: 'stripe',
    payment_kind: 'deposit',
    provider: 'stripe',
    is_test: false,
    exclude_from_revenue: false,
    voided_at: null,
    metadata: {
      source: 'jarvis_stripe_reconcile',
      reconciled: true,
      match_reason: 'stripe_payment_intent_and_checkout_session',
      payment_truth_repaired_at: now,
    },
    updated_at: now,
  });

  await update('payments', JARVIS_ZELLE, {
    appointment_id: JARVIS,
    amount_cents: 15000,
    status: 'succeeded',
    payment_method: 'zelle',
    payment_kind: 'balance',
    is_test: false,
    exclude_from_revenue: false,
    voided_at: null,
    metadata: {
      source: 'admin_manual',
      note: 'Final in-person balance paid by Zelle; amount above invoice remains visible as overpayment.',
      payment_truth_repaired_at: now,
    },
    updated_at: now,
  });

  await update('payments', JARVIS_STRIPE_DUP, {
    status: 'voided',
    exclude_from_revenue: true,
    voided_at: now,
    metadata: {
      source: 'repair_jarvis_wo',
      duplicate_of_stripe: true,
      merged_into_payment_id: JARVIS_STRIPE,
      merged_at: now,
    },
    updated_at: now,
  });

  const { data: jarvisRows, error: jarvisErr } = await db.from('payments').select('id, metadata').eq('appointment_id', JARVIS);
  if (jarvisErr) throw jarvisErr;
  for (const row of jarvisRows || []) {
    if ([JARVIS_STRIPE, JARVIS_ZELLE].includes(row.id)) continue;
    await update('payments', row.id, {
      status: 'voided',
      exclude_from_revenue: true,
      voided_at: now,
      metadata: { ...(row.metadata || {}), duplicate_or_invalid_for_order: true, payment_truth_repaired_at: now },
      updated_at: now,
    });
  }

  await update('appointments', JARVIS, {
    deposit_amount_cents: 5814,
    balance_due_cents: 0,
    payment_status: 'paid',
    deposit_paid_at: '2026-05-16T19:32:40.780Z',
    updated_at: now,
  });

  for (const [appointmentId, keepId] of [[EUGENE, EUGENE_RECEIPT], [JARVIS, JARVIS_RECEIPT]]) {
    const { data: receipts, error } = await db.from('receipts').select('id, metadata').eq('appointment_id', appointmentId);
    if (error) throw error;
    for (const receipt of receipts || []) {
      await update('receipts', receipt.id, {
        exclude_from_revenue: receipt.id !== keepId,
        metadata: {
          ...(receipt.metadata || {}),
          canonical_display_receipt: receipt.id === keepId,
          revenue_source: 'payments',
          payment_truth_repaired_at: now,
        },
      });
    }
  }

  const { data: check, error: checkErr } = await db
    .from('payments')
    .select('id, appointment_id, amount_cents, status, payment_method, payment_kind, is_test, exclude_from_revenue')
    .in('appointment_id', [EUGENE, JARVIS])
    .order('appointment_id');
  if (checkErr) throw checkErr;
  const active = (check || []).filter((p) => ['succeeded', 'paid'].includes(p.status) && !p.is_test && !p.exclude_from_revenue);
  console.log(JSON.stringify({ active, total_cents: active.reduce((sum, p) => sum + p.amount_cents, 0) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
