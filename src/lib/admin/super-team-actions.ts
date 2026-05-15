'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function promoteProfileRoleAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || session.profile?.role !== 'super_admin') {
    return { ok: false, error: 'Unauthorized' };
  }

  const targetId = String(formData.get('profileId') ?? '').trim();
  const nextRole = parseAppRole(String(formData.get('role') ?? '').trim());
  if (!targetId || !nextRole) {
    return { ok: false, error: 'Invalid role or profile id' };
  }

  if (targetId === session.user.id && nextRole !== 'super_admin') {
    return { ok: false, error: 'You cannot demote your own super_admin account from this panel.' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return { ok: false, error: 'Admin database client unavailable' };
  }

  const now = new Date().toISOString();
  let { error } = await admin.from('profiles').update({ role: nextRole, updated_at: now }).eq('id', targetId);

  if (error && /updated_at|column .* does not exist|schema cache/i.test(error.message)) {
    const r2 = await admin.from('profiles').update({ role: nextRole }).eq('id', targetId);
    error = r2.error;
  }

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/super');
  revalidatePath('/admin/team');
  return { ok: true };
}

export async function submitPromoteRoleForm(formData: FormData): Promise<void> {
  const res = await promoteProfileRoleAction(formData);
  if (!res.ok) {
    console.warn('[GLOSS_ROLE_DEBUG]', JSON.stringify({ step: 'super_team_promote_failed', error: res.error ?? 'unknown' }));
  }
}
