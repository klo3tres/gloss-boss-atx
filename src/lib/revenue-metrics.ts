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
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function payTimestamp(p: PayRow): string {
  return str(p.paid_at) || str(p.created_at) || '';
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
};

export function isTestPaymentRow(
  p: PayRow,
  apptById?: Map<string, { guest_email?: string | null; guest_name?: string | null }>,
): boolean {
  const meta = p.metadata;
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

  for (const p of rows) {
    const ts = payTimestamp(p);
    if (opts?.fromIso && ts && ts < opts.fromIso) continue;
    if (opts?.toIso && ts && ts > opts.toIso) continue;
    if (!isPaymentSucceeded(p) || isPaymentVoided(p)) continue;
    if (opts?.excludeTest && isTestPaymentRow(p, opts.apptById)) continue;
    const amt = typeof p.amount_cents === 'number' ? p.amount_cents : 0;
    if (amt <= 0) continue;
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
    if (opts?.excludeTest && isTestPaymentRow(p, opts.apptById)) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Test booking or test payment metadata' });
      continue;
    }
    if (amt <= 0) {
      exclusions.push({ id, amountCents: amt, method, reason: 'Zero or missing amount' });
      continue;
    }

    rowsCounted += 1;
    grossCents += amt;
    const channel = classifyPaymentChannel(method, str(p.payment_kind), p);
    byMethod[channel] = (byMethod[channel] ?? 0) + amt;
  }

  return {
    rowsLoaded: rows.length,
    rowsCounted,
    rowsExcluded: exclusions.length,
    grossCents,
    byMethod,
    exclusions: exclusions.slice(0, 40),
  };
}

export async function fetchPaymentsSince(admin: SupabaseClient, fromIso: string, toIso?: string) {
  const select =
    'id, amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, paid_at, appointment_id, metadata, stripe_checkout_session_id, stripe_payment_intent_id, provider';
  const { data: byPaid, error: e1 } = await admin
    .from('payments')
    .select(select)
    .gte('paid_at', fromIso)
    .lte('paid_at', toIso ?? new Date().toISOString())
    .limit(5000);
  if (!e1 && byPaid?.length) return (byPaid ?? []) as PayRow[];

  let q = admin.from('payments').select(select).gte('created_at', fromIso);
  if (toIso) q = q.lte('created_at', toIso);
  const { data, error } = await q.limit(5000);
  if (error) return [];
  const rows = (data ?? []) as PayRow[];
  const seen = new Set<string>();
  const out: PayRow[] = [];
  for (const p of rows) {
    const id = str(p.id);
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    const ts = payTimestamp(p);
    if (ts >= fromIso && (!toIso || ts <= toIso)) out.push(p);
  }
  return out;
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
