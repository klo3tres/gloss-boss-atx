'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { completeExperiment, createExperiment } from '@/lib/titan/engines/experiment';
import { markMissionAction } from '@/lib/titan/engines/daily-autonomy';
import { recordMissionOutcome } from '@/lib/titan/engines/outcome-tracking';
import { scheduleDefaultCadence } from '@/lib/titan/engines/touch-schedule';
import { advanceCloseout } from '@/lib/titan/engines/job-closeout';
import { saveTitanWorkspace } from '@/lib/titan/workspace';
import type { ActionOutcome } from '@/lib/titan/engines/action-outcomes';
import type { TitanIndustry } from '@/lib/titan/workspace';
import {
  runPlacesDiscoveryAction,
  runTitanNightlyNowAction,
} from '@/app/(dashboard)/admin/super/titan-growth-actions';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { session, admin };
}

function revalidate() {
  revalidatePath('/admin/titan');
  revalidatePath('/admin/super');
}

export async function runAcquisitionHuntAction() {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const discovery = await runPlacesDiscoveryAction();
  const nightly = await runTitanNightlyNowAction();
  revalidate();
  return {
    ok: true,
    discoveryError: discovery.error,
    discovered: discovery.discovered,
    nightlyError: nightly.error,
  };
}

export async function createExperimentAction(input: {
  hypothesis: string;
  actionsPlanned: string;
  expectedRevenueCents: number;
  testLengthDays?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await createExperiment(g.admin, input);
  revalidate();
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function completeExperimentAction(
  id: string,
  result: 'pass' | 'fail' | 'inconclusive',
  notes?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await completeExperiment(g.admin, id, result, notes);
  revalidate();
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function markMissionActionComplete(
  actionId: string,
  status: 'completed' | 'skipped',
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await markMissionAction(g.admin, actionId, status);
  revalidate();
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function recordOutcomeAction(
  actionId: string,
  outcome: ActionOutcome,
  notes?: string,
  revenueCents?: number,
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await recordMissionOutcome(g.admin, actionId, outcome, notes, revenueCents);
  revalidate();
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function scheduleCadenceAction(
  missionActionId: string,
  label: string,
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await scheduleDefaultCadence(g.admin, { missionActionId, label, smsTemplate: '' });
  revalidate();
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function advanceCloseoutAction(
  closeoutId: string,
  step: 'review' | 'referral' | 'discount' | 'follow_up',
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await advanceCloseout(g.admin, closeoutId, step);
  revalidate();
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function toggleDemoModeAction(enabled: boolean): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await saveTitanWorkspace(g.admin, { demoMode: enabled });
  revalidate();
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function saveOnboardingStepAction(input: {
  step: number;
  businessName?: string;
  industry?: TitanIndustry;
  serviceRadiusMiles?: number;
  monthlyRevenueGoalCents?: number;
  employeeCount?: number;
  complete?: boolean;
}): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await saveTitanWorkspace(g.admin, {
    onboardingStep: input.step,
    businessName: input.businessName,
    industry: input.industry,
    serviceRadiusMiles: input.serviceRadiusMiles,
    monthlyRevenueGoalCents: input.monthlyRevenueGoalCents,
    employeeCount: input.employeeCount,
    onboardingCompletedAt: input.complete ? new Date().toISOString() : undefined,
  });
  revalidate();
  revalidatePath('/admin/titan/onboarding');
  if (!res.ok) return { error: res.error };
  return { ok: true };
}
