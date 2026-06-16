import type { SupabaseClient } from '@supabase/supabase-js';
import type Stripe from 'stripe';
import {
  buildRevenueDiagnostics,
  fetchPaymentsSince,
  summarizePayments,
  type PayRow,
  type RevenueDiagnostics,
} from '@/lib/revenue-metrics';
import { classifyPaymentChannel, isPaymentVoided, isRealStripePayment, shouldExcludeFromCashRevenue } from '@/lib/payment-classification';
import {
  classifyOpenBalance,
  classifyPendingDeposit,
  isActionableOpenBalance,
  isActionablePendingDeposit,
  isStaleOpenBalance,
  isStalePendingDeposit,
  type OpenBalanceAppt,
} from '@/lib/open-balance-filters';
import { isTestLikeJob } from '@/lib/tech-job-filters';

export type FinancialSummary = {
  grossRevenueCents: number;
  refundsCents: number;
  stripeFeesCents: number;
  expensesCents: number;
  netProfitCents: number;
  payoutsCents: number;
};

export type FinancialDetailRow = {
  id: string;
  label: string;
  amountCents: number;
  occurredAt: string | null;
  source: string;
  category?: string | null;
  customer?: string | null;
  method?: string | null;
  href?: string | null;
};

export type FinancialSnapshot = {
  grossRevenueCents: number;
  cashRevenueCents: number;
  stripeRevenueCents: number;
  zelleRevenueCents: number;
  otherRevenueCents: number;
  membershipRevenueCents: number;
  refundsCents: number;
  stripeFeesCents: number;
  expensesCents: number;
  netProfitCents: number;
  pendingDepositsCents: number;
  openBalancesCents: number;
  paidInvoicesDepositsCents: number;
  payoutsCents: number;
  paymentsCount: number;
  receiptsCount: number;
  completedJobs: number;
  revenueByService: Array<{ label: string; count: number; revenueCents: number }>;
  revenueByTechnician: Array<{ label: string; count: number; revenueCents: number }>;
  revenueByVehicleType: Array<{ label: string; count: number; revenueCents: number }>;
  revenueByCustomer: Array<{ label: string; email: string | null; count: number; revenueCents: number }>;
  recentPayments: FinancialDetailRow[];
  recentExpenses: FinancialDetailRow[];
  openBalances: FinancialDetailRow[];
  pendingDeposits: FinancialDetailRow[];
  staleOpenBalances: FinancialDetailRow[];
  staleOpenBalancesCents: number;
  stalePendingDeposits: FinancialDetailRow[];
  stalePendingDepositsCents: number;
  creditsRedeemedCents: number;
  discountsCents: number;
  grossServiceValueCents: number;
  diagnostics: RevenueDiagnostics & {
    ledgerRowsLoaded: number;
    expenseRowsLoaded: number;
    businessExpenseRowsLoaded: number;
    mileageRowsLoaded: number;
    receiptsCount: number;
    completedJobsLoaded: number;
  };
};

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function dateInRange(iso: unknown, fromIso: string, toIso: string) {
  const s = str(iso);
  return s && s >= fromIso && s <= toIso;
}

function addBreakdown<T extends { count: number; revenueCents: number }>(
  map: Map<string, T>,
  key: string,
  fallback: T,
  amountCents: number,
) {
  const row = map.get(key) ?? fallback;
  row.count += 1;
  row.revenueCents += amountCents;
  map.set(key, row);
}

async function safeSelect(db: SupabaseClient, table: string, select: string, dateCol: string, fromIso: string, toIso: string) {
  const res = await db.from(table).select(select).gte(dateCol, fromIso).lte(dateCol, toIso).limit(10000);
  return res.error ? [] : (((res.data ?? []) as unknown) as Record<string, unknown>[]);
}

async function loadBusinessExpenses(db: SupabaseClient, fromIso: string, toIso: string) {
  let rows = await safeSelect(db, 'business_expenses', '*', 'incurred_at', fromIso, toIso);
  if (rows.length === 0) rows = await safeSelect(db, 'business_expenses', '*', 'incurred_on', fromIso, toIso);
  if (rows.length === 0) rows = await safeSelect(db, 'business_expenses', '*', 'created_at', fromIso, toIso);
  return rows;
}

