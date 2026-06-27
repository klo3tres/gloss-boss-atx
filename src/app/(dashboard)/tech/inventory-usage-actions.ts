'use server';

import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { applyInventoryUsage, loadSuggestedSupplies } from '@/lib/titan/inventory-usage';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function loadWorkOrderSuppliesAction(appointmentId: string) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized', lines: [] };
  const res = await loadSuggestedSupplies(g.admin, appointmentId);
  return { lines: res.lines, tablesReady: res.tablesReady };
}

export async function recordInventoryUsageAction(input: {
  appointmentId: string;
  lines: Array<{ inventoryItemId: string; quantity: number }>;
  skipReason?: string;
}): Promise<{ ok?: boolean; error?: string; lowStock?: string[] }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await applyInventoryUsage(g.admin, input);
  if (!res.ok) return { error: res.error };
  return { ok: true, lowStock: res.lowStock };
}
