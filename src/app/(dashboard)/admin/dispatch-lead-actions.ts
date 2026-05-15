'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { recordAssignmentEvent } from '@/lib/assignment-events';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user) {
    return { ok: false as const, error: 'Unauthorized' };
  }
  if (!isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, supabase, userId: session.user.id };
}

export async function assignLeadTechnicianAction(formData: FormData) {
  const leadId = String(formData.get('leadId') ?? '').trim();
  const technicianId = String(formData.get('technicianId') ?? '').trim();
  if (!leadId || !technicianId) return { ok: false, error: 'Lead and technician required' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: prevRow } = await gate.supabase.from('leads').select('assigned_technician_id').eq('id', leadId).maybeSingle();
  const prevTech = (prevRow as { assigned_technician_id?: string | null } | null)?.assigned_technician_id ?? null;
  const nowIso = new Date().toISOString();

  const { error } = await gate.supabase
    .from('leads')
    .update({
      assigned_technician_id: technicianId,
      assigned_to: technicianId,
      assigned_by: gate.userId,
      assigned_at: nowIso,
      claimed_at: null,
      in_pool: false,
      status: 'assigned',
      updated_at: nowIso,
    })
    .eq('id', leadId);

  if (error) return { ok: false, error: error.message };

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'lead',
    entityId: leadId,
    action: prevTech && prevTech !== technicianId ? 'reassign' : 'assign',
    technicianId,
    previousTechnicianId: prevTech,
    actorId: gate.userId,
  });
  if (ev.error) console.warn('[dispatch] assignment_events', ev.error);

  revalidatePath('/admin/leads');
  revalidatePath('/tech');
  return { ok: true as const };
}

export async function unassignLeadAction(formData: FormData) {
  const leadId = String(formData.get('leadId') ?? '').trim();
  if (!leadId) return { ok: false, error: 'Missing lead' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: prevRow } = await gate.supabase.from('leads').select('assigned_technician_id').eq('id', leadId).maybeSingle();
  const prevTech = (prevRow as { assigned_technician_id?: string | null } | null)?.assigned_technician_id ?? null;
  const nowIso = new Date().toISOString();

  const { error } = await gate.supabase
    .from('leads')
    .update({
      assigned_technician_id: null,
      assigned_to: null,
      assigned_by: null,
      assigned_at: null,
      claimed_at: null,
      status: 'new',
      in_pool: true,
      updated_at: nowIso,
    })
    .eq('id', leadId);

  if (error) return { ok: false, error: error.message };

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'lead',
    entityId: leadId,
    action: 'unassign',
    technicianId: null,
    previousTechnicianId: prevTech,
    actorId: gate.userId,
  });
  if (ev.error) console.warn('[dispatch] assignment_events', ev.error);

  revalidatePath('/admin/leads');
  revalidatePath('/tech');
  return { ok: true as const };
}

export async function setLeadPoolAction(formData: FormData) {
  const leadId = String(formData.get('leadId') ?? '').trim();
  const inPool = formData.get('inPool') === 'true';
  if (!leadId) return { ok: false, error: 'Missing lead' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const patch: Record<string, unknown> = {
    in_pool: inPool,
    updated_at: new Date().toISOString(),
  };
  if (inPool) {
    patch.assigned_technician_id = null;
    patch.assigned_to = null;
    patch.assigned_by = null;
    patch.assigned_at = null;
    patch.claimed_at = null;
    patch.status = 'new';
  }

  const { error } = await gate.supabase.from('leads').update(patch).eq('id', leadId);
  if (error) return { ok: false, error: error.message };

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'lead',
    entityId: leadId,
    action: inPool ? 'pool_on' : 'pool_off',
    technicianId: null,
    previousTechnicianId: null,
    actorId: gate.userId,
    meta: { in_pool: inPool },
  });
  if (ev.error) console.warn('[dispatch] assignment_events', ev.error);

  revalidatePath('/admin/leads');
  revalidatePath('/tech');
  return { ok: true as const };
}

export async function convertLeadToCustomerAction(formData: FormData) {
  const leadId = String(formData.get('leadId') ?? '').trim();
  if (!leadId) return { ok: false, error: 'Missing lead' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: lead, error: lErr } = await gate.supabase.from('leads').select('*').eq('id', leadId).maybeSingle();
  if (lErr || !lead) return { ok: false, error: lErr?.message ?? 'Lead not found' };

  const L = lead as Record<string, unknown>;
  const email = typeof L.email === 'string' ? L.email.trim().toLowerCase() : '';
  if (!email) return { ok: false, error: 'Lead must have an email to convert' };

  const phone = typeof L.phone === 'string' ? L.phone.replace(/\D/g, '').slice(0, 15) : null;
  const name = typeof L.name === 'string' ? L.name.trim() : 'Customer';

  let customerId: string | null = null;
  const { data: existing } = await gate.supabase.from('customers').select('id').eq('email', email).maybeSingle();
  if (existing?.id) {
    customerId = existing.id;
    await gate.supabase
      .from('customers')
      .update({
        phone: phone || undefined,
        full_name: name,
      })
      .eq('id', customerId);
  } else {
    const ins = await gate.supabase
      .from('customers')
      .insert({ email, phone: phone || null, full_name: name })
      .select('id')
      .single();
    if (ins.error || !ins.data) return { ok: false, error: ins.error?.message ?? 'Could not create customer' };
    customerId = ins.data.id as string;
  }

  const nowIso = new Date().toISOString();
  const { error: uErr } = await gate.supabase
    .from('leads')
    .update({
      customer_id: customerId,
      status: 'booked',
      updated_at: nowIso,
    })
    .eq('id', leadId);

  if (uErr) return { ok: false, error: uErr.message };

  await recordAssignmentEvent(gate.supabase, {
    entityType: 'lead',
    entityId: leadId,
    action: 'convert',
    technicianId: null,
    previousTechnicianId: null,
    actorId: gate.userId,
    meta: { customer_id: customerId },
  });

  revalidatePath('/admin/leads');
  revalidatePath('/admin/customers');
  return { ok: true as const, customerId };
}

export async function updateLeadStatusAction(formData: FormData) {
  const leadId = String(formData.get('leadId') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  const allowed = new Set(['new', 'assigned', 'claimed', 'contacted', 'quoted', 'booked', 'lost']);
  if (!leadId || !allowed.has(status)) return { ok: false, error: 'Invalid' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await gate.supabase.from('leads').update({ status, updated_at: new Date().toISOString() }).eq('id', leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/leads');
  revalidatePath('/tech');
  return { ok: true as const };
}

export async function updateLeadNotesAction(formData: FormData) {
  const leadId = String(formData.get('leadId') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!leadId) return { ok: false, error: 'Missing lead' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { error } = await gate.supabase
    .from('leads')
    .update({ notes: notes || null, updated_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/leads');
  revalidatePath('/tech');
  return { ok: true as const };
}

export async function incrementLeadContactAttemptsAction(formData: FormData) {
  const leadId = String(formData.get('leadId') ?? '').trim();
  if (!leadId) return { ok: false, error: 'Missing lead' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const { data: row } = await gate.supabase.from('leads').select('contact_attempts').eq('id', leadId).maybeSingle();
  const n = typeof (row as { contact_attempts?: number } | null)?.contact_attempts === 'number' ? (row as { contact_attempts: number }).contact_attempts : 0;
  const { error } = await gate.supabase
    .from('leads')
    .update({
      contact_attempts: n + 1,
      last_contacted_at: new Date().toISOString(),
      status: 'contacted',
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/leads');
  revalidatePath('/tech');
  return { ok: true as const };
}
