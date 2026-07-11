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

async function logActionEvent(admin: NonNullable<Awaited<ReturnType<typeof gate>>>['admin'], input: {
  eventType: string; actionType: string; opportunityId: string; status?: string; metadata?: Record<string, unknown>;
}) {
  await admin.from('titan_action_events').insert({
    event_type: input.eventType, action_type: input.actionType, entity_type: 'opportunity', entity_id: input.opportunityId,
    opportunity_id: input.opportunityId, status: input.status ?? null, metadata: input.metadata ?? {},
  });
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
  await logActionEvent(g.admin, { eventType: status === 'booked' || status === 'won' ? 'booking_recorded' : 'status_changed', actionType: 'opportunity', opportunityId: id, status, metadata: { notes: notes ?? null } });

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
  await logActionEvent(g.admin, { eventType: 'call_initiated', actionType: 'opportunity_call', opportunityId, status: 'completed', metadata: { outcome: outcome ?? null, phone_present: Boolean(phone) } });

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
  await logActionEvent(g.admin, { eventType: 'follow_up_scheduled', actionType: 'opportunity_follow_up', opportunityId: id, status: 'scheduled', metadata: { scheduled_for: base.toISOString(), preset } });
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
  const { parseOpportunityNotePads, serializeOpportunityNotePads, newOpportunityNotePad } = await import(
    '@/lib/titan/opportunity-note-pads'
  );
  let merged: string;
  if (existing.trim().startsWith('{') && existing.includes('"pads"')) {
    const pads = parseOpportunityNotePads(existing);
    const general = pads.find((p) => p.label === 'General') ?? (pads.length < 8 ? newOpportunityNotePad('General') : null);
    if (general) {
      const stamp = `[${new Date().toLocaleString()}] ${note.trim()}`;
      general.body = general.body ? `${general.body}\n\n${stamp}` : stamp;
      general.updatedAt = new Date().toISOString();
      const next = pads.some((p) => p.id === general.id) ? pads.map((p) => (p.id === general.id ? general : p)) : [...pads, general];
      merged = serializeOpportunityNotePads(next.slice(0, 8));
    } else {
      merged = existing;
    }
  } else {
    merged = existing ? `${existing}\n\n[${new Date().toLocaleString()}] ${note.trim()}` : note.trim();
  }
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

export async function saveOpportunityNotePadsAction(
  id: string,
  pads: Array<{ id: string; label: string; body: string; updatedAt?: string }>,
): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  if (!id) return { error: 'Missing opportunity.' };
  if (pads.length > 8) return { error: 'Maximum 8 notes per opportunity.' };
  const { serializeOpportunityNotePads } = await import('@/lib/titan/opportunity-note-pads');
  const payload = serializeOpportunityNotePads(
    pads.map((p) => ({
      id: p.id,
      label: p.label || 'General',
      body: p.body ?? '',
      updatedAt: p.updatedAt || new Date().toISOString(),
    })),
  );
  const { error } = await g.admin
    .from('titan_opportunities')
    .update({ notes: payload, last_touched_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
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
  await logActionEvent(g.admin, { eventType: 'contact_updated', actionType: 'opportunity', opportunityId: id, status: 'completed', metadata: { has_phone: Boolean(contact.contactPhone), has_email: Boolean(contact.contactEmail) } });
  revalidate();
  return { ok: true };
}

export async function setOpportunityCadencePausedAction(id: string, paused: boolean): Promise<{ ok?: boolean; error?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const { error } = await g.admin.from('titan_opportunities').update({ follow_up_cadence_paused: paused, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: error.message };
  await logActionEvent(g.admin, { eventType: paused ? 'cadence_paused' : 'cadence_resumed', actionType: 'opportunity_follow_up', opportunityId: id, status: paused ? 'paused' : 'scheduled' });
  revalidate();
  return { ok: true };
}

export async function convertOpportunityToCustomerAction(id: string): Promise<{ ok?: boolean; error?: string; customerId?: string }> {
  const g = await gate();
  if (!g) return { error: 'Unauthorized' };
  const { data: raw } = await g.admin.from('titan_opportunities').select('author_name, contact_email, contact_phone, business_name, title').eq('id', id).maybeSingle();
  if (!raw) return { error: 'Opportunity not found.' };
  const row = raw as Record<string, unknown>;
  const email = String(row.contact_email ?? '').trim().toLowerCase();
  if (!email) return { error: 'Add an email before converting this opportunity to a customer.' };
  const name = String(row.author_name ?? row.business_name ?? row.title ?? 'Customer').trim();
  const phone = String(row.contact_phone ?? '').trim() || null;
  const existing = await g.admin.from('customers').select('id').ilike('email', email).maybeSingle();
  let customerId = existing.data?.id ? String(existing.data.id) : '';
  if (!customerId) {
    const inserted = await g.admin.from('customers').insert({ email, full_name: name, phone }).select('id').maybeSingle();
    if (inserted.error || !inserted.data?.id) return { error: inserted.error?.message ?? 'Could not create customer.' };
    customerId = String(inserted.data.id);
  }
  await updateOpportunityStatus(g.admin, id, 'won', `Converted to customer ${customerId}`);
  await logActionEvent(g.admin, { eventType: 'customer_created', actionType: 'opportunity_conversion', opportunityId: id, status: 'won', metadata: { customer_id: customerId } });
  revalidate();
  revalidatePath(`/admin/customers/${customerId}`);
  return { ok: true, customerId };
}
