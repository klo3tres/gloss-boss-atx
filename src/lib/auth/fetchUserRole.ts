import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppRole } from '@/lib/auth/roles';
import { logRoleDebug, parseAppRole, OWNER_LOGIN_EMAIL } from '@/lib/auth/role-resolution';

export type FetchUserRoleResult =
  | { ok: false; code: 'NO_SESSION'; userId: null; email: null }
  | { ok: false; code: 'MISSING_PROFILE'; userId: string; email: string | null }
  | { ok: false; code: 'PROFILE_QUERY_ERROR'; userId: string; email: string | null; message: string }
  | { ok: false; code: 'INVALID_ROLE'; userId: string; email: string | null; rawRole: string }
  | {
      ok: true;
      userId: string;
      role: AppRole;
      email: string | null;
      profileRow: { id: string; role: string; full_name: string | null } | null;
      source: 'profile' | 'owner_bootstrap' | 'session_fallback';
    };

function logAuthFlow(payload: Record<string, unknown>) {
  console.info('[AUTH_FLOW]', JSON.stringify(payload));
}

function isOwnerEmail(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === OWNER_LOGIN_EMAIL;
}

/** Browser-only: creates missing profile or promotes owner via service role (`/api/auth/ensure-profile`). */
export async function requestProfileSync(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    await fetch('/api/auth/ensure-profile', { method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  } catch {
    /* ignore — caller may still use owner_bootstrap if service role unavailable */
  }
}

function scheduleBackgroundProfileSync(): void {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => {
    void requestProfileSync();
  }, 0);
}

