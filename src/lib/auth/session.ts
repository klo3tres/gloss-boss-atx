import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/auth/roles';
import { resolveRoleWithFallback } from '@/lib/auth/role-resolution';

export type SessionProfile = {
  supabaseConfigured: boolean;
  user: { id: string; email?: string | null } | null;
  /** When `user` is set, `role` is always resolved (DB + code fallback); `full_name` from DB when present. */
  profile: { full_name: string | null; role: AppRole } | null;
};

export async function getSessionWithProfile(): Promise<SessionProfile> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return { supabaseConfigured: false, user: null, profile: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { supabaseConfigured: true, user: null, profile: null };
  }

  let profileRole: unknown = undefined;
  let fullName: string | null = null;
  try {
    let { data: profile, error: profErr } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle();
    if (profErr && /full_name|updated_at|email|column .* does not exist|schema cache/i.test(profErr.message)) {
      const r2 = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
      profile = r2.data ? { role: r2.data.role, full_name: null as string | null } : null;
    } else if (profErr) {
      console.warn('[getSessionWithProfile] profile read', profErr.message);
      profile = null;
    }
    if (profile) {
      profileRole = profile.role;
      fullName = profile.full_name ?? null;
    }
  } catch {
    /* non-fatal: fallback role */
  }

  const role = resolveRoleWithFallback(user.email, profileRole);

  console.info(
    '[AUTH_FLOW]',
    JSON.stringify({
      step: 'getSessionWithProfile',
      email: user.email,
      profileFetch: profileRole === undefined ? 'empty_or_error' : 'ok',
      resolvedRole: role,
    }),
  );

  return {
    supabaseConfigured: true,
    user: { id: user.id, email: user.email },
    profile: { full_name: fullName, role },
  };
}
