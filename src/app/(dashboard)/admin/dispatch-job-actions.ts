'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { recordAssignmentEvent } from '@/lib/assignment-events';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user) {
    return { ok: false as const, error: 'Unauthorized' };
  }
  if (!isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false as const, error: 'Forbidden' };
  }
  const admin = tryCreateAdminSupabase();
  return { ok: true as const, supabase: admin ?? supabase, userId: session.user.id };
}

export async function assignAppointmentTechnicianAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const technicianId = String(formData.get('technicianId') ?? '').trim();
  if (!appointmentId || !technicianId) return { ok: false as const, error: 'Appointment and technician required' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const { data: prevRow } = await gate.supabase
    .from('appointments')
    .select('assigned_technician_id, status')
    .eq('id', appointmentId)
    .maybeSingle();
  const prev = prevRow as { assigned_technician_id?: string | null; status?: string } | null;
  const prevTech = prev?.assigned_technician_id ?? null;
  const prevStatus = prev?.status ?? '';
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    assigned_technician_id: technicianId,
    assigned_by: gate.userId,
    assigned_at: nowIso,
    updated_at: nowIso,
  };
  if (prevStatus === 'deposit_paid' || prevStatus === 'confirmed') {
    patch.status = 'assigned';
  }

  const { error } = await gate.supabase.from('appointments').update(patch).eq('id', appointmentId);
  if (error) return { ok: false as const, error: error.message };

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'appointment',
    entityId: appointmentId,
    action: prevTech && prevTech !== technicianId ? 'reassign' : 'assign',
    technicianId,
    previousTechnicianId: prevTech,
    actorId: gate.userId,
  });
  if (ev.error) console.warn('[dispatch-job] assignment_events', ev.error);

  revalidatePath('/admin/dispatch');
  revalidatePath('/tech');
  return { ok: true as const };
}

export async function unassignAppointmentTechnicianAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  if (!appointmentId) return { ok: false as const, error: 'Missing appointment' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const { data: prevRow } = await gate.supabase
    .from('appointments')
    .select('assigned_technician_id, status')
    .eq('id', appointmentId)
    .maybeSingle();
  const prevTech = (prevRow as { assigned_technician_id?: string | null; status?: string } | null)?.assigned_technician_id ?? null;
  const prevStatus = (prevRow as { status?: string } | null)?.status ?? '';
  const nowIso = new Date().toISOString();

  const patch: Record<string, unknown> = {
    assigned_technician_id: null,
    assigned_by: null,
    assigned_at: null,
    updated_at: nowIso,
  };
  if (prevStatus === 'assigned') {
    patch.status = 'confirmed';
  }

  const { error } = await gate.supabase.from('appointments').update(patch).eq('id', appointmentId);
  if (error) return { ok: false as const, error: error.message };

  const ev = await recordAssignmentEvent(gate.supabase, {
    entityType: 'appointment',
    entityId: appointmentId,
    action: 'unassign',
    technicianId: null,
    previousTechnicianId: prevTech,
    actorId: gate.userId,
  });
  if (ev.error) console.warn('[dispatch-job] assignment_events', ev.error);

  revalidatePath('/admin/dispatch');
  revalidatePath('/tech');
  return { ok: true as const };
}

const DISPATCH_STATUSES = new Set(['deposit_paid', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled']);

export async function updateAppointmentDispatchStatusAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const status = String(formData.get('status') ?? '').trim();
  if (!appointmentId || !DISPATCH_STATUSES.has(status)) return { ok: false as const, error: 'Invalid status' };

  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false as const, error: gate.error };

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: nowIso };

  const { data: timeRow } = await gate.supabase
    .from('appointments')
    .select('job_started_at, job_completed_at')
    .eq('id', appointmentId)
    .maybeSingle();
  const times = timeRow as { job_started_at?: string | null; job_completed_at?: string | null } | null;

  if (status === 'in_progress' && !times?.job_started_at) {
    patch.job_started_at = nowIso;
  }
  if (status === 'completed' && !times?.job_completed_at) {
    patch.job_completed_at = nowIso;
  }

  const { error } = await gate.supabase.from('appointments').update(patch).eq('id', appointmentId);
  if (error) return { ok: false as const, error: error.message };

  revalidatePath('/admin/dispatch');
  revalidatePath('/tech');
  revalidatePath('/dashboard');
  return { ok: true as const };
}
