import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dateKeyChicago,
  endOfTodayChicagoIso,
  monthKeyChicago,
  periodBoundsChicago,
  startOfTodayChicagoIso,
  startOfWeekChicagoIso,
} from '@/lib/chicago-time';
import { getFinancialSnapshot, type FinancialSnapshot } from '@/lib/financial-ledger';
import { fetchPaymentsSince, selectCanonicalRevenueRows } from '@/lib/revenue-metrics';

export type CloseoutPeriodType = 'daily' | 'monthly';

export type CloseoutDraft = {
  periodType: CloseoutPeriodType;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  cashCents: number;
  stripeCents: number;
  zelleCents: number;
  depositsCollectedCents: number;
  refundsCents: number;
  expensesCents: number;
  fuelCents: number;
  stripeFeesCents: number;
  grossRevenueCents: number;
  netProfitCents: number;
  marginPercent: number | null;
  openBalancesCents: number;
  pendingDepositsCents: number;
  completedJobs: number;
  alreadyClosed: boolean;
  closedAt: string | null;
  closedByName: string | null;
  note: string | null;
};

export type CloseoutRecord = CloseoutDraft & {
  id: string;
};

export type MoneyPulse = {
  todayGrossCents: number;
  weekGrossCents: number;
  monthGrossCents: number;
  todayNetCents: number;
  weekNetCents: number;
  monthNetCents: number;
  openBalancesCents: number;
  pendingDepositsCents: number;
  monthRefundsCents: number;
  monthFuelCents: number;
  monthMarginPercent: number | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function cents(v: unknown) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function isMissingTable(message: string) {
  return /financial_closeouts|schema cache|does not exist|Could not find/i.test(message);
}

function marginPercent(gross: number, net: number): number | null {
  if (gross <= 0) return null;
  return Math.round((net / gross) * 1000) / 10;
}

async function loadFuelCents(admin: SupabaseClient, fromIso: string, toIso: string): Promise<number> {
  const res = await admin
    .from('job_mileage_logs')
    .select('gas_cost_cents, created_at, logged_on')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .limit(5000);
  let total = 0;
  for (const row of res.data ?? []) {
    total += Math.max(0, cents((row as { gas_cost_cents?: number }).gas_cost_cents));
  }
  if (total > 0) return total;

  const fallback = await admin
    .from('job_mileage_logs')
    .select('gas_cost_cents, logged_on')
    .gte('logged_on', fromIso)
    .lte('logged_on', toIso)
    .limit(5000);
  for (const row of fallback.data ?? []) {
    total += Math.max(0, cents((row as { gas_cost_cents?: number }).gas_cost_cents));
  }
  return total;
}

async function loadDepositsCollectedCents(admin: SupabaseClient, fromIso: string, toIso: string): Promise<number> {
  const payments = await fetchPaymentsSince(admin, fromIso, toIso);
  const { data: appts } = await admin.from('appointments').select('id, guest_email, guest_name').limit(10000);
  const apptById = new Map(
    (appts ?? []).map((a) => {
      const row = a as { id: string; guest_email: string | null; guest_name: string | null };
      return [row.id, row] as const;
    }),
  );
  const canonical = selectCanonicalRevenueRows(payments, {
    excludeTest: true,
    apptById,
    fromIso,
    toIso,
  });
  let total = 0;
  for (const p of canonical) {
    const kind = str(p.payment_kind).toLowerCase();
    if (kind !== 'deposit') continue;
    const st = str(p.status).toLowerCase();
    if (st !== 'succeeded' && st !== 'paid') continue;
    total += Math.max(0, cents(p.amount_cents) - cents(p.refunded_amount_cents));
  }
  return total;
}

function draftFromSnapshot(
  periodType: CloseoutPeriodType,
  periodKey: string,
  start: string,
  end: string,
  snapshot: FinancialSnapshot,
  fuelCents: number,
  depositsCollectedCents: number,
  existing?: Record<string, unknown> | null,
  closedByName?: string | null,
): CloseoutDraft {
  const otherExpenses = Math.max(0, snapshot.expensesCents - fuelCents);
  const net = snapshot.netProfitCents;
  const gross = snapshot.grossRevenueCents;
  return {
    periodType,
    periodKey,
    periodStart: start,
    periodEnd: end,
    cashCents: snapshot.cashRevenueCents,
    stripeCents: snapshot.stripeRevenueCents,
    zelleCents: snapshot.zelleRevenueCents,
    depositsCollectedCents,
    refundsCents: snapshot.refundsCents,
    expensesCents: otherExpenses,
    fuelCents,
    stripeFeesCents: snapshot.stripeFeesCents,
    grossRevenueCents: gross,
    netProfitCents: net,
    marginPercent: marginPercent(gross, net),
    openBalancesCents: snapshot.openBalancesCents,
    pendingDepositsCents: snapshot.pendingDepositsCents,
    completedJobs: snapshot.completedJobs,
    alreadyClosed: Boolean(existing),
    closedAt: existing?.closed_at ? String(existing.closed_at) : null,
    closedByName: closedByName ?? null,
    note: existing?.note ? String(existing.note) : null,
  };
}

export async function buildCloseoutDraft(
  admin: SupabaseClient,
  periodType: CloseoutPeriodType,
  periodKey?: string,
): Promise<CloseoutDraft> {
  const key =
    periodKey ??
    (periodType === 'daily' ? dateKeyChicago(new Date()) : monthKeyChicago(new Date()));
  const { start, end } = periodBoundsChicago(periodType, key);

  const [snapshot, fuelCents, depositsCollectedCents, existingRes] = await Promise.all([
    getFinancialSnapshot(admin, { startDate: start, endDate: end }),
    loadFuelCents(admin, start, end),
    loadDepositsCollectedCents(admin, start, end),
    admin.from('financial_closeouts').select('*').eq('period_type', periodType).eq('period_key', key).maybeSingle(),
  ]);

  let closedByName: string | null = null;
  const existing = existingRes.error ? null : (existingRes.data as Record<string, unknown> | null);
  if (existing?.closed_by) {
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, email')
      .eq('id', String(existing.closed_by))
      .maybeSingle();
    closedByName = str(profile?.full_name) || str(profile?.email) || 'Owner';
  }

  return draftFromSnapshot(periodType, key, start, end, snapshot, fuelCents, depositsCollectedCents, existing, closedByName);
}

export async function loadMoneyPulse(admin: SupabaseClient): Promise<MoneyPulse> {
  const now = endOfTodayChicagoIso();
  const todayStart = startOfTodayChicagoIso();
  const weekStart = startOfWeekChicagoIso();
  const monthKey = monthKeyChicago(new Date());
  const { start: monthStart, end: monthEnd } = periodBoundsChicago('monthly', monthKey);

  const [todaySnap, weekSnap, monthSnap, monthFuel] = await Promise.all([
    getFinancialSnapshot(admin, { startDate: todayStart, endDate: now }),
    getFinancialSnapshot(admin, { startDate: weekStart, endDate: now }),
    getFinancialSnapshot(admin, { startDate: monthStart, endDate: monthEnd }),
    loadFuelCents(admin, monthStart, monthEnd),
  ]);

  return {
    todayGrossCents: todaySnap.grossRevenueCents,
    weekGrossCents: weekSnap.grossRevenueCents,
    monthGrossCents: monthSnap.grossRevenueCents,
    todayNetCents: todaySnap.netProfitCents,
    weekNetCents: weekSnap.netProfitCents,
    monthNetCents: monthSnap.netProfitCents,
    openBalancesCents: monthSnap.openBalancesCents,
    pendingDepositsCents: monthSnap.pendingDepositsCents,
    monthRefundsCents: monthSnap.refundsCents,
    monthFuelCents: monthFuel,
    monthMarginPercent: marginPercent(monthSnap.grossRevenueCents, monthSnap.netProfitCents),
  };
}

export async function listCloseoutHistory(
  admin: SupabaseClient,
  limit = 30,
): Promise<CloseoutRecord[]> {
  const { data, error } = await admin
    .from('financial_closeouts')
    .select('*')
    .order('closed_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTable(error.message)) return [];
    return [];
  }

  const closerIds = [...new Set((data ?? []).map((r) => str((r as { closed_by?: string }).closed_by)).filter(Boolean))];
  const names = new Map<string, string>();
  if (closerIds.length > 0) {
    const { data: profiles } = await admin.from('profiles').select('id, full_name, email').in('id', closerIds);
    for (const p of profiles ?? []) {
      names.set(str(p.id), str(p.full_name) || str(p.email) || 'Owner');
    }
  }

  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const gross = cents(r.gross_revenue_cents);
    const net = cents(r.net_profit_cents);
    return {
      id: str(r.id),
      periodType: str(r.period_type) as CloseoutPeriodType,
      periodKey: str(r.period_key),
      periodStart: str(r.period_start),
      periodEnd: str(r.period_end),
      cashCents: cents(r.cash_cents),
      stripeCents: cents(r.stripe_cents),
      zelleCents: cents(r.zelle_cents),
      depositsCollectedCents: cents(r.deposits_collected_cents),
      refundsCents: cents(r.refunds_cents),
      expensesCents: cents(r.expenses_cents),
      fuelCents: cents(r.fuel_cents),
      stripeFeesCents: cents(r.stripe_fees_cents),
      grossRevenueCents: gross,
      netProfitCents: net,
      marginPercent: r.margin_bps != null ? cents(r.margin_bps) / 10 : marginPercent(gross, net),
      openBalancesCents: cents(r.open_balances_cents),
      pendingDepositsCents: cents(r.pending_deposits_cents),
      completedJobs: cents(r.completed_jobs),
      alreadyClosed: true,
      closedAt: str(r.closed_at) || null,
      closedByName: r.closed_by ? names.get(str(r.closed_by)) ?? null : null,
      note: r.note ? String(r.note) : null,
    };
  });
}

