import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/auth/roles';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';

export async function requireProfileRoles(
  supabase: SupabaseClient,
  allowed: readonly AppRole[],
): Promise<{ ok: true; userId: string; role: AppRole } | { ok: false; response: NextResponse }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const emailNorm = (user.email ?? '').trim().toLowerCase();

  const { data: profile, error } = await supabase.from('profiles').select('id, role').eq('id', user.id).maybeSingle();

  if (error) {
    console.warn('[requireProfileRoles] profile query', error.message);
    if (emailNorm === OWNER_LOGIN_EMAIL) {
      const role: AppRole = 'super_admin';
      if (!allowed.includes(role)) {
        return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
      }
      return { ok: true, userId: user.id, role };
    }
    return {
      ok: false,
      response: NextResponse.json({ error: 'Profile query failed', message: error.message }, { status: 503 }),
    };
  }

  let role: AppRole | null = null;

  if (profile?.role != null && profile.role !== '') {
    role = parseAppRole(profile.role);
    if (!role) {
      return { ok: false, response: NextResponse.json({ error: 'Invalid profile role' }, { status: 403 }) };
    }
    if (emailNorm === OWNER_LOGIN_EMAIL && role !== 'super_admin') {
      role = 'super_admin';
    }
  } else if (emailNorm === OWNER_LOGIN_EMAIL) {
    role = 'super_admin';
  } else {
    return { ok: false, response: NextResponse.json({ error: 'Profile not found' }, { status: 403 }) };
  }

  console.info(
    '[AUTH_FLOW]',
    JSON.stringify({
      step: 'requireProfileRoles',
      email: user.email,
      resolvedRole: role,
      allowed: [...allowed],
    }),
  );

  if (!allowed.includes(role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, role };
}
