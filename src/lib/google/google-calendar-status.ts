/** Plain-English Google Calendar sync status helpers (safe for client + server). */

export function humanizeGoogleSyncError(raw: string | null | undefined): string {
  if (!raw?.trim()) return 'Google sync failed — try reconnecting Google Calendar.';
  const lower = raw.toLowerCase();
  if (lower.includes('not configured')) return 'Google Calendar is not configured on this site yet.';
  if (lower.includes('no google calendar connection')) return 'Connect Google Calendar to sync events.';
  if (lower.includes('could not refresh') || lower.includes('refresh google token')) {
    return 'Google sign-in expired — reconnect Google Calendar.';
  }
  if (lower.includes('401') || lower.includes('403') || lower.includes('invalid_grant')) {
    return 'Google denied access — reconnect Google Calendar.';
  }
  if (lower.includes('429')) return 'Google rate limit reached — wait a few minutes and try again.';
  if (lower.includes('list failed')) return 'Could not read Google Calendar — check your connection.';
  return raw.length > 140 ? `${raw.slice(0, 137)}…` : raw;
}

export function minutesSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.floor(ms / 60_000));
}

export function formatGoogleSyncAge(iso: string | null | undefined): string {
  const mins = minutesSince(iso);
  if (mins == null) return 'Never';
  if (mins < 1) return 'Updated just now';
  if (mins === 1) return 'Last updated 1 minute ago';
  if (mins < 60) return `Last updated ${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return 'Last updated 1 hour ago';
  if (hours < 24) return `Last updated ${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Last updated 1 day ago' : `Last updated ${days} days ago`;
}

export type GoogleSyncStripState = {
  connected: boolean;
  checking?: boolean;
  lastPullAt?: string | null;
  lastError?: string | null;
  accountEmail?: string | null;
  justPulled?: boolean;
};

export function googleSyncStripMessage(state: GoogleSyncStripState): string {
  if (state.checking) return 'Checking Google Calendar…';
  if (!state.connected) return 'Google Calendar disconnected';
  if (state.lastError) return `Google sync failed: ${humanizeGoogleSyncError(state.lastError)}`;
  if (state.justPulled) return 'Updated just now';
  return formatGoogleSyncAge(state.lastPullAt);
}
