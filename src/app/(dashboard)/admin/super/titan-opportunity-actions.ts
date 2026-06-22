'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  addOpportunity,
  promoteOpportunityToLead,
  updateOpportunityStatus,
  type OpportunityPlatform,
  type OpportunityType,
} from '@/lib/titan/opportunity-scanner';

async function requireSuperAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || session.profile?.role !== 'super_admin' || !admin) return null;
  return { session, admin };
}

function revalidateTitan() {
  revalidatePath('/admin/super');
}

export async function addOpportunityAction(input: {
  title: string;
  body?: string;
  sourcePlatform?: OpportunityPlatform;
  sourceLabel?: string;
  sourceUrl?: string;
  authorName?: string;
  postedAt?: string;
  commentsCount?: number;
  opportunityType?: OpportunityType;
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };
  if (!input.title?.trim()) return { error: 'Title required' };

  const result = await addOpportunity(gate.admin, input);
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true, id: result.id };
}

export async function markOpportunityContactedAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await updateOpportunityStatus(gate.admin, id, 'contacted');
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export async function markOpportunityRepliedAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await updateOpportunityStatus(gate.admin, id, 'replied');
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export async function addOpportunityToPipelineAction(id: string): Promise<{ ok?: boolean; error?: string; leadId?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await promoteOpportunityToLead(gate.admin, id);
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true, leadId: result.leadId };
}

export async function dismissOpportunityAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await updateOpportunityStatus(gate.admin, id, 'dismissed');
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export async function resolveOpportunityAction(
  id: string,
  outcome: 'won' | 'lost',
  lostReason?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await updateOpportunityStatus(gate.admin, id, outcome, { lostReason });
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true };
}
