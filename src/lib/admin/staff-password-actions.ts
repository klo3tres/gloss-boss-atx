'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export async function resetStaffPasswordAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || session.profile?.role !== 'super_admin') {
    return { ok: false, error: 'Only super admins can reset passwords.' };
  }

  const userId = String(formData.get('userId') ?? '').trim();
  const password = String(formData.get('password') ?? '').trim();
  if (!userId || password.length < 8) {
    return { ok: false, error: 'Valid user id and password (min 8 chars) required.' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return { ok: false, error: 'Server admin client unavailable.' };
  }

  const { error } = await admin.auth.admin.updateUserById(userId, { password });
  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/team');
  return { ok: true };
}

export async function submitResetStaffPasswordForm(formData: FormData): Promise<void> {
  const res = await resetStaffPasswordAction(formData);
  const base = '/admin/team';
  if (!res.ok) {
    redirect(`${base}?pwdErr=${encodeURIComponent(res.error ?? 'Reset failed')}`);
  }
  redirect(`${base}?pwdOk=1`);
}
