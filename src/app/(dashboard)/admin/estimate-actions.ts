'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes } from 'crypto';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { getAppOrigin } from '@/lib/env/app-origin';
import { displayMoney } from '@/lib/display-format';
import {
  approveEstimateByToken,
  buildEstimateEmailSubject,
  buildEstimateSmsBody,
  computeDepositCents,
  createEstimateForLead,
  declineEstimateByToken,
  estimatePublicUrl,
  loadEstimatesForLead,
  sendEstimateSmsToCustomer,
  sendEstimateSmsWithBody,
  sendEstimateEmailWithBody,
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
  vehicleClass?: string;
  totalCents: number;
  depositCents?: number;
  notes?: string;
}): Promise<{ ok?: boolean; error?: string; estimateId?: string; publicUrl?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };

  const result = await createEstimateForLead(gate.admin, gate.session.user!.id, {
    leadId: input.leadId,
    serviceSlug: input.serviceSlug,
    vehicleClass: input.vehicleClass,
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

export async function createContactEstimateAction(input: {
  customerId?: string;
  opportunityId?: string;
  contactName: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  serviceSlug: string;
  vehicleClass?: string;
  totalCents: number;
  notes?: string;
}): Promise<{ ok?: boolean; error?: string; estimateId?: string; publicUrl?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };
  const { createEstimateForContact } = await import('@/lib/service-estimates');
  const result = await createEstimateForContact(gate.admin, gate.session.user!.id, input);
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

export async function sendLeadEstimateSmsAction(estimateId: string): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };
  const result = await sendEstimateSmsToCustomer(gate.admin, estimateId, getAppOrigin());
  if (!result.ok) return { error: result.error };
  return { ok: true };
}

export async function sendLeadEstimateSmsWithBodyAction(
  estimateId: string,
  body: string,
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };
  const result = await sendEstimateSmsWithBody(gate.admin, estimateId, body, getAppOrigin());
  if (!result.ok) return { error: result.error };
  revalidateEstimatePaths();
  return { ok: true };
}

export async function sendLeadEstimateEmailWithBodyAction(
  estimateId: string,
  input: { subject?: string; body: string },
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };
  const result = await sendEstimateEmailWithBody(gate.admin, estimateId, input, getAppOrigin());
  if (!result.ok) return { error: result.error };
  revalidateEstimatePaths();
  return { ok: true };
}

export async function previewLeadEstimateAction(input: {
  leadId: string;
  serviceSlug: string;
  totalCents: number;
  vehicleClass?: string;
}): Promise<{ emailSubject?: string; emailBody?: string; smsBody?: string; publicPath?: string; error?: string }> {
  const gate = await requireStaff();
  if (!gate) return { error: 'Unauthorized' };
  const { data: lead } = await gate.admin.from('leads').select('*').eq('id', input.leadId).maybeSingle();
  if (!lead) return { error: 'Lead not found' };
  const L = lead as Record<string, unknown>;
  const token = randomBytes(16).toString('hex');
  const estimate = {
    id: 'preview',
    accessToken: token,
    customerName: String(L.name ?? 'Customer'),
    customerEmail: L.email ? String(L.email) : null,
    customerPhone: L.phone ? String(L.phone) : null,
    totalCents: input.totalCents,
    depositCents: computeDepositCents(input.totalCents),
    validUntil: new Date(Date.now() + 14 * 86400000).toISOString(),
  } as import('@/lib/service-estimates').ServiceEstimate;
  return {
    emailSubject: buildEstimateEmailSubject(estimate),
    emailBody: `Estimate total ${displayMoney(estimate.totalCents)} · deposit ${displayMoney(estimate.depositCents)} · ${estimatePublicUrl(token)}`,
    smsBody: buildEstimateSmsBody(estimate),
    publicPath: estimatePublicUrl(token),
  };
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
