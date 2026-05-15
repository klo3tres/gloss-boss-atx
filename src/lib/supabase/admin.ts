import { createSupabaseAdminClient, tryCreateAdminSupabase } from './safeClient';

export { createSupabaseAdminClient };

export function tryCreateSupabaseAdminClient() {
  return tryCreateAdminSupabase();
}
