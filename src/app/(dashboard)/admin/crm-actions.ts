'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';

const STATUSES = ['awaiting_payment', 'deposit_paid', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;

import { recordAssignmentEvent } from '@/lib/assignment-events';

async function requireAdminSupabase() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase) {
    return { ok: false as const, message: 'Supabase is not configured' };
  }
  if (!session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false as const, message: 'Unauthorized' };
  }
  return { ok: true as const, supabase, userId: session.user.id };
}

export async function updateAppointmentStatusAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!appointmentId || !STATUSES.includes(status as (typeof STATUSES)[number])) {
    return;
  }

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  if (status === 'completed') {
    const { data: sig } = await gate.supabase.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();
    if (!sig) {
      console.warn('[crm] Blocked completed status: no signed agreement for', appointmentId);
      return;
    }
  }

  const patch: Record<string, string> = {
    status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'completed') {
    patch.job_completed_at = new Date().toISOString();
  }

  const { error } = await gate.supabase.from('appointments').update(patch).eq('id', appointmentId);
  if (error) {
    console.error('[crm] updateAppointmentStatusAction', error.message);
    return;
  }
  revalidatePath('/admin');
  revalidatePath('/admin/customers');
}

export async function assignTechnicianAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const technicianIdRaw = formData.get('technicianId');
  const technicianId =
    technicianIdRaw === null || technicianIdRaw === '' || technicianIdRaw === '__none__' ? null : String(technicianIdRaw);

  if (!appointmentId) return;

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  const { data: current } = await gate.supabase
    .from('appointments')
    .select('status, assigned_technician_id')
    .eq('id', appointmentId)
    .maybeSingle();
  const cur = current as { status?: string; assigned_technician_id?: string | null } | null;
  const prevTech = cur?.assigned_technician_id ?? null;

  let nextStatus = current?.status ?? 'confirmed';
  if (technicianId) {
    if (current?.status !== 'awaiting_payment') {
      nextStatus = 'assigned';
    }
  } else if (current?.status === 'assigned') {
    nextStatus = 'confirmed';
  }

  const nowIso = new Date().toISOString();
  const { error } = await gate.supabase
    .from('appointments')
    .update({
      assigned_technician_id: technicianId,
      assigned_by: technicianId ? gate.userId : null,
      assigned_at: technicianId ? nowIso : null,
      status: nextStatus,
      updated_at: nowIso,
    })
    .eq('id', appointmentId);

  if (error) {
    console.error('[crm] assignTechnicianAction', error.message);
    return;
  }

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'appointment',
    entityId: appointmentId,
    action: technicianId ? (prevTech && prevTech !== technicianId ? 'reassign' : 'assign') : 'unassign',
    technicianId: technicianId,
    previousTechnicianId: prevTech,
    actorId: gate.userId,
  });
  if (ev.error) console.warn('[crm] assignment_events', ev.error);

  revalidatePath('/admin');
  revalidatePath('/admin/customers');
  revalidatePath('/tech');
}

export async function markMessageReadAction(formData: FormData) {
  const messageId = String(formData.get('messageId') ?? '').trim();
  if (!messageId) return;

  const gate = await requireAdminSupabase();
  if (!gate.ok) return;

  const { error } = await gate.supabase.from('messages').update({ status: 'read' }).eq('id', messageId);
  if (error) console.error('[crm] markMessageReadAction', error.message);
  revalidatePath('/admin');
  revalidatePath('/admin/messages');
}
