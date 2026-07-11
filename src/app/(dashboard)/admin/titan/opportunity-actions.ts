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
  updateOpportunityContact,
  updateOpportunityStatus,
  type RevenueOpportunityStatus,
} from '@/lib/titan/revenue-opportunities';
import { sendCustomerSms } from '@/lib/sms-send';
import { twilioConfigured } from '@/lib/email-send';
import { twilioSendMode } from '@/lib/twilio-config';

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
): Promise<{ ok?: boolean; error?: string; projectId?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await updateOpportunityStatus(g.admin, id, status, notes);
  if (!res.ok) return { error: res.error };

  if (status === 'booked') {
    const { createProjectFromBookedOpportunity } = await import('@/lib/titan/won-opportunity-project');
    const project = await createProjectFromBookedOpportunity(g.admin, id);
    revalidate();
    revalidatePath('/titan/projects');
    return { ok: true, projectId: project.projectId };
  }

  revalidate();
  return { ok: true };
}

export async function logOpportunityCallAction(
  opportunityId: string,
  outcome?: string,
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };

  const { data: opp } = await g.admin.from('titan_opportunities').select('contact_phone, author_name, status').eq('id', opportunityId).maybeSingle();
  if (!opp) return { error: 'Opportunity not found' };
  const row = opp as Record<string, unknown>;
  const phone = String(row.contact_phone ?? '').trim();
  const note = outcome?.trim() || (phone ? `Outbound call to ${phone}` : 'Outbound call logged');

  await g.admin.from('titan_opportunity_events').insert({
    opportunity_id: opportunityId,
    event_type: 'call',
    notes: note,
    workspace_key: 'default',
  });

  if (String(row.status) === 'new') {
    await updateOpportunityStatus(g.admin, opportunityId, 'contacted', 'Call logged');
  } else {
    await g.admin
      .from('titan_opportunities')
      .update({ last_touched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', opportunityId);
  }

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

export async function sendOpportunitySmsAction(
  opportunityId: string,
  message?: string,
): Promise<{ ok?: boolean; error?: string; copied?: boolean }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };

  const { data: opp } = await g.admin.from('titan_opportunities').select('*').eq('id', opportunityId).maybeSingle();
  if (!opp) return { error: 'Opportunity not found' };
  const row = opp as Record<string, unknown>;
  const phone = String(row.contact_phone ?? '').trim();
  const body = String(message ?? row.recommended_message ?? '').trim();
  if (!phone) return { error: 'No phone number on this opportunity.' };
  if (!body) return { error: 'No message to send.' };

  if (!twilioConfigured()) {
    return { ok: false, error: 'Twilio not configured — copy the message instead.', copied: true };
  }

  const sent = await sendCustomerSms({
    db: g.admin,
    kind: 'opportunity_outreach',
    to: phone,
    body,
    requireConsent: false,
    template_key: 'opportunity_sms',
    extraPayload: { opportunity_id: opportunityId, send_mode: twilioSendMode() },
  });

  if (!sent.ok) {
    const trialHint = process.env.TWILIO_ACCOUNT_SID?.startsWith('AC') && !process.env.TWILIO_MESSAGING_SERVICE_SID
      ? ' Twilio trial only sends to verified numbers.'
      : '';
    return { error: (sent.error ?? 'SMS failed') + trialHint };
  }

  await updateOpportunityStatus(g.admin, opportunityId, 'contacted', 'SMS sent from Opportunity Board');
  revalidate();
  return { ok: true };
}

export async function seedOpportunityAction(id: string): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const now = new Date().toISOString();
  const { error } = await g.admin
    .from('titan_opportunities')
    .update({ status: 'seeded', seeded_at: now, last_touched_at: now, updated_at: now })
    .eq('id', id);
  if (error) return { error: error.message };
  const { logTitanActivity } = await import('@/lib/titan/activity-feed');
  await g.admin.from('titan_opportunity_events').insert({
    opportunity_id: id,
    event_type: 'seeded',
    notes: 'Marked as seeded warm lead',
    workspace_key: 'default',
  });
  await logTitanActivity(g.admin, { kind: 'opportunity_queued', title: 'Opportunity seeded', detail: id, href: '/admin/titan/opportunities' });
  revalidate();
  return { ok: true };
}

export async function snoozeOpportunityAction(id: string, days = 60): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const until = new Date();
  until.setDate(until.getDate() + days);
  const { error } = await g.admin
    .from('titan_opportunities')
    .update({
      status: 'snoozed',
      snoozed_until: until.toISOString(),
      next_follow_up_at: until.toISOString(),
      last_touched_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (error) return { error: error.message };
  await g.admin.from('titan_opportunity_events').insert({
    opportunity_id: id,
    event_type: 'snoozed',
    notes: `Snoozed ${days} days`,
    workspace_key: 'default',
  });
  revalidate();
  return { ok: true };
}

export async function addOpportunityNoteAction(id: string, note: string): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  if (!note.trim()) return { error: 'Note is empty.' };
  const { data: row } = await g.admin.from('titan_opportunities').select('notes').eq('id', id).maybeSingle();
  const existing = row?.notes ? String(row.notes) : '';
  const merged = existing ? `${existing}\n\n[${new Date().toLocaleString()}] ${note.trim()}` : note.trim();
  const { error } = await g.admin
    .from('titan_opportunities')
    .update({ notes: merged, last_touched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  await g.admin.from('titan_opportunity_events').insert({
    opportunity_id: id,
    event_type: 'note',
    notes: note.trim(),
    workspace_key: 'default',
  });
  const { logTitanActivity } = await import('@/lib/titan/activity-feed');
  await logTitanActivity(g.admin, { kind: 'command_executed', title: 'Opportunity note added', detail: note.slice(0, 120), href: '/admin/titan/opportunities' });
  revalidate();
  return { ok: true };
}

export async function updateOpportunityContactAction(
  id: string,
  contact: { contactName?: string; contactPhone?: string; contactEmail?: string },
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const res = await updateOpportunityContact(g.admin, id, contact);
  if (!res.ok) return { error: res.error };
  revalidate();
  return { ok: true };
}
