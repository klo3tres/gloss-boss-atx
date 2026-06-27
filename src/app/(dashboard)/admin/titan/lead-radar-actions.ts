'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  bulkImportLeadText,
  captureLeadRadarItem,
  convertLeadToOpportunity,
  runGooglePlacesLeadDiscovery,
  scheduleLeadRadarFollowUp,
  updateLeadRadarStatus,
  type LeadRadarStatus,
} from '@/lib/titan/lead-radar-engine';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

function revalidate() {
  revalidatePath('/admin/titan');
  revalidatePath('/admin/titan/lead-radar');
  revalidatePath('/admin/titan/opportunities');
}

export async function captureLeadAction(input: {
  sourceType: string;
  sourceName?: string;
  sourceUrl?: string;
  authorName?: string;
  authorProfileUrl?: string;
  contactName?: string;
  phone?: string;
  email?: string;
  locationText?: string;
  rawText: string;
  estimatedRevenue?: number;
  notes?: string;
}) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await captureLeadRadarItem(g.admin, input);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true, id: res.id };
}

export async function bulkImportLeadsAction(rawBlock: string, sourceType = 'manual') {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await bulkImportLeadText(g.admin, rawBlock, sourceType);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true, imported: res.imported };
}

export async function markLeadStatusAction(id: string, status: LeadRadarStatus, notes?: string) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await updateLeadRadarStatus(g.admin, id, status, notes);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function scheduleLeadFollowUpAction(
  id: string,
  preset: 'tomorrow' | '2days' | '3days' | '1week' | 'custom',
  customIso?: string,
) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const base = new Date();
  base.setHours(10, 0, 0, 0);
  if (preset === 'tomorrow') base.setDate(base.getDate() + 1);
  else if (preset === '2days') base.setDate(base.getDate() + 2);
  else if (preset === '3days') base.setDate(base.getDate() + 3);
  else if (preset === '1week') base.setDate(base.getDate() + 7);
  else if (preset === 'custom' && customIso) {
    const d = new Date(customIso);
    if (Number.isNaN(d.getTime())) return { error: 'Invalid date.' };
    base.setTime(d.getTime());
  } else return { error: 'Pick a custom date.' };

  const res = await scheduleLeadRadarFollowUp(g.admin, id, base.toISOString());
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function convertLeadToOpportunityAction(id: string) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await convertLeadToOpportunity(g.admin, id);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true, opportunityId: res.opportunityId };
}

export async function runGooglePlacesLeadRadarAction() {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await runGooglePlacesLeadDiscovery(g.admin);
  if (!res.configured) return { error: res.error, configured: false };
  if (!res.ok) return { error: res.error ?? res.lastApiError, configured: true };
  revalidate();
  return { ok: true, created: res.created, configured: true };
}

export async function toggleDailyHuntTaskAction(taskKey: string, completed: boolean) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const { toggleDailyHuntTask } = await import('@/lib/titan/lead-radar-hunt');
  const res = await toggleDailyHuntTask(g.admin, taskKey, completed);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function analyzeCompetitorReviewsAction(input: {
  competitorName: string;
  reviewText: string;
  sourceUrl?: string;
  notes?: string;
}) {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const { saveCompetitorInsight } = await import('@/lib/titan/competitor-review-analysis');
  const res = await saveCompetitorInsight(g.admin, input);
  if (!res.ok) {
    if (res.analysis) return { ok: true, analysis: res.analysis, warning: res.error };
    return { error: res.error };
  }
  revalidate();
  return { ok: true, analysis: res.analysis };
}

export async function captureFromPlaybookAction(input: {
  sourceType: string;
  sourceName: string;
  rawText: string;
  estimatedRevenue?: number;
}) {
  return captureLeadAction({
    sourceType: input.sourceType,
    sourceName: input.sourceName,
    rawText: input.rawText,
    estimatedRevenue: input.estimatedRevenue,
    notes: 'Captured from hunt playbook',
  });
}
