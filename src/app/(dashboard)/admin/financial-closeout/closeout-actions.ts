'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import {
  buildCloseoutDraft,
  closeFinancialPeriod,
  type CloseoutPeriodType,
} from '@/lib/financial-closeout';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireStaffAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { session, admin };
}

function revalidateCloseoutPaths() {
  revalidatePath('/admin/financial-closeout');
  revalidatePath('/admin/revenue');
  revalidatePath('/admin');
}

export async function closeDayAction(
  periodKey?: string,
  note?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  const result = await closeFinancialPeriod(gate.admin, gate.session.user!.id, 'daily', periodKey, note);
  if (result.error) return { error: result.error };
  revalidateCloseoutPaths();
  return { ok: true };
}

export async function closeMonthAction(
  periodKey?: string,
  note?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  const result = await closeFinancialPeriod(gate.admin, gate.session.user!.id, 'monthly', periodKey, note);
  if (result.error) return { error: result.error };
  revalidateCloseoutPaths();
  return { ok: true };
}

export async function previewCloseoutAction(
  periodType: CloseoutPeriodType,
  periodKey?: string,
): Promise<{ ok?: boolean; error?: string; draft?: Awaited<ReturnType<typeof buildCloseoutDraft>> }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  try {
    const draft = await buildCloseoutDraft(gate.admin, periodType, periodKey);
    return { ok: true, draft };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Preview failed' };
  }
}
