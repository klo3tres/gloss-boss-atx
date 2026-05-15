'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';

async function requireTechSupabase() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user) {
    return { ok: false as const, supabase: null, userId: null };
  }
  return { ok: true as const, supabase, userId: session.user.id };
}

export async function techStartJobAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  if (!appointmentId) return;

  const gate = await requireTechSupabase();
  if (!gate.ok) return;

  const { data: appt, error: fetchErr } = await gate.supabase
    .from('appointments')
    .select('id, assigned_technician_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchErr || !appt || appt.assigned_technician_id !== gate.userId) {
    console.warn('[tech] start job denied', appointmentId, fetchErr?.message);
    return;
  }

  if (appt.status === 'in_progress') {
    return;
  }

  if (!['assigned', 'confirmed'].includes(appt.status)) {
    console.warn('[tech] start job invalid status', appt.status);
    return;
  }

  const { error } = await gate.supabase
    .from('appointments')
    .update({
      status: 'in_progress',
      job_started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId);

  if (error) console.error('[tech] start job', error.message);
  revalidatePath('/tech');
}

export async function techCompleteJobAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  if (!appointmentId) return;

  const gate = await requireTechSupabase();
  if (!gate.ok) return;

  const { data: appt, error: fetchErr } = await gate.supabase
    .from('appointments')
    .select('id, assigned_technician_id, status')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchErr || !appt || appt.assigned_technician_id !== gate.userId) {
    console.warn('[tech] complete job denied', appointmentId);
    return;
  }

  const { data: sig } = await gate.supabase.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();

  if (!sig) {
    console.warn('[tech] complete blocked — no signed agreement', appointmentId);
    return;
  }

  const { error } = await gate.supabase
    .from('appointments')
    .update({
      status: 'completed',
      job_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId);

  if (error) console.error('[tech] complete job', error.message);
  revalidatePath('/tech');
}
