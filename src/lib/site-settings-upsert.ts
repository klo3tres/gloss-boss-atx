import type { SupabaseClient } from '@supabase/supabase-js';

export type SiteSettingsUpsertResult = {
  ok: boolean;
  error?: string;
  usedFallback?: boolean;
};

const SCHEMA_DRIFT = /updated_at|column|schema cache|Could not find/i;

/**
 * Upsert site_settings key/value. Tries with updated_at first; retries without if column missing in cache.
 */
export async function upsertSiteSetting(
  client: SupabaseClient,
  row: { key: string; value: string },
): Promise<SiteSettingsUpsertResult> {
  const withTs = { ...row, updated_at: new Date().toISOString() };
  let { error } = await client.from('site_settings').upsert(withTs, { onConflict: 'key' });

  if (error && SCHEMA_DRIFT.test(error.message)) {
    ({ error } = await client.from('site_settings').upsert(row, { onConflict: 'key' }));
    if (!error) return { ok: true, usedFallback: true };
  }

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function upsertSiteSettingsBatch(
  client: SupabaseClient,
  rows: { key: string; value: string }[],
): Promise<SiteSettingsUpsertResult> {
  const withTs = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  let { error } = await client.from('site_settings').upsert(withTs, { onConflict: 'key' });

  if (error && SCHEMA_DRIFT.test(error.message)) {
    ({ error } = await client.from('site_settings').upsert(rows, { onConflict: 'key' }));
    if (!error) return { ok: true, usedFallback: true };
  }

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
