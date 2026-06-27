'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  createRevenueOpportunity,
  scheduleOpportunityFollowUp,
  seedWarmLeads,
  syncDerivedRevenueOpportunities,
  updateOpportunityStatus,
  type RevenueOpportunityStatus,
} from '@/lib/titan/revenue-opportunities';

async function gate() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) return null;
  return { admin };
}

function revalidate() {
  revalidatePath('/admin/titan');
  revalidatePath('/admin/titan/opportunities');
}

export async function createOpportunityAction(input: {
  title: string;
  opportunityType: string;
  estimatedRevenueDollars: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  socialUrl?: string;
  notes?: string;
  recommendedAction?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  if (!input.title.trim()) return { error: 'Title is required.' };

  const res = await createRevenueOpportunity(g.admin, {
    title: input.title.trim(),
    opportunityType: input.opportunityType,
    estimatedRevenueCents: Math.round(Number(input.estimatedRevenueDollars) * 100) || 0,
    contactName: input.contactName?.trim(),
    contactPhone: input.contactPhone?.trim(),
    contactEmail: input.contactEmail?.trim(),
    socialUrl: input.socialUrl?.trim(),
    notes: input.notes?.trim(),
    recommendedAction: input.recommendedAction?.trim(),
  });

  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function markOpportunityStatusAction(
  id: string,
  status: RevenueOpportunityStatus,
  notes?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await updateOpportunityStatus(g.admin, id, status, notes);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function scheduleFollowUpAction(
  id: string,
  preset: 'tomorrow' | '2days' | '3days' | '1week' | 'custom',
  customIso?: string,
): Promise<{ ok?: boolean; error?: string }> {
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
  } else if (preset === 'custom') return { error: 'Pick a custom date.' };

  const res = await scheduleOpportunityFollowUp(g.admin, id, base.toISOString());
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}

export async function seedWarmLeadsAction(): Promise<{ ok?: boolean; inserted?: number; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await seedWarmLeads(g.admin);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true, inserted: res.inserted };
}

export async function syncDerivedOpportunitiesAction(): Promise<{ ok?: boolean; created?: number; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const created = await syncDerivedRevenueOpportunities(g.admin);
  revalidate();
  return { ok: true, created };
}