async function loadMileageExpenses(db: SupabaseClient, fromIso: string, toIso: string) {
  let rows = await safeSelect(db, 'job_mileage_logs', '*', 'created_at', fromIso, toIso);
  if (rows.length === 0) rows = await safeSelect(db, 'job_mileage_logs', '*', 'logged_on', fromIso, toIso);
  return rows;
}

function expenseDetail(row: Record<string, unknown>, source: string, amountKey = 'amount_cents'): FinancialDetailRow {
  const occurredAt = str(row.occurred_at) || str(row.incurred_at) || str(row.incurred_on) || str(row.logged_on) || str(row.created_at) || null;
  return {
    id: str(row.id) || `${source}:${occurredAt ?? Math.random()}`,
    label: str(row.description) || str(row.category) || str(row.notes) || source,
    amountCents: Math.abs(cents(row[amountKey])),
    occurredAt,
    source,
    category: str(row.category) || null,
    method: str(row.payment_method) || null,
  };
}

export async function getFinancialSnapshot(
  db: SupabaseClient,
  {
    startDate,
    endDate,
    includeTest = false,
  }: {
    startDate: string;
    endDate: string;
    includeTest?: boolean;
  },
): Promise<FinancialSnapshot> {
  const fromIso = startDate.includes('T') ? startDate : new Date(`${startDate}T00:00:00`).toISOString();
  const toIso = endDate.includes('T') ? endDate : new Date(`${endDate}T23:59:59`).toISOString();

  const [apptMetaRes, payments, ledgerRows, expenseRows, businessExpenseRows, mileageRows, receiptsRes, techsRes] = await Promise.all([
    db
      .from('appointments')
      .select('id, guest_name, guest_email, guest_phone, status, payment_status, deposit_amount_cents, base_price_cents, balance_due_cents, scheduled_start, job_completed_at, updated_at, created_at, service_slug, assigned_technician_id, vehicle_class, stripe_checkout_session_id, fallback_booking_id, archived, archived_at, deleted_at')
      .limit(10000),
    fetchPaymentsSince(db, fromIso, toIso),
    safeSelect(db, 'financial_ledger', '*', 'occurred_at', fromIso, toIso),
    safeSelect(db, 'expenses', '*', 'occurred_at', fromIso, toIso),
    loadBusinessExpenses(db, fromIso, toIso),
    loadMileageExpenses(db, fromIso, toIso),
    db.from('receipts').select('id, created_at').gte('created_at', fromIso).lte('created_at', toIso).limit(10000),
    db.from('profiles').select('id, full_name, email').limit(1000),
  ]);

  const apptRows = ((apptMetaRes.data ?? []) as Record<string, unknown>[]).filter((row) => includeTest || !isTestLikeJob(row));
  const apptById = new Map(apptRows.map((row) => [str(row.id), row]));
  const techById = new Map(
    ((techsRes.data ?? []) as Record<string, unknown>[]).map((row) => [str(row.id), str(row.full_name) || str(row.email) || 'Technician']),
  );

  const summary = summarizePayments(payments, { excludeTest: !includeTest, apptById: apptById as Map<string, { guest_email?: string | null; guest_name?: string | null }>, fromIso, toIso });
  const diagnostics = buildRevenueDiagnostics(payments, { excludeTest: !includeTest, apptById: apptById as Map<string, { guest_email?: string | null; guest_name?: string | null }>, fromIso, toIso });

  const cashByAppt = new Map<string, number>();
  const stripeByAppt = new Set<string>();
  for (const p of payments) {
    const aid = str(p.appointment_id);
    if (!aid) continue;
    if (isPaymentVoided(p) || !isPaymentSucceededGuard(p)) continue;
    if (isRealStripePayment(p as PayRow)) stripeByAppt.add(aid);
    if (shouldExcludeFromCashRevenue(p)) continue;
    const amt = Math.max(0, cents(p.amount_cents) - cents(p.refunded_amount_cents));
    if (amt <= 0) continue;
    cashByAppt.set(aid, (cashByAppt.get(aid) ?? 0) + amt);
  }

  function isPaymentSucceededGuard(p: PayRow) {
    const st = str(p.status).toLowerCase();
    return st === 'succeeded' || st === 'paid';
  }

  const openBalanceCtx = (row: Record<string, unknown>) => {
    const id = str(row.id);
    return {
      cashCollectedCents: cashByAppt.get(id) ?? 0,
      hasRealStripePayment: stripeByAppt.has(id),
    };
  };

  const pendingDepositCtx = (row: Record<string, unknown>) => {
    const id = str(row.id);
    return {
      hasRealStripePayment: stripeByAppt.has(id),
      paymentLinkValid: Boolean(str(row.stripe_checkout_session_id)),
    };
  };

  let membershipRevenueCents = 0;
  const membershipChannelCents = {
    stripe: 0,
    cash: 0,
    zelleGroup: 0,
    other: 0,
  };
  const recentPayments: FinancialDetailRow[] = [];
  const countedPayments: PayRow[] = [];
  for (const p of payments) {
    const paySummary = summarizePayments([p], { excludeTest: !includeTest, apptById: apptById as Map<string, { guest_email?: string | null; guest_name?: string | null }>, fromIso, toIso });
    if (paySummary.grossCents <= 0) continue;
    countedPayments.push(p);
    if (p.payment_kind === 'membership' || p.payment_method === 'membership') {
      membershipRevenueCents += paySummary.grossCents;
      const membershipChannel = classifyPaymentChannel(str(p.payment_method || p.payment_kind), str(p.payment_kind), p);
      if (membershipChannel === 'stripe') membershipChannelCents.stripe += paySummary.grossCents;
      else if (membershipChannel === 'cash') membershipChannelCents.cash += paySummary.grossCents;
      else if (membershipChannel === 'zelle' || membershipChannel === 'venmo' || membershipChannel === 'cash_app') membershipChannelCents.zelleGroup += paySummary.grossCents;
      else membershipChannelCents.other += paySummary.grossCents;
    }
    const appt = p.appointment_id ? apptById.get(p.appointment_id) : null;
    recentPayments.push({
      id: str(p.id),
      label: str(appt?.guest_name) || str(p.payment_method) || 'Payment',
      amountCents: paySummary.grossCents,
      occurredAt: str(p.paid_at) || str(p.created_at) || null,
      source: p.source_table ?? 'payments',
      method: str(p.payment_method || p.payment_kind),
      customer: str(appt?.guest_name) || null,
      href: p.appointment_id ? `/admin/work-orders/${p.appointment_id}` : null,
    });
  }

  let refundsCents = 0;
  let stripeFeesCents = 0;
  let payoutsCents = 0;
  let ledgerExpensesCents = 0;
  for (const row of ledgerRows) {
    if (!includeTest && row.is_test === true) continue;
    if (row.exclude_from_reports === true) continue;
    const type = str(row.type);
    if (type === 'refund') refundsCents += Math.abs(cents(row.gross_amount || row.amount));
    if (type === 'fee') stripeFeesCents += Math.abs(cents(row.fee_amount || row.amount));
    if (type === 'expense') ledgerExpensesCents += Math.abs(cents(row.amount || row.gross_amount));
    if (type === 'payout') payoutsCents += Math.abs(cents(row.amount || row.gross_amount));
    if (type === 'revenue') stripeFeesCents += Math.max(0, cents(row.fee_amount));
  }
  for (const p of countedPayments) {
    refundsCents += Math.max(0, cents(p.refunded_amount_cents));
  }

  const recentExpenses: FinancialDetailRow[] = [];
  let expensesCents = ledgerExpensesCents;
  for (const row of expenseRows) {
    if (!includeTest && row.is_test === true) continue;
    if (row.exclude_from_reports === true) continue;
    const detail = expenseDetail(row, 'expenses');
    expensesCents += detail.amountCents;
    recentExpenses.push(detail);
  }
  for (const row of businessExpenseRows) {
    const detail = expenseDetail(row, 'business_expenses');
    if (detail.amountCents <= 0) continue;
    expensesCents += detail.amountCents;
    recentExpenses.push(detail);
  }
  for (const row of mileageRows) {
    const detail = expenseDetail(row, 'job_mileage_logs', 'gas_cost_cents');
    if (detail.amountCents <= 0) continue;
    expensesCents += detail.amountCents;
    recentExpenses.push({ ...detail, label: detail.label || 'Mileage / fuel' });
  }

  const serviceMap = new Map<string, { label: string; count: number; revenueCents: number }>();
  const techMap = new Map<string, { label: string; count: number; revenueCents: number }>();
  const vehicleMap = new Map<string, { label: string; count: number; revenueCents: number }>();
  const customerMap = new Map<string, { label: string; email: string | null; count: number; revenueCents: number }>();
  let completedJobs = 0;
  let openBalancesCents = 0;
  let staleOpenBalancesCents = 0;
  let pendingDepositsCents = 0;
  let stalePendingDepositsCents = 0;
  let grossServiceValueCents = 0;
  const openBalances: FinancialDetailRow[] = [];
  const staleOpenBalances: FinancialDetailRow[] = [];
  const pendingDeposits: FinancialDetailRow[] = [];
  const stalePendingDeposits: FinancialDetailRow[] = [];

  for (const row of apptRows) {
    const status = str(row.status).toLowerCase();
    const paymentStatus = str(row.payment_status).toLowerCase();
    const balance = Math.max(0, cents(row.balance_due_cents));
    const deposit = Math.max(0, cents(row.deposit_amount_cents));
    const obCtx = openBalanceCtx(row);
    const pdCtx = pendingDepositCtx(row);
    const detail: FinancialDetailRow = {
      id: str(row.id),
      label: str(row.guest_name) || 'Customer',
      amountCents: balance,
      occurredAt: str(row.scheduled_start) || null,
      source: 'appointments',
      customer: str(row.guest_name) || null,
      href: `/admin/work-orders/${str(row.id)}`,
    };
    if (balance > 0 && !['cancelled', 'canceled', 'deleted', 'archived', 'voided'].includes(status)) {
      if (isActionableOpenBalance(row as OpenBalanceAppt, obCtx)) {
        openBalancesCents += balance;
        openBalances.push(detail);
      } else if (isStaleOpenBalance(row as OpenBalanceAppt, obCtx)) {
        staleOpenBalancesCents += balance;
        staleOpenBalances.push({ ...detail, category: classifyOpenBalance(row as OpenBalanceAppt, obCtx).reason });
      }
    }
    if (deposit > 0 && (paymentStatus === 'awaiting_deposit' || status === 'pending')) {
      const depositDetail: FinancialDetailRow = {
        id: str(row.id),
        label: str(row.guest_name) || 'Customer',
        amountCents: deposit,
        occurredAt: str(row.scheduled_start) || null,
        source: 'appointments',
        customer: str(row.guest_name) || null,
        href: `/admin/work-orders/${str(row.id)}`,
      };
      if (isActionablePendingDeposit(row as OpenBalanceAppt, pdCtx)) {
        pendingDepositsCents += deposit;
        pendingDeposits.push(depositDetail);
      } else if (isStalePendingDeposit(row as OpenBalanceAppt, pdCtx)) {
        stalePendingDepositsCents += deposit;
        stalePendingDeposits.push({
          ...depositDetail,
          category: classifyPendingDeposit(row as OpenBalanceAppt, pdCtx).reason,
        });
      }
    }
    const completedAt = str(row.job_completed_at) || str(row.updated_at) || str(row.scheduled_start);
    if (status !== 'completed' || !dateInRange(completedAt, fromIso, toIso)) continue;
    completedJobs += 1;
    const amount = cents(row.base_price_cents);
    grossServiceValueCents += amount;
    const service = str(row.service_slug) || 'uncategorized';
    addBreakdown(serviceMap, service, { label: service.replace(/-/g, ' '), count: 0, revenueCents: 0 }, amount);
    const techId = str(row.assigned_technician_id);
    if (techId) addBreakdown(techMap, techId, { label: techById.get(techId) ?? 'Technician', count: 0, revenueCents: 0 }, amount);
    const vehicle = str(row.vehicle_class) || 'unspecified';
    addBreakdown(vehicleMap, vehicle, { label: vehicle.replace(/-/g, ' '), count: 0, revenueCents: 0 }, amount);
    const email = str(row.guest_email).toLowerCase();
    const customerKey = email || str(row.guest_name) || str(row.id);
    const customer = customerMap.get(customerKey) ?? { label: str(row.guest_name) || 'Customer', email: email || null, count: 0, revenueCents: 0 };
    customer.count += 1;
    customer.revenueCents += amount;
    customerMap.set(customerKey, customer);
  }

  const netProfitCents = summary.grossCents - refundsCents - stripeFeesCents - expensesCents;
  const sortRevenue = <T extends { revenueCents: number }>(rows: T[]) => rows.sort((a, b) => b.revenueCents - a.revenueCents);
  const stripeSourceCents = Math.max(0, summary.stripeCents - membershipChannelCents.stripe);
  const cashSourceCents = Math.max(0, summary.cashCents - membershipChannelCents.cash);
  const electronicSourceCents = Math.max(0, summary.zelleCents + summary.venmoCents + summary.cashAppCents - membershipChannelCents.zelleGroup);
  const otherSourceCents = Math.max(
    0,
    summary.otherCents +
      summary.applePayCents +
      summary.checkCents +
      summary.manualCardCents +
      summary.bankTransferCents -
      membershipChannelCents.other,
  );

  return {
    grossRevenueCents: summary.grossCents,
    cashRevenueCents: cashSourceCents,
    stripeRevenueCents: stripeSourceCents,
    zelleRevenueCents: electronicSourceCents,
    otherRevenueCents: otherSourceCents,
    membershipRevenueCents,
    creditsRedeemedCents: summary.creditCents,
    discountsCents: summary.compCents,
    grossServiceValueCents,
    refundsCents,
    stripeFeesCents,
    expensesCents,
    netProfitCents,
    pendingDepositsCents,
    openBalancesCents,
    paidInvoicesDepositsCents: summary.grossCents,
    payoutsCents,
    paymentsCount: summary.paymentCount,
    receiptsCount: receiptsRes.data?.length ?? payments.filter((p) => p.source_table === 'receipts').length,
    completedJobs,
    revenueByService: sortRevenue(Array.from(serviceMap.values())),
    revenueByTechnician: sortRevenue(Array.from(techMap.values())),
    revenueByVehicleType: sortRevenue(Array.from(vehicleMap.values())),
    revenueByCustomer: sortRevenue(Array.from(customerMap.values())).slice(0, 20),
    recentPayments: recentPayments.sort((a, b) => str(b.occurredAt).localeCompare(str(a.occurredAt))).slice(0, 25),
    recentExpenses: recentExpenses.sort((a, b) => str(b.occurredAt).localeCompare(str(a.occurredAt))).slice(0, 25),
    openBalances: openBalances.sort((a, b) => b.amountCents - a.amountCents).slice(0, 50),
    pendingDeposits: pendingDeposits.sort((a, b) => b.amountCents - a.amountCents).slice(0, 50),
    staleOpenBalances: staleOpenBalances.sort((a, b) => b.amountCents - a.amountCents).slice(0, 50),
    staleOpenBalancesCents,
    stalePendingDeposits: stalePendingDeposits.sort((a, b) => b.amountCents - a.amountCents).slice(0, 50),
    stalePendingDepositsCents,
    diagnostics: {
      ...diagnostics,
      ledgerRowsLoaded: ledgerRows.length,
      expenseRowsLoaded: expenseRows.length,
      businessExpenseRowsLoaded: businessExpenseRows.length,
      mileageRowsLoaded: mileageRows.length,
      receiptsCount: receiptsRes.data?.length ?? 0,
      completedJobsLoaded: completedJobs,
    },
  };
}

