import type { SupabaseClient } from '@supabase/supabase-js';

export type ScanProvider = 'google_places' | 'google_calendar' | 'openweather' | 'internal';
export type ScanFrequency = 'manual' | 'on_login' | 'twice_daily' | 'four_times_daily' | 'hourly';

export type ScanBudgetRow = {
  provider: ScanProvider;
  scanType: string;
  dailyLimit: number;
  usedToday: number;
  remaining: number;
  resetAt: string | null;
  lastScanAt: string | null;
  nextAllowedScanAt: string | null;
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function endOfUtcDay(d = new Date()) {
  const s = startOfUtcDay(d);
  return new Date(s.getTime() + 86400000);
}

function isTableMissing(msg: string) {
  return /titan_scan_budget|does not exist|schema cache/i.test(msg);
}

export async function getOrCreateScanBudget(
  admin: SupabaseClient,
  input: {
    workspaceKey?: string;
    provider: ScanProvider;
    scanType: string;
    dailyLimit?: number;
  },
): Promise<{ row: ScanBudgetRow | null; tablesReady: boolean }> {
  const ws = input.workspaceKey ?? 'default';
  const limit = Math.max(1, input.dailyLimit ?? 25);

  const { data: existing, error: fetchErr } = await admin
    .from('titan_scan_budget')
    .select('*')
    .eq('workspace_key', ws)
    .eq('provider', input.provider)
    .eq('scan_type', input.scanType)
    .maybeSingle();

  if (fetchErr && isTableMissing(fetchErr.message)) return { row: null, tablesReady: false };

  const now = new Date();
  let row = existing as Record<string, unknown> | null;

  if (!row) {
    const resetAt = endOfUtcDay(now).toISOString();
    const { data: inserted, error: insErr } = await admin
      .from('titan_scan_budget')
      .insert({
        workspace_key: ws,
        provider: input.provider,
        scan_type: input.scanType,
        daily_limit: limit,
        used_today: 0,
        reset_at: resetAt,
        updated_at: now.toISOString(),
      })
      .select('*')
      .single();
    if (insErr) return { row: null, tablesReady: !isTableMissing(insErr.message) };
    row = inserted as Record<string, unknown>;
  }

  const resetAt = str(row.reset_at);
  if (!resetAt || new Date(resetAt).getTime() <= now.getTime()) {
    const nextReset = endOfUtcDay(now).toISOString();
    await admin
      .from('titan_scan_budget')
      .update({ used_today: 0, reset_at: nextReset, updated_at: now.toISOString() })
      .eq('id', row.id);
    row.used_today = 0;
    row.reset_at = nextReset;
  }

  const dailyLimit = Number(row.daily_limit ?? limit);
  const usedToday = Number(row.used_today ?? 0);
  return {
    tablesReady: true,
    row: {
      provider: input.provider,
      scanType: input.scanType,
      dailyLimit,
      usedToday,
      remaining: Math.max(0, dailyLimit - usedToday),
      resetAt: str(row.reset_at) || null,
      lastScanAt: str(row.last_scan_at) || null,
      nextAllowedScanAt: str(row.next_allowed_scan_at) || null,
    },
  };
}

export async function canSpendScanCredits(
  admin: SupabaseClient,
  input: {
    workspaceKey?: string;
    provider: ScanProvider;
    scanType: string;
    estimatedRequests: number;
    dailyLimit?: number;
  },
): Promise<{ allowed: boolean; remaining: number; dailyLimit: number; message?: string; tablesReady: boolean }> {
  const { row, tablesReady } = await getOrCreateScanBudget(admin, input);
  if (!tablesReady || !row) {
    return { allowed: true, remaining: 999, dailyLimit: input.dailyLimit ?? 25, tablesReady: false };
  }
  if (row.nextAllowedScanAt && new Date(row.nextAllowedScanAt).getTime() > Date.now()) {
    return {
      allowed: false,
      remaining: row.remaining,
      dailyLimit: row.dailyLimit,
      message: `Next scan allowed at ${new Date(row.nextAllowedScanAt).toLocaleString()}.`,
      tablesReady: true,
    };
  }
  if (row.remaining < input.estimatedRequests) {
    return {
      allowed: false,
      remaining: row.remaining,
      dailyLimit: row.dailyLimit,
      message: `You have ${row.remaining} of ${row.dailyLimit} ${input.provider} scan credits left today.`,
      tablesReady: true,
    };
  }
  return { allowed: true, remaining: row.remaining, dailyLimit: row.dailyLimit, tablesReady: true };
}

export async function consumeScanCredits(
  admin: SupabaseClient,
  input: {
    workspaceKey?: string;
    provider: ScanProvider;
    scanType: string;
    requestsUsed: number;
    dailyLimit?: number;
    cooldownMinutes?: number;
  },
): Promise<void> {
  const ws = input.workspaceKey ?? 'default';
  const { row } = await getOrCreateScanBudget(admin, input);
  if (!row) return;

  const now = new Date();
  const nextAllowed = input.cooldownMinutes
    ? new Date(now.getTime() + input.cooldownMinutes * 60_000).toISOString()
    : null;

  const { data: current } = await admin
    .from('titan_scan_budget')
    .select('id, used_today')
    .eq('workspace_key', ws)
    .eq('provider', input.provider)
    .eq('scan_type', input.scanType)
    .maybeSingle();

  if (!current) return;
  const used = Number((current as { used_today?: number }).used_today ?? 0) + input.requestsUsed;

  await admin
    .from('titan_scan_budget')
    .update({
      used_today: used,
      last_scan_at: now.toISOString(),
      next_allowed_scan_at: nextAllowed,
      updated_at: now.toISOString(),
    })
    .eq('id', (current as { id: string }).id);

  await admin
    .from('titan_workspace_settings')
    .update({
      last_lead_radar_scan_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('workspace_key', ws);
}

export function frequencyLabel(freq: ScanFrequency): string {
  const map: Record<ScanFrequency, string> = {
    manual: 'Manual only',
    on_login: 'On admin login (if older than 6h)',
    twice_daily: 'Twice daily',
    four_times_daily: 'Four times daily',
    hourly: 'Hourly (high usage)',
  };
  return map[freq] ?? freq;
}

export function shouldAutoScanOnLogin(lastScanAt: string | null, frequency: ScanFrequency): boolean {
  if (frequency === 'manual') return false;
  if (!lastScanAt) return true;
  const ageMs = Date.now() - new Date(lastScanAt).getTime();
  if (frequency === 'on_login') return ageMs >= 6 * 60 * 60 * 1000;
  if (frequency === 'twice_daily') return ageMs >= 12 * 60 * 60 * 1000;
  if (frequency === 'four_times_daily') return ageMs >= 6 * 60 * 60 * 1000;
  if (frequency === 'hourly') return ageMs >= 60 * 60 * 1000;
  return false;
}

export function cronScanIntervalHours(frequency: ScanFrequency): number | null {
  if (frequency === 'manual' || frequency === 'on_login') return null;
  if (frequency === 'twice_daily') return 12;
  if (frequency === 'four_times_daily') return 6;
  if (frequency === 'hourly') return 1;
  return null;
}

/** Estimated Places API calls per Lead Radar discovery run */
export const LEAD_RADAR_ESTIMATED_REQUESTS = 12;
