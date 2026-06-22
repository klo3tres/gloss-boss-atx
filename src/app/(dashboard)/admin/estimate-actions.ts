'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { getAppOrigin } from '@/lib/env/app-origin';
import {
  approveEstimateByToken,
  createEstimateForLead,
  declineEstimateByToken,
  estimatePublicUrl,
  loadEstimatesForLead,
  sendEstimateToCustomer,
  startEstimateDepositCheckout,
} from '@/lib/service-estimates';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireStaff() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { session, admin };
}

function revalidateEstimatePaths() {
  revalidatePath('/admin/leads');
  revalidatePath('/admin/customers');
}

export async function createLeadEstimateAction(input: {
  leadId: string;
  serviceSlug: string;
  totalCents: number;
  depositCents?: number;
  notes?: string;
}): Promise<{ ok?: boolean; error?: string; estimateId?: string; publicUrl?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };

  const result = await createEstimateForLead(gate.admin, gate.session.user!.id, {
    leadId: input.leadId,
    serviceSlug: input.serviceSlug,
    totalCents: input.totalCents,
    depositCents: input.depositCents,
    notes: input.notes,
  });

  if (!result.ok || !result.estimate) return { error: result.error ?? 'Failed to create estimate' };
  revalidateEstimatePaths();
  return {
    ok: true,
    estimateId: result.estimate.id,
    publicUrl: estimatePublicUrl(result.estimate.accessToken),
  };
}

export async function sendLeadEstimateAction(estimateId: string): Promise<{ ok?: boolean; error?: string; publicUrl?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };

  const result = await sendEstimateToCustomer(gate.admin, estimateId, getAppOrigin());
  if (!result.ok) return { error: result.error };
  revalidateEstimatePaths();
  return { ok: true, publicUrl: result.estimate ? estimatePublicUrl(result.estimate.accessToken) : undefined };
}

export async function loadLeadEstimatesAction(leadId: string) {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized', estimates: [] as Awaited<ReturnType<typeof loadEstimatesForLead>> };
  const estimates = await loadEstimatesForLead(gate.admin, leadId);
  return { estimates };
}

export async function approveEstimatePublicAction(token: string) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Unavailable' };
  const result = await approveEstimateByToken(admin, token);
  if (!result.ok) return { error: result.error };
  return { ok: true, status: result.estimate?.status };
}

export async function declineEstimatePublicAction(token: string) {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Unavailable' };
  const result = await declineEstimateByToken(admin, token);
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export async function payEstimateDepositAction(token: string): Promise<{ ok?: boolean; error?: string; url?: string }> {
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Unavailable' };
  const result = await startEstimateDepositCheckout(admin, token, getAppOrigin());
  if (!result.ok) return { error: result.error };
  return { ok: true, url: result.url };
}
