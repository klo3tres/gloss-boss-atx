'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import {
  runFollowUpEngine,
  sendFollowUpNow,
  skipFollowUp,
  snoozeFollowUp,
  updateFollowUpTierEnabled,
  type FollowUpTier,
} from '@/lib/follow-up-engine';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireStaffAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { session, admin };
}

function revalidateFollowUpPaths() {
  revalidatePath('/admin/follow-ups');
  revalidatePath('/admin/exceptions');
  revalidatePath('/admin/customers');
}

export async function syncFollowUpsNowAction(): Promise<{
  ok?: boolean;
  error?: string;
  enqueued?: number;
  sent?: number;
  skipped?: number;
  failed?: number;
}> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  try {
    const result = await runFollowUpEngine(gate.admin);
    revalidateFollowUpPaths();
    if ('tablesMissing' in result) return { error: 'Apply migration 000086 before using the follow-up engine.' };
    return {
      ok: true,
      enqueued: result.enqueued,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sync failed' };
  }
}

export async function sendFollowUpNowAction(followUpId: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  const result = await sendFollowUpNow(gate.admin, followUpId);
  revalidateFollowUpPaths();
  if (!result.ok) return { error: result.error ?? 'Send failed' };
  return { ok: true };
}

export async function snoozeFollowUpAction(
  followUpId: string,
  days: 7 | 30 | 60,
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  await snoozeFollowUp(gate.admin, followUpId, days);
  revalidateFollowUpPaths();
  return { ok: true };
}

export async function skipFollowUpAction(followUpId: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  await skipFollowUp(gate.admin, followUpId);
  revalidateFollowUpPaths();
  return { ok: true };
}

export async function toggleFollowUpTierAction(
  tier: FollowUpTier,
  enabled: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  await updateFollowUpTierEnabled(gate.admin, tier, enabled);
  revalidateFollowUpPaths();
  return { ok: true };
}
