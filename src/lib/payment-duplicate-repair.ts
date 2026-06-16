import type { SupabaseClient } from '@supabase/supabase-js';
import { isRealStripePayment, shouldExcludeFromCashRevenue } from '@/lib/payment-classification';
import { paymentRevenueIdentityKey, type PayRow } from '@/lib/revenue-metrics';
import { excludeDuplicatePaymentRows } from '@/lib/stripe-payment-resolve';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export type DuplicatePaymentGroup = {
  key: string;
  rows: PayRow[];
  winnerId: string | null;
  duplicateIds: string[];
};

function fallbackGroupKey(p: PayRow): string {
  const aid = str(p.appointment_id);
  const amt = typeof p.amount_cents === 'number' ? p.amount_cents : 0;
  const method = str(p.payment_method || p.payment_kind).toLowerCase();
  if (!aid || amt <= 0) return '';
  return `appt:${aid}:${amt}:${method}`;
}

/** Identify duplicate payment/receipt groups using canonical revenue identity keys. */
export function findDuplicatePaymentGroups(rows: PayRow[]): DuplicatePaymentGroup[] {
  const byKey = new Map<string, PayRow[]>();

  for (const p of rows) {
    const key = paymentRevenueIdentityKey(p) || fallbackGroupKey(p);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }

  return Array.from(byKey.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, groupRows]) => {
      const winner = pickCanonicalPaymentWinner(groupRows);
      const winnerId = str(winner?.id) || null;
      return {
        key,
        rows: groupRows,
        winnerId,
        duplicateIds: groupRows.map((r) => str(r.id)).filter((id) => id && id !== winnerId),
      };
    });
}

export function pickCanonicalPaymentWinner(rows: PayRow[]): PayRow | null {
  if (rows.length === 0) return null;
  const scored = [...rows].sort((a, b) => scoreWinner(b) - scoreWinner(a));
  return scored[0] ?? null;
}

function scoreWinner(p: PayRow): number {
  let score = 0;
  if (isRealStripePayment(p as Parameters<typeof isRealStripePayment>[0])) score += 100;
  if (p.exclude_from_revenue !== true && !shouldExcludeFromCashRevenue(p)) score += 50;
  const meta = p.metadata && typeof p.metadata === 'object' ? (p.metadata as Record<string, unknown>) : null;
  if (meta?.duplicate_of_stripe === true || meta?.merged_into_payment_id) score -= 80;
  const source = `${str(p.payment_method)} ${str(p.payment_kind)} ${JSON.stringify(meta ?? {})}`.toLowerCase();
  if (source.includes('repair_')) score -= 60;
  if (p.is_test === true) score -= 40;
  const ts = str(p.paid_at) || str(p.created_at);
  if (ts) score += Math.max(0, 10 - new Date(ts).getTime() / 1e15);
  return score;
}

export type RepairDuplicateResult = {
  groupsFound: number;
  groupsRepaired: number;
  paymentsExcluded: number;
  receiptsExcluded: number;
  winnerIds: string[];
  errors: string[];
};

/** Safely exclude duplicate rows; never deletes data. */
export async function repairDuplicatePaymentGroups(
  admin: SupabaseClient,
  groups: DuplicatePaymentGroup[],
): Promise<RepairDuplicateResult> {
  const result: RepairDuplicateResult = {
    groupsFound: groups.length,
    groupsRepaired: 0,
    paymentsExcluded: 0,
    receiptsExcluded: 0,
    winnerIds: [],
    errors: [],
  };

  for (const group of groups) {
    const winner = group.rows.find((r) => str(r.id) === group.winnerId) ?? pickCanonicalPaymentWinner(group.rows);
    const winnerId = str(winner?.id);
    if (!winnerId) continue;

    const paymentDupIds: string[] = [];
    const receiptDupIds: string[] = [];

    for (const row of group.rows) {
      const id = str(row.id);
      if (!id || id === winnerId) continue;
      if (row.source_table === 'receipts' || str(row.id).startsWith('receipt:')) {
        receiptDupIds.push(id.replace(/^receipt:/, ''));
      } else {
        paymentDupIds.push(id);
      }
    }

    if (paymentDupIds.length === 0 && receiptDupIds.length === 0) continue;

    try {
      if (paymentDupIds.length > 0) {
        await excludeDuplicatePaymentRows(admin, paymentDupIds, winnerId);
        result.paymentsExcluded += paymentDupIds.length;
      }
      for (const receiptId of receiptDupIds) {
        const { data: row } = await admin.from('receipts').select('metadata').eq('id', receiptId).maybeSingle();
        const prevMeta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
        await admin
          .from('receipts')
          .update({
            exclude_from_revenue: true,
            metadata: {
              ...prevMeta,
              merged_into_payment_id: winnerId,
              duplicate_of_payment: true,
              merged_at: new Date().toISOString(),
            },
          })
          .eq('id', receiptId);
        result.receiptsExcluded += 1;
      }
      result.groupsRepaired += 1;
      result.winnerIds.push(winnerId);
    } catch (e) {
      result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }

  return result;
}

export async function findAndRepairAllDuplicatePayments(admin: SupabaseClient, limit = 5000): Promise<RepairDuplicateResult> {
  const select =
    'id, amount_cents, status, payment_method, payment_kind, voided_at, voided, created_at, paid_at, appointment_id, metadata, stripe_checkout_session_id, stripe_payment_intent_id, provider, is_test, exclude_from_revenue, refunded_at, refunded_amount_cents';
  const { data: payments } = await admin.from('payments').select(select).order('created_at', { ascending: false }).limit(limit);
  const rows = ((payments ?? []) as PayRow[]).map((p) => ({ ...p, source_table: 'payments' as const }));
  const groups = findDuplicatePaymentGroups(rows).filter((g) => g.duplicateIds.length > 0);
  return repairDuplicatePaymentGroups(admin, groups);
}
