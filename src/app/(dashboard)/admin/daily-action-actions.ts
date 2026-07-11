'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import { logTitanActivity } from '@/lib/titan/activity-feed';
import { sendReviewRequest } from '@/lib/review-request-send';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { session, admin };
}

export async function dismissDailyActionAction(actionId: string): Promise<ActionResult> {
  const g = await gate();
  if (!g) return actionErr('Not authorized.');
  const now = new Date().toISOString();
  const { data } = await g.admin.from('titan_daily_actions').select('title').eq('id', actionId).maybeSingle();
  const { error } = await g.admin
    .from('titan_daily_actions')
    .update({ status: 'dismissed', dismissed_at: now, updated_at: now })
    .eq('id', actionId);
  if (error) return actionErr(error.message);
  await logTitanActivity(g.admin, {
    kind: 'daily_action_dismissed',
    title: `Dismissed: ${String((data as { title?: string })?.title ?? 'action')}`,
    detail: 'Owner dismissed a Titan daily action.',
    href: '/admin',
  });
  revalidatePath('/admin');
  return actionOk('Action dismissed.');
}

export async function markDailyActionSentAction(
  actionId: string,
  channel: 'sms' | 'email' | 'review',
): Promise<ActionResult> {
  const g = await gate();
  if (!g) return actionErr('Not authorized.');
  const { data: row } = await g.admin.from('titan_daily_actions').select('*').eq('id', actionId).maybeSingle();
  if (!row) return actionErr('Action not found.');
  const r = row as Record<string, unknown>;
  if (channel === 'review' && r.entity_type === 'appointment' && r.entity_id) {
    await sendReviewRequest(g.admin, String(r.entity_id));
    await g.admin
      .from('titan_job_closeouts')
      .update({ review_requested_at: new Date().toISOString(), status: 'review_sent' })
      .eq('appointment_id', String(r.entity_id));
  }
  const now = new Date().toISOString();
  await g.admin
    .from('titan_daily_actions')
    .update({ status: 'sent', sent_at: now, updated_at: now })
    .eq('id', actionId);
  await logTitanActivity(g.admin, {
    kind: 'daily_action_sent',
    title: `Sent: ${String(r.title)}`,
    detail: `${channel} · ${String(r.involved_names ?? '')}`,
    href: '/admin',
  });
  revalidatePath('/admin');
  return actionOk('Action logged as sent.');
}

export async function regenerateDailyActionPlanAction(): Promise<ActionResult> {
  const g = await gate();
  if (!g) return actionErr('Not authorized.');
  const { buildDailyActionPlan } = await import('@/lib/titan/daily-action-plan');
  const plan = await buildDailyActionPlan(g.admin);
  revalidatePath('/admin');
  revalidatePath('/admin/titan');
  return actionOk(`Refreshed ${plan.actions.length} action(s).`);
}
