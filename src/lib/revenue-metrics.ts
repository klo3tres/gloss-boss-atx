import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyPaymentChannel, isPaymentSucceeded, isPaymentVoided } from '@/lib/payment-classification';
import { isTestLikeJob } from '@/lib/tech-job-filters';

export type PayRow = {
  id?: string;
  amount_cents: number | null;
  status: string | null;
  payment_method?: string | null;
  payment_kind?: string | null;
  voided_at?: string | null;
  voided?: boolean | null;
  created_at?: string | null;
  paid_at?: string | null;
  appointment_id?: string | null;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  metadata?: Record<string, unknown> | null;
  provider?: string | null;
  is_test?: boolean | null;
  exclude_from_revenue?: boolean | null;
  refunded_at?: string | null;
  refunded_amount_cents?: number | null;
  source_table?: 'payments' | 'receipts';
  payment_id?: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function payTimestamp(p: PayRow): string {
  return str(p.paid_at) || str(p.created_at) || '';
}

function revenueIdentityKey(p: PayRow): string {
  const pi = str(p.stripe_payment_intent_id);
  if (pi) return `stripe_pi:${pi}`;
  const session = str(p.stripe_checkout_session_id);
  if (session) return `stripe_session:${session}`;
  const receiptPaymentId = str(p.source_table) === 'receipts' ? str(p.payment_id) : '';
  if (receiptPaymentId) return `receipt_payment:${receiptPaymentId}`;
  return '';
}

export type RevenueSummary = {
  grossCents: number;
  paymentCount: number;
  stripeCents: number;
  cashCents: number;
  zelleCents: number;
  venmoCents: number;
  cashAppCents: number;
  applePayCents: number;
  checkCents: number;
  manualCardCents: number;
  compCents: number;
  otherCents: number;
};

export type RevenueExclusion = {
  id: string;
  amountCents: number;
  reason: string;
  method: string;
};

export type RevenueDiagnostics = {
  rowsLoaded: number;
  rowsCounted: number;
  rowsExcluded: number;
  grossCents: number;
  byMethod: Record<string, number>;
  exclusions: RevenueExclusion[];
  duplicateGroups: Array<{ key: string; ids: string[]; amountCents: number }>;
  duplicateExtraCount: number;
};

export function isTestPaymentRow(
  p: PayRow,
  apptById?: Map<string, { guest_email?: string | null; guest_name?: string | null }>,
): boolean {
  const meta = p.metadata;
  if (p.is_test === true) return true;
  if (meta && (meta.is_test === true || meta.test === true)) return true;
  const aid = str(p.appointment_id);
  if (aid && apptById) {
    const appt = apptById.get(aid);
    if (appt && isTestLikeJob(appt)) return true;
  }
  return false;
}

function addChannel(summary: RevenueSummary, channel: ReturnType<typeof classifyPaymentChannel>, amt: number) {
  summary.grossCents += amt;
  summary.paymentCount += 1;
  if (channel === 'stripe') summary.stripeCents += amt;
  else if (channel === 'cash') summary.cashCents += amt;
  else if (channel === 'zelle') summary.zelleCents += amt;
  else if (channel === 'venmo') summary.venmoCents += amt;
  else if (channel === 'cash_app') summary.cashAppCents += amt;
  else if (channel === 'apple_pay') summary.applePayCents += amt;
  else if (channel === 'check') summary.checkCents += amt;
  else if (channel === 'manual_card') summary.manualCardCents += amt;
  else if (channel === 'comp') summary.compCents += amt;
  else summary.otherCents += amt;
}

export function summarizePayments(
  rows: PayRow[],
  opts?: {
    excludeTest?: boolean;
    apptById?: Map<string, { guest_email?: string | null; guest_name?: string | null }>;
    fromIso?: string;
    toIso?: string;
  },
): RevenueSummary {
  const summary: RevenueSummary = {
    grossCents: 0,
    paymentCount: 0,
    stripeCents: 0,
    cashCents: 0,
    zelleCents: 0,
    venmoCents: 0,
    cashAppCents: 0,
    applePayCents: 0,
    checkCents: 0,
    manualCardCents: 0,
    compCents: 0,
    otherCents: 0,
  };
  const seenRevenueKeys = new Set<string>();

  for (const p of rows) {
    const ts = payTimestamp(p);
    if (opts?.fromIso && ts && ts < opts.fromIso) continue;
    if (opts?.toIso && ts && ts > opts.toIso) continue;
    if (!isPaymentSucceeded(p) || isPaymentVoided(p)) continue;
    if (p.exclude_from_revenue === true || p.refunded_at) continue;
    if (opts?.excludeTest && isTestPaymentRow(p, opts.apptById)) continue;
    const amt = Math.max(0, (typeof p.amount_cents === 'number' ? p.amount_cents : 0) - (typeof p.refunded_amount_cents === 'number' ? p.refunded_amount_cents : 0));
    if (amt <= 0) continue;
    const key = revenueIdentityKey(p);
    if (key && seenRevenueKeys.has(key)) continue;
    if (key) seenRevenueKeys.add(key);
    const channel = classifyPaymentChannel(str(p.payment_method || p.payment_kind), str(p.payment_kind), p as PayRow);
    addChannel(summary, channel, amt);
  }
  return summary;
}

export function buildRevenueDiagnostics(
  rows: PayRow[],
  opts?: {
    excludeTest?: boolean;
    apptById?: Map<string, { guest_email?: string | null; guest_name?: string | null }>;
    fromIso?: string;
    toIso?: string;
  },
): RevenueDiagnostics {
  const exclusions: RevenueExclusion[] = [];
  const byMethod: Record<string, number> = {};
  const duplicateMap = new Map<string, PayRow[]>();
  const seenRevenueKeys = new Set<string>();
  let rowsCounted = 0;
  let grossCents = 0;

  for (const p of rows) {
    const id = str(p.id) || 'unknown';
    const amt = typeof p.amount_cents === 'number' ? p.amount_cents : 0;
    const method = str(p.payment_method || p.payment_kind);
    const ts = payTimestamp(p);

    if (opts?.fromIso && ts && ts < opts.fromIso) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Outside date range (before period start)' });
      continue;
    }
    if (opts?.toIso && ts && ts > opts.toIso) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Outside date range (after period end)' });
      continue;
    }
    if (isPaymentVoided(p)) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Voided payment' });
      continue;
    }
    if (!isPaymentSucceeded(p)) {
      exclusions.push({ id, amountCents: amt, method, reason: `Status not collected: ${str(p.status)}` });
      continue;
    }
    if (p.exclude_from_revenue === true) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Manually excluded from revenue' });
      continue;
    }
    if (p.refunded_at) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Refunded payment' });
      continue;
    }
    if (opts?.excludeTest && isTestPaymentRow(p, opts.apptById)) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Test booking or test payment metadata' });
      continue;
    }
    if (amt <= 0) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Zero or missing amount' });
      continue;
    }

    const key = revenueIdentityKey(p);
    if (key) {
      const group = duplicateMap.get(key) ?? [];
      group.push(p);
      duplicateMap.set(key, group);
      if (seenRevenueKeys.has(key)) {
        exclusions.push({ id, amountCents: amt, method, reason: `Duplicate revenue identity: ${key}` });
        continue;
      }
      seenRevenueKeys.add(key);
    }

    rowsCounted += 1;
    grossCents += amt;
    const channel = classifyPaymentChannel(method, str(p.payment_kind), p);
    byMethod[channel] = (byMethod[channel] ?? 0) + amt;
  }

  const duplicateGroups = Array.from(duplicateMap.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      ids: group.map((p) => str(p.id) || 'unknown'),
      amountCents: group.reduce((sum, p) => sum + Math.max(0, typeof p.amount_cents === 'number' ? p.amount_cents : 0), 0),
    }));

  return {
    rowsLoaded: rows.length,
    rowsCounted,
    rowsExcluded: exclusions.length,
    grossCents,
    byMethod,
    exclusions: exclusions.slice(0, 40),
    duplicateGroups: duplicateGroups.slice(0, 20),
    duplicateExtraCount: duplicateGroups.reduce((sum, group) => sum + Math.max(0, group.ids.length - 1), 0),
  };
}

