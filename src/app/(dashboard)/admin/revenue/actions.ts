'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { findAndRepairAllDuplicatePayments } from '@/lib/payment-duplicate-repair';

export async function managePaymentAction(
  id: string,
  action: 'keep' | 'exclude' | 'mark_test' | 'soft_delete',
  table: 'payments' | 'receipts' = 'payments',
  winnerId?: string | null,
) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };
  if (!id) return { error: 'Missing ID' };

  let cleanId = id;
  const tableName = table === 'receipts' ? 'receipts' : 'payments';
  if (tableName === 'receipts' && id.startsWith('receipt:')) {
    cleanId = id.substring(8);
  }

  let updateObj: Record<string, any> = {};
  if (action === 'keep') {
    updateObj =
      tableName === 'receipts'
        ? { exclude_from_revenue: false, is_test: false, voided_at: null, status: 'issued' }
        : { exclude_from_revenue: false, is_test: false, status: 'succeeded', voided_at: null };
  } else if (action === 'exclude') {
    updateObj = { exclude_from_revenue: true };
    if (tableName === 'payments' && winnerId) {
      const { data: row } = await admin.from('payments').select('metadata').eq('id', cleanId).maybeSingle();
      const prevMeta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
      updateObj = {
        exclude_from_revenue: true,
        metadata: {
          ...prevMeta,
          merged_into_payment_id: winnerId,
          duplicate_of_stripe: true,
          merged_at: new Date().toISOString(),
        },
      };
    } else if (tableName === 'receipts' && winnerId) {
      const { data: row } = await admin.from('receipts').select('metadata').eq('id', cleanId).maybeSingle();
      const prevMeta = (row?.metadata && typeof row.metadata === 'object' ? row.metadata : {}) as Record<string, unknown>;
      updateObj = {
        exclude_from_revenue: true,
        metadata: {
          ...prevMeta,
          merged_into_payment_id: winnerId,
          duplicate_of_payment: true,
          merged_at: new Date().toISOString(),
        },
      };
    }
  } else if (action === 'mark_test') {
    updateObj = { is_test: true };
  } else if (action === 'soft_delete') {
    updateObj =
      tableName === 'receipts'
        ? { status: 'voided', voided_at: new Date().toISOString(), exclude_from_revenue: true }
        : { status: 'voided', voided_at: new Date().toISOString() };
  }

  let { error } = await admin.from(tableName).update(updateObj).eq('id', cleanId);
  if (error && tableName === 'receipts' && /voided_at|exclude_from_revenue|is_test|status|schema cache|column|Could not find/i.test(error.message)) {
    const fallbackAttempts =
      action === 'keep'
        ? [{ status: 'issued' }, { exclude_from_revenue: false }, { is_test: false }]
        : action === 'exclude'
          ? [{ exclude_from_revenue: true }, { is_test: true }, { status: 'excluded' }]
          : action === 'mark_test'
            ? [{ is_test: true }, { exclude_from_revenue: true }, { status: 'test' }]
            : [{ status: 'voided' }, { voided_at: new Date().toISOString() }, { exclude_from_revenue: true }, { is_test: true }];
    for (const fallback of fallbackAttempts) {
      const retry = await admin.from(tableName).update(fallback).eq('id', cleanId);
      error = retry.error;
      if (!error) break;
      if (!/schema cache|column|Could not find|does not exist/i.test(error.message)) break;
    }
  }
  
  if (error) {
    console.error(`[revenue-actions] error updating ${tableName} id ${id}:`, error.message);
    return { error: error.message };
  }

  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/receipts');
  revalidatePath('/admin/system-diagnostics');
  return { ok: true };
}

/** Repair all duplicate payment groups — keeps canonical Stripe/real row, excludes duplicates. */
export async function repairAllDuplicatePaymentsAction(): Promise<{
  ok?: boolean;
  error?: string;
  repaired?: number;
  paymentsExcluded?: number;
  receiptsExcluded?: number;
}> {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };

  const result = await findAndRepairAllDuplicatePayments(admin);
  if (result.errors.length > 0) {
    return {
      error: result.errors.slice(0, 3).join('; '),
      repaired: result.groupsRepaired,
      paymentsExcluded: result.paymentsExcluded,
      receiptsExcluded: result.receiptsExcluded,
    };
  }

  revalidatePath('/admin/revenue');
  revalidatePath('/admin/reports');
  revalidatePath('/admin/receipts');
  revalidatePath('/admin');
  revalidatePath('/admin/exceptions');
  revalidatePath('/admin/daily-operations');
  revalidatePath('/admin/system-diagnostics');
  return {
    ok: true,
    repaired: result.groupsRepaired,
    paymentsExcluded: result.paymentsExcluded,
    receiptsExcluded: result.receiptsExcluded,
  };
}
