/**
 * Non-server-only Supabase factories (browser + anonymous route + admin).
 * Never throws — returns null and logs a warning on failure.
 */

import { createBrowserClient } from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getPublicSupabaseEnv, getServiceRoleEnv, logMissingPublicSupabaseEnv, logMissingServiceRoleEnv } from '@/lib/supabase/env';

function warn(context: string, err: unknown) {
  console.warn(`[Gloss Boss ATX][safeClient] ${context}`, err);
}

export function isSupabasePublicReady(): boolean {
  return getPublicSupabaseEnv() !== null;
}

/** Browser (anon + user session). Safe for `'use client'` imports. */
export function tryCreateBrowserSupabase(): SupabaseClient | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const env = getPublicSupabaseEnv();
    if (!env) {
      logMissingPublicSupabaseEnv('tryCreateBrowserSupabase');
      return null;
    }
    return createBrowserClient(env.url, env.anonKey);
  } catch (e) {
    warn('browser client', e);
    return null;
  }
}

/** Route handler / server: anon, no cookies. */
export function tryCreateRoutePublicSupabase(): SupabaseClient | null {
  try {
    const env = getPublicSupabaseEnv();
    if (!env) {
      logMissingPublicSupabaseEnv('tryCreateRoutePublicSupabase');
      return null;
    }
    return createClient(env.url, env.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (e) {
    warn('route public client', e);
    return null;
  }
}

/** Service role — server only. Never import from client components. */
export function tryCreateAdminSupabase(): SupabaseClient | null {
  try {
    const env = getServiceRoleEnv();
    if (!env) {
      logMissingPublicSupabaseEnv('tryCreateAdminSupabase');
      logMissingServiceRoleEnv('tryCreateAdminSupabase');
      return null;
    }
    return createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (e) {
    warn('admin client', e);
    return null;
  }
}
