'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, admin };
}

export async function archiveAppointmentWorkOrderAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const confirm = String(formData.get('confirm') ?? '').trim();
  if (!id || confirm !== 'ARCHIVE') return { ok: false, error: 'Type ARCHIVE to confirm.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from('appointments')
    .update({ archived: true, archived_at: now, updated_at: now })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  return { ok: true };
}