export async function closeFinancialPeriod(
  admin: SupabaseClient,
  actorId: string,
  periodType: CloseoutPeriodType,
  periodKey?: string,
  note?: string,
): Promise<{ ok?: boolean; error?: string; draft?: CloseoutDraft }> {
  const probe = await admin.from('financial_closeouts').select('id').limit(1);
  if (probe.error && isMissingTable(probe.error.message)) {
    return { error: 'Financial closeout table not migrated. Apply migration 000084.' };
  }

  const draft = await buildCloseoutDraft(admin, periodType, periodKey);
  if (draft.alreadyClosed) {
    return { error: `${periodType === 'daily' ? 'Day' : 'Month'} ${draft.periodKey} is already closed.` };
  }

  const marginBps = draft.marginPercent != null ? Math.round(draft.marginPercent * 10) : null;
  const { error } = await admin.from('financial_closeouts').insert({
    period_type: draft.periodType,
    period_key: draft.periodKey,
    period_start: draft.periodStart,
    period_end: draft.periodEnd,
    closed_by: actorId,
    closed_at: new Date().toISOString(),
    note: note?.trim() || null,
    cash_cents: draft.cashCents,
    stripe_cents: draft.stripeCents,
    zelle_cents: draft.zelleCents,
    deposits_collected_cents: draft.depositsCollectedCents,
    refunds_cents: draft.refundsCents,
    expenses_cents: draft.expensesCents,
    fuel_cents: draft.fuelCents,
    stripe_fees_cents: draft.stripeFeesCents,
    gross_revenue_cents: draft.grossRevenueCents,
    net_profit_cents: draft.netProfitCents,
    margin_bps: marginBps,
    open_balances_cents: draft.openBalancesCents,
    pending_deposits_cents: draft.pendingDepositsCents,
    completed_jobs: draft.completedJobs,
    snapshot: draft as unknown as Record<string, unknown>,
  });

  if (error) {
    if (/duplicate|unique/i.test(error.message)) {
      return { error: 'This period was already closed.' };
    }
    return { error: error.message };
  }

  return { ok: true, draft: { ...draft, alreadyClosed: true } };
}
