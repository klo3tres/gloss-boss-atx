'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { saveTitanWorkspace } from '@/lib/titan/workspace';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function saveTitanProductSettingsAction(input: {
  publicWidgetEnabled?: boolean;
  operatorAssistantEnabled?: boolean;
  poweredByBrandingEnabled?: boolean;
}) {
  const gate = await requireAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await saveTitanWorkspace(gate.admin, input);
  if (!result.ok) return { error: result.error };

  revalidatePath('/admin/titan');
  revalidatePath('/admin/titan/settings');
  revalidatePath('/admin/super');
  return { ok: true as const };
}
