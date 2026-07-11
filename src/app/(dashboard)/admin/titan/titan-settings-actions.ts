'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { saveTitanWorkspace } from '@/lib/titan/workspace';
import { runTrackedAutomation } from '@/lib/titan/automation-run';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function runTitanAutomationNowAction(jobKey: 'titan_nightly' | 'process_follow_ups' | 'sync_exceptions') {
  const gate = await requireAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const tracked = await runTrackedAutomation(gate.admin, jobKey, 'manual', async () => {
    if (jobKey === 'titan_nightly') {
      const { runTitanNightlyEngine } = await import('@/lib/titan');
      return runTitanNightlyEngine(gate.admin);
    }
    if (jobKey === 'sync_exceptions') {
      const { syncOperationsExceptions } = await import('@/lib/operations-snapshot');
      return syncOperationsExceptions(gate.admin);
    }
    const { runFollowUpEngine } = await import('@/lib/follow-up-engine');
    const { processDueScheduledMessages, processAppointmentReminders } = await import('@/lib/customer-notification-cadence');
    const { processOpportunityFollowUps } = await import('@/lib/opportunity-follow-up-cron');
    const [followUps, scheduled, reminders, opportunityFollowUps] = await Promise.all([
      runFollowUpEngine(gate.admin), processDueScheduledMessages(gate.admin), processAppointmentReminders(gate.admin), processOpportunityFollowUps(gate.admin),
    ]);
    return { followUps, scheduled, reminders, opportunityFollowUps };
  });
  revalidatePath('/admin/titan');
  revalidatePath('/admin/titan/settings');
  return tracked.ok ? { ok: true as const, durationMs: tracked.durationMs, result: tracked.result } : { error: tracked.error, alreadyRunning: tracked.alreadyRunning };
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
