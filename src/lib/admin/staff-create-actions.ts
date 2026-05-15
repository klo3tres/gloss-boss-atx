'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

const STAFF_ROLES = new Set(['technician', 'admin', 'super_admin']);

export type CreateStaffResult = { ok: boolean; error?: string; usedInvite?: boolean };

export async function createStaffMemberAction(formData: FormData): Promise<CreateStaffResult> {
  const session = await getSessionWithProfile();
  if (!session.user || session.profile?.role !== 'super_admin') {
    return { ok: false, error: 'Only super admins can create staff accounts.' };
  }

  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '').trim();
  const role = String(formData.get('role') ?? '').trim();
  if (!email || !password || !STAFF_ROLES.has(role)) {
    return { ok: false, error: 'Valid email, password, and role are required.' };
  }
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return { ok: false, error: 'Server admin client unavailable. Set SUPABASE_SERVICE_ROLE_KEY.' };
  }

  const displayName = email.split('@')[0] || 'Staff';

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: displayName },
  });

  let userId: string | null = created.data?.user?.id ?? null;
  let usedInvite = false;

  if (created.error || !userId) {
    const em = created.error?.message ?? '';
    if (/already|registered|exists|duplicate/i.test(em)) {
      return { ok: false, error: 'An account with this email already exists.' };
    }

    const invited = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: displayName },
    });

    if (invited.error || !invited.data?.user?.id) {
      return {
        ok: false,
        error: `${em || 'createUser failed'} — invite fallback failed: ${invited.error?.message ?? 'unknown'}`,
      };
    }
    userId = invited.data.user.id;
    usedInvite = true;
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { id: userId, full_name: displayName, role, updated_at: now };
  let up = await admin.from('profiles').upsert(payload, { onConflict: 'id' });
  if (up.error && /updated_at|column .* does not exist|Could not find|schema cache/i.test(up.error.message)) {
    up = await admin.from('profiles').upsert({ id: userId, full_name: displayName, role }, { onConflict: 'id' });
  }

  if (up.error) {
    return { ok: false, error: `User created but profile save failed: ${up.error.message}` };
  }

  revalidatePath('/admin/team');
  revalidatePath('/admin/super');
  return { ok: true, usedInvite };
}

export async function submitCreateStaffForm(formData: FormData): Promise<void> {
  const res = await createStaffMemberAction(formData);
  const base = '/admin/team';
  if (!res.ok) {
    redirect(`${base}?staffErr=${encodeURIComponent(res.error ?? 'Failed to create staff')}`);
  }
  if (res.usedInvite) {
    redirect(`${base}?staffOk=invite`);
  }
  redirect(`${base}?staffOk=1`);
}