async function fetchProfileRow(
  client: SupabaseClient,
  userId: string,
): Promise<{ row: { id: string; role: string; full_name: string | null } | null; error: string | null }> {
  try {
    const { data, error } = await client.from('profiles').select('id, role, full_name').eq('id', userId).maybeSingle();
    if (error) {
      if (/full_name|updated_at|email|column .* does not exist|schema cache/i.test(error.message)) {
        const r2 = await client.from('profiles').select('id, role').eq('id', userId).maybeSingle();
        if (r2.error) return { row: null, error: r2.error.message };
        if (!r2.data) return { row: null, error: null };
        return { row: { id: r2.data.id, role: String(r2.data.role), full_name: null }, error: null };
      }
      return { row: null, error: error.message };
    }
    if (!data) return { row: null, error: null };
    return {
      row: { id: data.id, role: String(data.role), full_name: data.full_name ?? null },
      error: null,
    };
  } catch (e) {
    return { row: null, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Resolves role from `profiles.role`. Production recovery: profile/RLS/schema failures never block —
 * owner email still elevates to super_admin; everyone else falls back to `customer` and background-heals via ensure-profile.
 */
export async function fetchUserRole(client: SupabaseClient): Promise<FetchUserRoleResult> {
  try {
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();

    if (userErr || !user) {
      logAuthFlow({ step: 'fetchUserRole', code: 'NO_SESSION', detail: userErr?.message });
      logRoleDebug({ step: 'fetchUserRole', code: 'NO_SESSION', detail: userErr?.message });
      return { ok: false, code: 'NO_SESSION', userId: null, email: null };
    }

    const email = user.email ?? null;
    let profileFetch: 'ok' | 'error' = 'ok';
    let profileError: string | null = null;

    const first = await fetchProfileRow(client, user.id);
    if (first.error) {
      profileFetch = 'error';
      profileError = first.error;
    }
    let profileRow = first.row;

    if (profileFetch === 'error') {
      logAuthFlow({ step: 'fetchUserRole', code: 'PROFILE_QUERY_RECOVERY', email, profileError });
      logRoleDebug({ step: 'fetchUserRole', code: 'PROFILE_QUERY_RECOVERY', detail: profileError });
      scheduleBackgroundProfileSync();
      if (isOwnerEmail(email)) {
        return {
          ok: true,
          userId: user.id,
          role: 'super_admin',
          email,
          profileRow: null,
          source: 'owner_bootstrap',
        };
      }
      return {
        ok: true,
        userId: user.id,
        role: 'customer',
        email,
        profileRow: null,
        source: 'session_fallback',
      };
    }

    const parsedForSync = profileRow ? parseAppRole(profileRow.role) : null;
    const needsProfileSync =
      !profileRow || (isOwnerEmail(email) && parsedForSync !== 'super_admin');
    if (needsProfileSync) {
      logAuthFlow({
        step: 'fetchUserRole',
        profileSync: 'attempt',
        email,
        userId: user.id,
        missingRow: !profileRow,
        ownerNeedsElevate: Boolean(isOwnerEmail(email) && profileRow && parsedForSync !== 'super_admin'),
      });
      await requestProfileSync();
      const second = await fetchProfileRow(client, user.id);
      if (second.error) {
        logAuthFlow({ step: 'fetchUserRole', code: 'PROFILE_QUERY_RECOVERY_AFTER_SYNC', email, profileError: second.error });
        scheduleBackgroundProfileSync();
        if (isOwnerEmail(email)) {
          return {
            ok: true,
            userId: user.id,
            role: 'super_admin',
            email,
            profileRow: null,
            source: 'owner_bootstrap',
          };
        }
        return {
          ok: true,
          userId: user.id,
          role: 'customer',
          email,
          profileRow: null,
          source: 'session_fallback',
        };
      }
      profileRow = second.row;
    }

    if (!profileRow) {
      if (isOwnerEmail(email)) {
        logAuthFlow({ step: 'fetchUserRole', source: 'owner_bootstrap', email, role: 'super_admin', note: 'heal_failed_or_no_row' });
        logRoleDebug({ step: 'fetchUserRole', code: 'OK', authUserId: user.id, resolvedRole: 'super_admin', source: 'owner_bootstrap' });
        return {
          ok: true,
          userId: user.id,
          role: 'super_admin',
          email,
          profileRow: null,
          source: 'owner_bootstrap',
        };
      }
      logAuthFlow({ step: 'fetchUserRole', code: 'MISSING_PROFILE_RECOVERY', email, userId: user.id });
      logRoleDebug({ step: 'fetchUserRole', code: 'MISSING_PROFILE_RECOVERY', authUserId: user.id });
      scheduleBackgroundProfileSync();
      return {
        ok: true,
        userId: user.id,
        role: 'customer',
        email,
        profileRow: null,
        source: 'session_fallback',
      };
    }

    const parsed = parseAppRole(profileRow.role);
    if (!parsed) {
      logAuthFlow({ step: 'fetchUserRole', code: 'INVALID_ROLE_RECOVERY', rawRole: profileRow.role, userId: user.id });
      scheduleBackgroundProfileSync();
      if (isOwnerEmail(email)) {
        return {
          ok: true,
          userId: user.id,
          role: 'super_admin',
          email,
          profileRow,
          source: 'owner_bootstrap',
        };
      }
      return {
        ok: true,
        userId: user.id,
        role: 'customer',
        email,
        profileRow: null,
        source: 'session_fallback',
      };
    }

    if (isOwnerEmail(email) && parsed !== 'super_admin') {
      logAuthFlow({
        step: 'fetchUserRole',
        source: 'owner_bootstrap',
        email,
        resolvedRole: 'super_admin',
        note: 'canonical_owner_email_over_db_role',
        dbRole: parsed,
      });
      logRoleDebug({
        step: 'fetchUserRole',
        code: 'OK',
        authUserId: user.id,
        resolvedRole: 'super_admin',
        source: 'owner_bootstrap',
        dbRole: parsed,
      });
      return { ok: true, userId: user.id, role: 'super_admin', email, profileRow, source: 'owner_bootstrap' };
    }

    logAuthFlow({
      step: 'fetchUserRole',
      email,
      resolvedRole: parsed,
      source: 'profile',
      profileRowPresent: true,
    });
    logRoleDebug({ step: 'fetchUserRole', authUserId: user.id, resolvedRole: parsed, source: 'profile', code: 'OK' });

    return { ok: true, userId: user.id, role: parsed, email, profileRow, source: 'profile' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logAuthFlow({ step: 'fetchUserRole', profileFetch: 'exception', profileError: msg });
    logRoleDebug({ step: 'fetchUserRole', code: 'EXCEPTION', detail: msg });
    try {
      const {
        data: { user },
        error: userErr,
      } = await client.auth.getUser();
      if (!userErr && user) {
        const email = user.email ?? null;
        if (isOwnerEmail(email)) {
          return {
            ok: true,
            userId: user.id,
            role: 'super_admin',
            email,
            profileRow: null,
            source: 'owner_bootstrap',
          };
        }
        return {
          ok: true,
          userId: user.id,
          role: 'customer',
          email,
          profileRow: null,
          source: 'session_fallback',
        };
      }
    } catch {
      /* fall through */
    }
    return { ok: false, code: 'NO_SESSION', userId: null, email: null };
  }
}

/** Retries transient profile reads (legacy). Prefer `fetchUserRole` once after hydration to avoid role flicker. */
export async function fetchUserRoleWithRetry(client: SupabaseClient, attempts = 2, delayMs = 280): Promise<FetchUserRoleResult> {
  let last = await fetchUserRole(client);
  let profileQueryRetries = 0;
  const maxProfileQueryRetries = 1;

  for (let i = 1; i < attempts; i++) {
    if (last.ok) return last;

    if (last.code === 'MISSING_PROFILE') {
      await new Promise((res) => setTimeout(res, delayMs));
      last = await fetchUserRole(client);
      continue;
    }

    if (last.code === 'PROFILE_QUERY_ERROR' && profileQueryRetries < maxProfileQueryRetries) {
      profileQueryRetries += 1;
      logAuthFlow({
        step: 'fetchUserRoleWithRetry',
        retry: profileQueryRetries,
        code: 'PROFILE_QUERY_ERROR',
        message: last.message,
      });
      await new Promise((res) => setTimeout(res, delayMs * 2));
      last = await fetchUserRole(client);
      continue;
    }

    return last;
  }

  return last;
}
