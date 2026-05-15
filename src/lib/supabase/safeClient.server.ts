import 'server-only';

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getPublicSupabaseEnv, logMissingPublicSupabaseEnv } from '@/lib/supabase/env';

function warn(context: string, err: unknown) {
  console.warn(`[Gloss Boss ATX][safeClient.server] ${context}`, err);
}

/** Cookie-backed server client (RLS + user JWT). Never throws. */
export async function tryCreateServerSupabase(): Promise<SupabaseClient | null> {
  try {
    const env = getPublicSupabaseEnv();
    if (!env) {
      logMissingPublicSupabaseEnv('tryCreateServerSupabase');
      return null;
    }
    const cookieStore = await cookies();
    return createServerClient(env.url, env.anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            /* Server Component may be read-only — ignore cookie write failures */
          }
        },
      },
    });
  } catch (e) {
    warn('server client', e);
    return null;
  }
}
