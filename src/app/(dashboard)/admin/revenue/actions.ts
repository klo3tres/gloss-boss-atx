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
  if (action === 'keep') {
    updateObj = { exclude_from_revenue: false, is_test: false, voided: false, voided_at: null };
  } else if (action === 'exclude') {
    updateObj = { exclude_from_revenue: true };
  } else if (action === 'mark_test') {
    updateObj = { is_test: true };
  } else if (action === 'soft_delete') {
    updateObj = { voided: true, voided_at: new Date().toISOString() };
  }

  const tableName = table === 'receipts' ? 'receipts' : 'payments';
  let cleanId = id;
  if (tableName === 'receipts' && id.startsWith('receipt:')) {
    cleanId = id.substring(8);
  }
  const { error } = await admin.from(tableName).update(updateObj).eq('id', cleanId);
  
  if (error) {
    console.error(`[revenue-actions] error updating ${tableName} id ${id}:`, error.message);
    return { error: error.message };
  }

  revalidatePath('/admin/revenue');
  revalidatePath('/admin/system-diagnostics');
  return { ok: true };
}