export async function upsertLedgerFromBalanceTransaction(
  db: SupabaseClient | null | undefined,
  tx: Stripe.BalanceTransaction,
  refs?: {
    paymentIntentId?: string | null;
    chargeId?: string | null;
    payoutId?: string | null;
    paymentId?: string | null;
    workOrderId?: string | null;
  },
) {
  if (!db) return;
  const fee = cents(tx.fee);
  const gross = cents(tx.amount);
  const net = cents(tx.net);
  const type =
    tx.type === 'refund' ? 'refund' :
    tx.type === 'stripe_fee' ? 'fee' :
    tx.type === 'payout' ? 'payout' :
    gross < 0 ? 'expense' :
    'revenue';
  const { error } = await db.from('financial_ledger').upsert(
    {
      source: 'stripe',
      type,
      amount: gross,
      gross_amount: gross,
      fee_amount: fee,
      net_amount: net,
      description: tx.description ?? tx.type,
      category: tx.type,
      stripe_payment_intent_id: refs?.paymentIntentId ?? null,
      stripe_charge_id: refs?.chargeId ?? null,
      stripe_balance_transaction_id: tx.id,
      stripe_payout_id: refs?.payoutId ?? null,
      work_order_id: refs?.workOrderId ?? null,
      payment_id: refs?.paymentId ?? null,
      occurred_at: new Date(tx.created * 1000).toISOString(),
      metadata: tx as unknown as Record<string, unknown>,
    },
    { onConflict: 'stripe_balance_transaction_id' },
  );
  if (error) console.warn('[financial-ledger] upsert balance transaction skipped', error.message);
}

