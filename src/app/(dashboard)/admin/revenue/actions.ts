'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function managePaymentAction(
  id: string,
  action: 'keep' | 'exclude' | 'mark_test' | 'soft_delete',
  table: 'payments' | 'receipts' = 'payments'
) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return { error: 'Unauthorized' };
  if (!id) return { error: 'Missing ID' };

  let updateObj: Record<string, any> = {};
  const tableName = table === 'receipts' ? 'receipts' : 'payments';
  if (action === 'keep') {
    updateObj =
      tableName === 'receipts'
        ? { exclude_from_revenue: false, is_test: false, voided_at: null, status: 'issued' }
        : { exclude_from_revenue: false, is_test: false, voided: false, voided_at: null };
  } else if (action === 'exclude') {
    updateObj = { exclude_from_revenue: true };
  } else if (action === 'mark_test') {
    updateObj = { is_test: true };
  } else if (action === 'soft_delete') {
    updateObj =
      tableName === 'receipts'
        ? { status: 'voided', voided_at: new Date().toISOString(), exclude_from_revenue: true }
        : { voided: true, voided_at: new Date().toISOString() };
  }

  let cleanId = id;
  if (tableName === 'receipts' && id.startsWith('receipt:')) {
    cleanId = id.substring(8);
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
  revalidatePath('/admin/system-diagnostics');
  return { ok: true };
}
