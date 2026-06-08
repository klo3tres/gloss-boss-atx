'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { OWNER_LOGIN_EMAIL, parseAppRole } from '@/lib/auth/role-resolution';
import { recordAssignmentEvent } from '@/lib/assignment-events';

async function requireTechnicianSupabase() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user) {
    return { ok: false as const, supabase: null, userId: null };
  }
  let role = parseAppRole(session.profile?.role ?? null);
  if (!session.profile?.role) {
    const em = (session.user.email ?? '').trim().toLowerCase();
    if (em === OWNER_LOGIN_EMAIL) role = 'super_admin';
  }
  if (role !== 'technician') {
    return { ok: false as const, supabase: null, userId: null };
  }
  return { ok: true as const, supabase, userId: session.user.id };
}

export async function techClaimLeadAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '').trim();
  if (!leadId) return;

  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) return;

  const nowIso = new Date().toISOString();
  const { error } = await gate.supabase
    .from('leads')
    .update({
      assigned_technician_id: gate.userId,
      assigned_to: gate.userId,
      assigned_at: nowIso,
      claimed_at: nowIso,
      assigned_by: gate.userId,
      status: 'claimed',
      in_pool: false,
      updated_at: nowIso,
    })
    .eq('id', leadId);

  if (error) {
    console.warn('[tech] claim lead', error.message);
    return;
  }

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'lead',
    entityId: leadId,
    action: 'claim',
    technicianId: gate.userId,
    previousTechnicianId: null,
    actorId: gate.userId,
  });
  if (ev.error) console.warn('[tech] assignment_events', ev.error);

  revalidatePath('/tech');
  revalidatePath('/admin/leads');
}

const TECH_LEAD_STATUSES = new Set(['contacted', 'quoted', 'no_response', 'lost']);

export async function techUpdateLeadStatusAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!leadId || !TECH_LEAD_STATUSES.has(status)) return;

  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) return;

  const { data: row } = await gate.supabase.from('leads').select('assigned_technician_id').eq('id', leadId).maybeSingle();
  const assigned = (row as { assigned_technician_id?: string | null } | null)?.assigned_technician_id;
  if (assigned !== gate.userId) return;

  const { error } = await gate.supabase
    .from('leads')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', leadId);

  if (error) {
    console.warn('[tech] update lead status', error.message);
    return;
  }

  revalidatePath('/tech');
  revalidatePath('/admin/leads');
}

export async function techUpdateLeadNotesAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!leadId) return;

  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) return;

  const { data: row } = await gate.supabase.from('leads').select('assigned_technician_id').eq('id', leadId).maybeSingle();
  const assigned = (row as { assigned_technician_id?: string | null } | null)?.assigned_technician_id;
  if (assigned !== gate.userId) return;

  const { error } = await gate.supabase
    .from('leads')
    .update({ notes: notes || null, updated_at: new Date().toISOString() })
    .eq('id', leadId);

  if (error) {
    console.warn('[tech] update lead notes', error.message);
    return;
  }

  revalidatePath('/tech');
  revalidatePath('/admin/leads');
}

export async function techArchiveOwnLeadAction(formData: FormData): Promise<void> {
  const leadId = String(formData.get('leadId') ?? '').trim();
  if (!leadId) return;
  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) return;
  const { data: row } = await gate.supabase.from('leads').select('assigned_technician_id, status').eq('id', leadId).maybeSingle();
  const lead = (row ?? {}) as Record<string, unknown>;
  if (lead.assigned_technician_id !== gate.userId) return;
  if (String(lead.status ?? '').toLowerCase() === 'booked') return;
  const { error } = await gate.supabase
    .from('leads')
    .update({ archived: true, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) console.warn('[tech] archive lead', error.message);
  revalidatePath('/tech');
  revalidatePath('/admin/leads');
}

export async function techCreateFieldLeadAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) {
    return { ok: false, error: 'Unauthorized' };
  }

  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();

  if (!name) {
    return { ok: false, error: 'Customer name is required' };
  }

  const { error } = await gate.supabase.from('leads').insert({
    name,
    phone: phone || null,
    email: email || null,
    notes: notes || null,
    status: 'new',
    assigned_technician_id: gate.userId,
    assigned_to: gate.userId,
    assigned_at: new Date().toISOString(),
    in_pool: false,
  });

  if (error) {
    console.error('[tech] create field lead error', error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath('/tech');
  return { ok: true };
}

export async function techSubmitSupplyRequestAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) {
    return { ok: false, error: 'Unauthorized' };
  }

  const items = String(formData.get('items') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();

  if (!items) {
    return { ok: false, error: 'Please specify the items requested' };
  }

  const { error } = await gate.supabase.from('business_expenses').insert({
    category: 'supply_request',
    amount_cents: 0,
    notes: `Supply Request by tech: ${items}. Notes: ${notes}`,
    created_by: gate.userId,
    incurred_at: new Date().toISOString(),
  });

  if (error) {
    console.error('[tech] supply request error', error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath('/tech');
  return { ok: true };
}

export async function techLogMileageAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const gate = await requireTechnicianSupabase();
  if (!gate.ok || !gate.supabase || !gate.userId) {
    return { ok: false, error: 'Unauthorized' };
  }

  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const startMileage = Number(formData.get('startMileage') ?? 0);
  const endMileage = Number(formData.get('endMileage') ?? 0);
  const gasCost = Number(formData.get('gasCost') ?? 0);
  const notes = String(formData.get('notes') ?? '').trim();

  if (startMileage <= 0) {
    return { ok: false, error: 'Starting mileage must be positive' };
  }

  const totalMiles = endMileage > startMileage ? endMileage - startMileage : 0;
  const gasCostCents = Math.round(gasCost * 100);

  const { error } = await gate.supabase.from('job_mileage_logs').insert({
    appointment_id: appointmentId || null,
    start_mileage: startMileage,
    end_mileage: endMileage || null,
    total_miles: totalMiles || null,
    gas_cost_cents: gasCostCents || null,
    notes: notes || null,
    created_by: gate.userId,
  });

  if (error) {
    console.error('[tech] mileage log error', error.message);
    return { ok: false, error: error.message };
  }

  revalidatePath('/tech');
  return { ok: true };
}