export async function fetchFinancialSummary(
  db: SupabaseClient,
  fromIso: string,
  toIso: string,
  opts?: { includeTest?: boolean },
): Promise<FinancialSummary> {
  const [ledgerRes, expensesRes] = await Promise.all([
    db
      .from('financial_ledger')
      .select('type, gross_amount, fee_amount, net_amount, amount, is_test, exclude_from_reports')
      .gte('occurred_at', fromIso)
      .lte('occurred_at', toIso)
      .limit(10000),
    db
      .from('expenses')
      .select('amount_cents, is_test, exclude_from_reports')
      .gte('occurred_at', fromIso)
      .lte('occurred_at', toIso)
      .limit(10000),
  ]);

  const summary: FinancialSummary = {
    grossRevenueCents: 0,
    refundsCents: 0,
    stripeFeesCents: 0,
    expensesCents: 0,
    netProfitCents: 0,
    payoutsCents: 0,
  };

  for (const row of ledgerRes.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!opts?.includeTest && r.is_test === true) continue;
    if (r.exclude_from_reports === true) continue;
    const type = String(r.type ?? '');
    if (type === 'revenue') summary.grossRevenueCents += Math.max(0, cents(r.gross_amount || r.amount));
    if (type === 'refund') summary.refundsCents += Math.abs(cents(r.gross_amount || r.amount));
    if (type === 'fee') summary.stripeFeesCents += Math.abs(cents(r.fee_amount || r.amount));
    if (type === 'expense') summary.expensesCents += Math.abs(cents(r.amount));
    if (type === 'payout') summary.payoutsCents += Math.abs(cents(r.amount));
    if (type === 'revenue') summary.stripeFeesCents += Math.max(0, cents(r.fee_amount));
  }

  for (const row of expensesRes.data ?? []) {
    const r = row as Record<string, unknown>;
    if (!opts?.includeTest && r.is_test === true) continue;
    if (r.exclude_from_reports === true) continue;
    summary.expensesCents += Math.max(0, cents(r.amount_cents));
  }

  summary.netProfitCents =
    summary.grossRevenueCents - summary.refundsCents - summary.stripeFeesCents - summary.expensesCents;
  return summary;
}
