const TEST_HINTS = ['test@test', '@test.', 'test booking', 'test job', 'qa@test', 'demo@test'];

export function isTestLikeJob(row: {
  guest_email?: string | null;
  guest_name?: string | null;
  guest_phone?: string | null;
  notes?: string | null;
  service_slug?: string | null;
}): boolean {
  const email = String(row.guest_email ?? '').toLowerCase();
  const name = String(row.guest_name ?? '').toLowerCase();
  const phone = String(row.guest_phone ?? '').replace(/\D/g, '');
  const notes = String(row.notes ?? '').toLowerCase();
  if (email.includes('test@') || email.endsWith('@test.com')) return true;
  if (name === 'test' || name.startsWith('test ')) return true;
  if (phone === '5555555555' || phone === '5125550100') return true;
  if (notes.includes('test job') || notes.includes('qa test')) return true;
  for (const h of TEST_HINTS) {
    if (email.includes(h) || name.includes(h)) return true;
  }
  return false;
}

export function isArchivedOrDeletedRow(row: Record<string, unknown>): boolean {
  if (row.archived === true) return true;
  if (row.status === 'archived' || row.status === 'deleted' || row.status === 'cancelled' || row.status === 'completed') {
    return row.status === 'archived' || row.status === 'deleted';
  }
  if (row.archived_at != null && String(row.archived_at).trim()) return true;
  if (row.deleted_at != null && String(row.deleted_at).trim()) return true;
  return false;
}

export function isActiveFieldStatus(status: string): boolean {
  return ['assigned', 'confirmed', 'in_progress'].includes(status);
}

/** Open timers older than 24h are stale — do not drive active job UI. */
export function isStaleTimerStart(startedAt: string | null | undefined): boolean {
  if (!startedAt) return false;
  const t = new Date(startedAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > 24 * 60 * 60 * 1000;
}

export function isRealTimerId(id: string | null | undefined): boolean {
  const s = String(id ?? '').trim();
  if (!s) return false;
  return !s.startsWith('workflow-') && !s.startsWith('fallback-');
}
