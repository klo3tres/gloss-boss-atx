import { isAdminLevel, isStaffRole, type AppRole } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { tryCreateServerSupabase } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AdminApiOk = {
  ok: true;
  userId: string;
  role: AppRole | null;
  supabase: SupabaseClient;
};

export type AdminApiErr = { ok: false; status: number; error: string };

export async function requireAdminApiUser(): Promise<AdminApiOk | AdminApiErr> {
  const supabase = await tryCreateServerSupabase();
  if (!supabase) {
    return { ok: false, status: 503, error: 'Server session unavailable' };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { ok: false, status: 401, error: 'Not authenticated' };
  }
  const { data: profile, error: profErr } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  let role = parseAppRole(profile?.role);
  if (profErr || !profile || profile.role == null || String(profile.role).trim() === '') {
    const em = (user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) {
      role = 'super_admin';
    }
  }
  if (!isAdminLevel(role)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, userId: user.id, role, supabase };
}

export async function requireStaffApiUser(): Promise<AdminApiOk | AdminApiErr> {
  const supabase = await tryCreateServerSupabase();
  if (!supabase) {
    return { ok: false, status: 503, error: 'Server session unavailable' };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return { ok: false, status: 401, error: 'Not authenticated' };
  }
  const { data: profile, error: profErr } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  let role = parseAppRole(profile?.role);
  if (profErr || !profile || profile.role == null || String(profile.role).trim() === '') {
    const em = (user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) {
      role = 'super_admin';
    }
  }
  if (!isStaffRole(role)) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }
  return { ok: true, userId: user.id, role, supabase };
}

export async function requireSuperAdminApiUser(): Promise<AdminApiOk | AdminApiErr> {
  const r = await requireAdminApiUser();
  if (!r.ok) return r;
  if (r.role !== 'super_admin') {
    return { ok: false, status: 403, error: 'Super admin only' };
  }
  return r;
}
