'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { addProspect, promoteProspectToPipeline, type ProspectType } from '@/lib/titan/lead-radar';
import { executeProspectOutreach, generateOutreach } from '@/lib/titan/outreach-os';
import { upsertMarketingSpend } from '@/lib/titan/ad-os';
import { recordContentPost } from '@/lib/titan/content-engine';
import { buildCommandPlan, executeCommandPlan, saveCommandPlan } from '@/lib/titan/command-layer';
import { discoverPlacesProspects } from '@/lib/titan/places-discovery';
import { monthKeyChicago } from '@/lib/chicago-time';

async function requireSuperAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || session.profile?.role !== 'super_admin' || !admin) return null;
  return { session, admin };
}

function revalidateTitan() {
  revalidatePath('/admin/super');
}

export async function previewProspectOutreachAction(prospectId: string) {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const { data } = await gate.admin.from('titan_prospects').select('*').eq('id', prospectId).maybeSingle();
  if (!data) return { error: 'Prospect not found' };

  const r = data as Record<string, unknown>;
  const pkg = generateOutreach({
    id: String(r.id),
    companyName: String(r.company_name),
    prospectType: String(r.prospect_type) as ProspectType,
    contactName: r.contact_name ? String(r.contact_name) : null,
    contactRole: r.contact_role ? String(r.contact_role) : null,
    email: r.email ? String(r.email) : null,
    phone: r.phone ? String(r.phone) : null,
    address: r.address ? String(r.address) : null,
    distanceMiles: r.distance_miles != null ? Number(r.distance_miles) : null,
    estimatedMonthlyCents: Number(r.estimated_monthly_cents ?? 0),
    vehicleCount: r.vehicle_count != null ? Number(r.vehicle_count) : null,
    score: Number(r.score ?? 0),
    scoreReason: r.score_reason ? String(r.score_reason) : null,
    status: String(r.status),
    source: String(r.source),
    leadId: r.lead_id ? String(r.lead_id) : null,
  });

  return { ok: true as const, outreach: pkg };
}

export async function contactProspectAction(
  prospectId: string,
  channel: 'email' | 'sms' | 'call' | 'visit',
): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await executeProspectOutreach(gate.admin, prospectId, channel);
  revalidateTitan();
  if (!result.ok) return { error: result.error ?? 'Outreach failed' };
  return { ok: true };
}

export async function addProspectToPipelineAction(prospectId: string): Promise<{ ok?: boolean; error?: string; leadId?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await promoteProspectToPipeline(gate.admin, prospectId);
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true, leadId: result.leadId };
}

export async function addProspectAction(input: {
  companyName: string;
  prospectType: ProspectType;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: string;
  distanceMiles?: number;
  vehicleCount?: number;
}): Promise<{ ok?: boolean; error?: string; id?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await addProspect(gate.admin, input);
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true, id: result.id };
}

export async function saveMarketingSpendAction(channel: string, spendCents: number): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  try {
    await upsertMarketingSpend(gate.admin, channel, monthKeyChicago(), spendCents);
    revalidateTitan();
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Save failed' };
  }
}

export async function logContentPostAction(input: {
  platform: string;
  title: string;
  hook?: string;
  views?: number;
  leadsCount?: number;
  bookingsCount?: number;
  revenueCents?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  try {
    await recordContentPost(gate.admin, input);
    revalidateTitan();
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Log failed' };
  }
}

export async function generateCommandPlanAction(prompt: string) {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const plan = await buildCommandPlan(gate.admin, prompt.trim() || 'Get me 5 new customers');
  const saved = await saveCommandPlan(gate.admin, plan, gate.session.user!.id);
  if (!saved.ok) return { error: saved.error };

  return { ok: true as const, plan: { ...plan, id: saved.planId } };
}

export async function executeCommandPlanAction(planId: string): Promise<{ ok?: boolean; error?: string; log?: string[] }> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await executeCommandPlan(gate.admin, planId);
  revalidateTitan();
  if (!result.ok) return { error: result.error };
  return { ok: true, log: result.log };
}

export async function runPlacesDiscoveryAction(): Promise<{
  ok?: boolean;
  error?: string;
  discovered?: number;
  newCount?: number;
  potentialMonthlyCents?: number;
}> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const result = await discoverPlacesProspects(gate.admin);
  revalidateTitan();
  if (result.error && result.skipped) return { error: result.error };
  return {
    ok: true,
    discovered: result.discovered,
    newCount: result.newCount,
    potentialMonthlyCents: result.potentialMonthlyCents,
    error: result.error,
  };
}

export async function runTitanNightlyNowAction(): Promise<{
  ok?: boolean;
  error?: string;
  skipped?: boolean;
  revenueLeakCents?: number;
  opportunitiesQueued?: number;
  placesDiscovered?: number;
}> {
  const gate = await requireSuperAdmin();
  if (!gate) return { error: 'Unauthorized' };

  try {
    const { runTitanNightlyEngine } = await import('@/lib/titan');
    const result = await runTitanNightlyEngine(gate.admin);
    revalidateTitan();
    revalidatePath('/admin/titan');
    if ('skipped' in result && result.skipped) {
      return { error: 'Apply Titan migrations before running nightly engine.', skipped: true };
    }
    return {
      ok: true,
      revenueLeakCents: result.revenueLeakCents,
      opportunitiesQueued: result.opportunitiesQueued,
      placesDiscovered: result.placesDiscovered,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Nightly engine failed' };
  }
}
