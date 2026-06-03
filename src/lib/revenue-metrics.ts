import type { SupabaseClient } from '@supabase/supabase-js';
import { isTestLikeJob } from '@/lib/tech-job-filters';

type PayRow = {
  amount_cents: number | null;
  status: string | null;
  payment_method?: string | null;
  payment_kind?: string | null;
  voided_at?: string | null;
  voided?: boolean | null;
  created_at?: string | null;
  appointment_id?: string | null;
  metadata?: Record<string, unknown> | null;
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

function bucket(method: string): 'stripe' | 'cash' | 'zelle' | 'other' {
  const m = method.toLowerCase();
  if (m.includes('cash')) return 'cash';
  if (m.includes('zelle') || m.includes('venmo')) return 'zelle';
  if (m.includes('stripe') || m.includes('card')) return 'stripe';
  return 'other';
}

export type RevenueSummary = {
  grossCents: number;
  paymentCount: number;
  stripeCents: number;
  cashCents: number;
  zelleCents: number;
  otherCents: number;
};

export function isTestPaymentRow(p: PayRow, apptById?: Map<string, { guest_email?: string | null; guest_name?: string | null }>): boolean {
  const meta = p.metadata;
  if (meta && (meta.is_test === true || meta.test === true)) return true;
  const aid = str(p.appointment_id);
  if (aid && apptById) {
    const appt = apptById.get(aid);
    if (appt && isTestLikeJob(appt)) return true;
  }
  return false;
}

export function summarizePayments(
  rows: PayRow[],
  opts?: { excludeTest?: boolean; apptById?: Map<string, { guest_email?: string | null; guest_name?: string | null }> },
): RevenueSummary {
  let grossCents = 0;
  let stripeCents = 0;
  let cashCents = 0;
  let zelleCents = 0;
  let otherCents = 0;
  let paymentCount = 0;
  for (const p of rows) {
    if (!isSucceeded(p) || isVoided(p)) continue;
    if (opts?.excludeTest && isTestPaymentRow(p, opts.apptById)) continue;
    const amt = typeof p.amount_cents === 'number' ? p.amount_cents : 0;
    grossCents += amt;
    paymentCount += 1;
    const b = bucket(str(p.payment_method || p.payment_kind));
    if (b === 'stripe') stripeCents += amt;
    else if (b === 'cash') cashCents += amt;
    else if (b === 'zelle') zelleCents += amt;
    else otherCents += amt;
  }
  return { grossCents, paymentCount, stripeCents, cashCents, zelleCents, otherCents };
}

export async function fetchPaymentsSince(admin: SupabaseClient, fromIso: string, toIso?: string) {
  let q = admin
    .from('payments')
    .select('amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, appointment_id, metadata')
    .gte('created_at', fromIso);
  if (toIso) q = q.lte('created_at', toIso);
  const { data, error } = await q.limit(5000);
  if (error) return [];
  return (data ?? []) as PayRow[];
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