export async function fetchPaymentsSince(admin: SupabaseClient, fromIso: string, toIso?: string) {
  const select =
    'id, amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, paid_at, appointment_id, metadata, stripe_checkout_session_id, stripe_payment_intent_id, provider, is_test, exclude_from_revenue, refunded_at, refunded_amount_cents';
  const upper = toIso ?? new Date().toISOString();
  const [byPaidRes, byCreatedRes, receiptRows] = await Promise.all([
    admin.from('payments').select(select).gte('paid_at', fromIso).lte('paid_at', upper).limit(5000),
    admin.from('payments').select(select).gte('created_at', fromIso).lte('created_at', upper).limit(5000),
    fetchReceiptRevenueSince(admin, fromIso, upper),
  ]);

  const rows = [...((byPaidRes.data ?? []) as PayRow[]), ...((byCreatedRes.data ?? []) as PayRow[])];
  const seen = new Set<string>();
  const out: PayRow[] = [];
  for (const p of rows) {
    const id = str(p.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const ts = payTimestamp(p);
    if (ts >= fromIso && (!toIso || ts <= toIso)) out.push(p);
  }
  const paymentIds = new Set(out.map((p) => str(p.id)).filter(Boolean));
  for (const receipt of receiptRows) {
    const linkedPaymentId = str(receipt.payment_id);
    if (linkedPaymentId && paymentIds.has(linkedPaymentId)) continue;
    const id = str(receipt.id);
    const syntheticId = id ? `receipt:${id}` : '';
    if (syntheticId && seen.has(syntheticId)) continue;
    if (syntheticId) seen.add(syntheticId);
    out.push({ ...receipt, id: syntheticId || id, source_table: 'receipts' });
  }
  return out;
}

async function fetchReceiptRevenueSince(admin: SupabaseClient, fromIso: string, toIso: string): Promise<PayRow[]> {
  const fullSelect =
    'id, payment_id, amount_cents, final_total_cents, payment_method, created_at, appointment_id, fallback_booking_id, metadata, is_test, exclude_from_revenue, voided_at, refunded_at';
  let res = await admin.from('receipts').select(fullSelect).gte('created_at', fromIso).lte('created_at', toIso).limit(5000);
  if (res.error) {
    const fallbackRes = await admin.from('receipts').select('id, payment_id, amount_cents, payment_method, created_at, appointment_id, voided_at').gte('created_at', fromIso).lte('created_at', toIso).limit(5000);
    if (fallbackRes.error) return [];
    return ((fallbackRes.data ?? []) as Array<Record<string, unknown>>).map(receiptToPayRow);
  }
  if (res.error) return [];
  return ((res.data ?? []) as Array<Record<string, unknown>>).map(receiptToPayRow);
}

function receiptToPayRow(r: Record<string, unknown>): PayRow {
  return {
    id: str(r.id),
    payment_id: str(r.payment_id) || null,
    amount_cents:
      typeof r.amount_cents === 'number'
        ? r.amount_cents
        : typeof r.final_total_cents === 'number'
          ? r.final_total_cents
          : 0,
    status: 'paid',
    payment_method: str(r.payment_method) || 'receipt',
    payment_kind: 'receipt',
    voided_at: str(r.voided_at) || null,
    created_at: str(r.created_at) || null,
    paid_at: str(r.created_at) || null,
    appointment_id: str(r.appointment_id) || null,
    metadata: (r.metadata && typeof r.metadata === 'object' ? r.metadata : null) as Record<string, unknown> | null,
    is_test: r.is_test === true,
    exclude_from_revenue: r.exclude_from_revenue === true,
    refunded_at: str(r.refunded_at) || null,
    refunded_amount_cents: 0,
    source_table: 'receipts',
  };
}

export function startOfYearIso(): string {
  const d = new Date();
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfTodayIso(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfWeekIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function startOfMonthIso(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
