import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Optional explicit catalog seed (e.g. run from a future admin tool).
 * Public `/api/services` no longer auto-seeds — use Supabase migrations instead.
 */
export async function ensureDefaultCatalog(_admin: SupabaseClient): Promise<{ seeded: boolean; error?: string }> {
  return { seeded: false, error: 'Catalog seeding is disabled in app code. Apply migrations in Supabase.' };
}
