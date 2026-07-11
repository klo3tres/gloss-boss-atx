import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/auth/roles';
import { isStaffRole } from '@/lib/auth/roles';
import { isProtectedOwner, parseStaffInviteRole } from '@/lib/auth/owner-config';
import { parseAppRole } from '@/lib/auth/role-resolution';

/**
 * Resolve the role a new profile should receive before defaulting to customer.
 * Order: protected owner → accepted staff invite → pending staff invite → existing staff row hint.
 */
export async function resolveInitialProfileRole(
  admin: SupabaseClient,
  input: { userId: string; email: string },
): Promise<AppRole> {
  const emailNorm = input.email.trim().toLowerCase();
  if (isProtectedOwner(emailNorm, input.userId)) return 'super_admin';

  const { data: inviteByEmail } = await admin
    .from('staff_invites')
    .select('role, status, auth_user_id')
    .ilike('email', emailNorm)
    .in('status', ['accepted', 'pending'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteByEmail) {
    const inviteRole = parseStaffInviteRole((inviteByEmail as { role?: string }).role);
    if (inviteRole && isStaffRole(inviteRole)) return inviteRole;
  }

  const { data: inviteByUser } = await admin
    .from('staff_invites')
    .select('role, status')
    .eq('auth_user_id', input.userId)
    .eq('status', 'accepted')
    .order('accepted_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inviteByUser) {
    const inviteRole = parseStaffInviteRole((inviteByUser as { role?: string }).role);
    if (inviteRole && isStaffRole(inviteRole)) return inviteRole;
  }

  return 'customer';
}

/** Repair staff profile from accepted invite when role was incorrectly set to customer. */
export async function repairStaffProfileFromSources(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: boolean; fixed: string[]; role?: AppRole; error?: string }> {
  const fixed: string[] = [];

  const { data: authUser, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr || !authUser?.user) {
    return { ok: false, fixed, error: authErr?.message ?? 'Auth user not found.' };
  }
  fixed.push('auth_user_exists');

  const email = (authUser.user.email ?? '').trim().toLowerCase();
  const { data: profile } = await admin.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (!profile) {
    const role = await resolveInitialProfileRole(admin, { userId, email });
    const metaName = typeof authUser.user.user_metadata?.full_name === 'string'
      ? authUser.user.user_metadata.full_name.trim()
      : '';
    const now = new Date().toISOString();
    const { error: insErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        email,
        full_name: metaName || email.split('@')[0] || 'Team member',
        display_name: metaName || email.split('@')[0] || 'Team member',
        role,
        active: true,
        updated_at: now,
      },
      { onConflict: 'id' },
    );
    if (insErr) return { ok: false, fixed, error: insErr.message };
    fixed.push(`profile_created_as_${role}`);
    return { ok: true, fixed, role };
  }

  const currentRole = parseAppRole((profile as { role?: string }).role);
  const expectedRole = await resolveInitialProfileRole(admin, { userId, email });

  if (isProtectedOwner(email, userId) && currentRole !== 'super_admin') {
    await admin.from('profiles').update({ role: 'super_admin', active: true, updated_at: new Date().toISOString() }).eq('id', userId);
    fixed.push('promoted_to_super_admin');
    return { ok: true, fixed, role: 'super_admin' };
  }

  if (currentRole === 'customer' && isStaffRole(expectedRole)) {
    await admin
      .from('profiles')
      .update({ role: expectedRole, active: true, updated_at: new Date().toISOString() })
      .eq('id', userId);
    fixed.push(`role_repaired_${expectedRole}`);
    return { ok: true, fixed, role: expectedRole };
  }

  if ((profile as { active?: boolean }).active === false && isStaffRole(currentRole)) {
    await admin.from('profiles').update({ active: true, updated_at: new Date().toISOString() }).eq('id', userId);
    fixed.push('reactivated_staff');
  }

  fixed.push(`profile_ok_role_${currentRole ?? 'unknown'}`);
  return { ok: true, fixed, role: currentRole ?? undefined };
}
