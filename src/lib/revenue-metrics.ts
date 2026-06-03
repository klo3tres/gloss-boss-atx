import type { SupabaseClient } from '@supabase/supabase-js';
import { isTestLikeJob } from '@/lib/tech-job-filters';

export type PayRow = {
  id?: string | null;
  amount_cents: number | null;
  status: string | null;
  payment_method?: string | null;
  payment_kind?: string | null;
  voided_at?: string | null;
  voided?: boolean | null;
  created_at?: string | null;
  paid_at?: string | null;
  appointment_id?: string | null;
  fallback_booking_id?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  email?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PaymentChannel =
  | 'stripe'
  | 'cash'
  | 'zelle'
  | 'venmo'
  | 'cash_app'
  | 'apple_pay'
  | 'check'
  | 'manual_card'
  | 'comp'
  | 'other';

export type RevenuePaymentDetail = {
  id: string;
  amountCents: number;
  method: string;
  channel: PaymentChannel;
  status: string;
  paidAt: string;
  appointmentId: string;
  customerName: string;
  customerEmail: string;
  isTest: boolean;
};

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

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function isVoided(p: PayRow) {
  return Boolean(p.voided_at || p.voided === true) || str(p.status).toLowerCase() === 'voided';
}

function isSucceeded(p: PayRow) {
  const st = str(p.status).toLowerCase();
  return st === 'succeeded' || st === 'paid' || st === 'comped' || st === 'manual_comped';
}

export function effectivePayDateIso(p: PayRow): string {
  return str(p.paid_at || p.created_at) || new Date(0).toISOString();
}

export function classifyPaymentChannel(methodRaw: string, kindRaw: string): PaymentChannel {
  const method = methodRaw.toLowerCase();
  const kind = kindRaw.toLowerCase();
  const combined = `${method} ${kind}`;
  if (combined.includes('comp') || combined.includes('free') || kind.includes('comp')) return 'comp';
  if (combined.includes('cash app') || combined.includes('cashapp')) return 'cash_app';
  if (combined.includes('apple pay') || combined.includes('apple_pay')) return 'apple_pay';
  if (method.includes('venmo') || kind.includes('venmo')) return 'venmo';
  if (method.includes('zelle') || kind.includes('zelle')) return 'zelle';
  if (method.includes('cash') && !combined.includes('cash app')) return 'cash';
  if (method.includes('check') || kind.includes('check')) return 'check';
  if (method.includes('manual') && method.includes('card')) return 'manual_card';
  if (method.includes('stripe') || method.includes('card') || kind.includes('stripe') || kind.includes('deposit') || kind.includes('booking')) {
    return 'stripe';
  }
  return 'other';
}

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

function addChannel(summary: RevenueSummary, channel: PaymentChannel, amt: number) {
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

export function emptyRevenueSummary(): RevenueSummary {
  return {
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
}

export function summarizePayments(
  rows: PayRow[],
  opts?: {
    excludeTest?: boolean;
    apptById?: Map<string, { guest_email?: string | null; guest_name?: string | null; guest_phone?: string | null }>;
    fromIso?: string;
    toIso?: string;
  },
): RevenueSummary {
  const summary = emptyRevenueSummary();
  for (const p of rows) {
    if (!isSucceeded(p) || isVoided(p)) continue;
    if (opts?.excludeTest && isTestPaymentRow(p, opts.apptById)) continue;
    const paidIso = effectivePayDateIso(p);
    if (opts?.fromIso && paidIso < opts.fromIso) continue;
    if (opts?.toIso && paidIso > opts.toIso) continue;
    const amt = typeof p.amount_cents === 'number' ? p.amount_cents : 0;
    summary.grossCents += amt;
    summary.paymentCount += 1;
    addChannel(summary, classifyPaymentChannel(str(p.payment_method || p.payment_kind), str(p.payment_kind)), amt);
  }
  return summary;
}

export function buildRevenuePaymentDetails(
  rows: PayRow[],
  apptById: Map<string, { guest_email?: string | null; guest_name?: string | null }>,
  opts?: { excludeTest?: boolean; fromIso?: string; toIso?: string },
): RevenuePaymentDetail[] {
  const out: RevenuePaymentDetail[] = [];
  for (const p of rows) {
    if (!isSucceeded(p) || isVoided(p)) continue;
    const isTest = isTestPaymentRow(p, apptById);
    if (opts?.excludeTest && isTest) continue;
    const paidIso = effectivePayDateIso(p);
    if (opts?.fromIso && paidIso < opts.fromIso) continue;
    if (opts?.toIso && paidIso > opts.toIso) continue;
    const aid = str(p.appointment_id);
    const appt = aid ? apptById.get(aid) : undefined;
    out.push({
      id: str(p.id) || paidIso,
      amountCents: typeof p.amount_cents === 'number' ? p.amount_cents : 0,
      method: str(p.payment_method || p.payment_kind) || 'payment',
      channel: classifyPaymentChannel(str(p.payment_method || p.payment_kind), str(p.payment_kind)),
      status: str(p.status),
      paidAt: paidIso,
      appointmentId: aid,
      customerName: str(p.customer_name || appt?.guest_name) || 'Customer',
      customerEmail: str(p.email || appt?.guest_email),
      isTest,
    });
  }
  return out.sort((a, b) => b.paidAt.localeCompare(a.paidAt));
}

export async function fetchPaymentsSince(admin: SupabaseClient, fromIso: string, toIso?: string) {
  let q = admin
    .from('payments')
    .select(
      'id, amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, paid_at, appointment_id, fallback_booking_id, customer_id, customer_name, email, metadata',
    )
    .gte('created_at', fromIso);
  if (toIso) q = q.lte('created_at', toIso);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(5000);
  if (error) {
    console.error('[revenue-metrics] fetchPaymentsSince', error.message);
    return [];
  }
  const rows = (data ?? []) as PayRow[];
  const fromMs = new Date(fromIso).getTime();
  const extra = await admin
    .from('payments')
    .select(
      'id, amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, paid_at, appointment_id, fallback_booking_id, customer_id, customer_name, email, metadata',
    )
    .gte('paid_at', fromIso)
    .lt('created_at', fromIso)
    .limit(500);
  if (!extra.error && extra.data?.length) {
    const seen = new Set(rows.map((r) => str(r.id)));
    for (const row of extra.data as PayRow[]) {
      if (!seen.has(str(row.id))) rows.push(row);
    }
  }
  if (toIso) {
    const toMs = new Date(toIso).getTime();
    return rows.filter((p) => {
      const t = new Date(effectivePayDateIso(p)).getTime();
      return t >= fromMs && t <= toMs;
    });
  }
  return rows.filter((p) => new Date(effectivePayDateIso(p)).getTime() >= fromMs);
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

/** @deprecated use classifyPaymentChannel */
export function bucket(method: string): 'stripe' | 'cash' | 'zelle' | 'other' {
  const ch = classifyPaymentChannel(method, method);
  if (ch === 'stripe') return 'stripe';
  if (ch === 'cash') return 'cash';
  if (ch === 'zelle' || ch === 'venmo') return 'zelle';
  return 'other';
}
