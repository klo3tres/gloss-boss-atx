import type { SupabaseClient } from '@supabase/supabase-js';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

/** Single source of truth: FREE promo is on when the FREE row is enabled (not a separate site_settings gate). */
export async function isFreePromoEnabled(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin
    .from('promo_codes')
    .select('enabled, archived, archived_at, starts_at, ends_at')
    .eq('code', 'FREE')
    .maybeSingle();
  if (error || !data) return false;
  const row = data as Record<string, unknown>;
  if (row.archived === true || row.archived_at) return false;
  if (row.enabled !== true) return false;
  const now = Date.now();
  const starts = str(row.starts_at);
  const ends = str(row.ends_at);
  if (starts && Date.parse(starts) > now) return false;
  if (ends && Date.parse(ends) < now) return false;
  return true;
}
