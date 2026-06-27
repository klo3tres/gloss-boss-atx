'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { saveTitanWorkspace, type TitanIndustry, type TitanWorkspace } from '@/lib/titan/workspace';
import { logTitanActivity } from '@/lib/titan/activity-feed';

async function requireSuperAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !['admin', 'super_admin'].includes(session.profile?.role ?? '') || !admin) return null;
  return { admin };
}

export async function saveTitanWorkspaceAction(input: Partial<TitanWorkspace> & { industry?: TitanIndustry }) {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await saveTitanWorkspace(gate.admin, input);
  if (!result.ok) return { error: result.error };

  await logTitanActivity(gate.admin, {
    kind: 'command_executed',
    title: 'Workspace DNA updated',
    detail: `${result.workspace.businessName} · ${result.workspace.industry.replace(/_/g, ' ')} · ${result.workspace.serviceRadiusMiles}mi radius`,
    href: '/admin/super',
  });

  revalidatePath('/admin/super');
  revalidatePath('/admin/titan');
  revalidatePath('/admin/titan/settings');
  return { ok: true as const };
}
