/**
 * Browser / route-public / admin factories — safe to import from client bundles.
 * For cookie server client use `@/lib/supabase/server` (imports `safeClient.server.ts` only).
 */

export {
  isSupabasePublicReady,
  tryCreateBrowserSupabase,
  tryCreateRoutePublicSupabase,
  tryCreateAdminSupabase,
} from './safeClient.shared';

export { isSupabasePublicReady as isSupabaseConfigured } from './safeClient.shared';

export { tryCreateBrowserSupabase as createSupabaseBrowserClient } from './safeClient.shared';
export { tryCreateRoutePublicSupabase as createSupabaseRoutePublicClient } from './safeClient.shared';
export { tryCreateAdminSupabase as createSupabaseAdminClient } from './safeClient.shared';

import { isSupabasePublicReady } from './safeClient.shared';

export function isSupabaseEnvReadyForSession(): boolean {
  return isSupabasePublicReady();
}

/** @deprecated Use isSupabasePublicReady */
export const hasSupabaseEnv = isSupabasePublicReady;
