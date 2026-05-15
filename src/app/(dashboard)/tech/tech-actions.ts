'use server';

import { revalidatePath } from 'next/cache';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { notifyJobCompletedPlaceholder, notifyJobStartedPlaceholder } from '@/lib/notifications-placeholder';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
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
    .select('id, assigned_technician_id, status, guest_phone, guest_email, guest_name, service_slug, scheduled_start')
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

  if (error) {
    console.error('[tech] start job', error.message);
    return;
  }

  await recordJobTimelineEvent(gate.supabase, {
    appointmentId,
    eventType: 'job_started',
    meta: {},
    createdBy: gate.userId,
  });

  void notifyJobStartedPlaceholder(appt.guest_phone != null ? String(appt.guest_phone) : null, appointmentId, {
    guestEmail: appt.guest_email != null ? String(appt.guest_email) : null,
    guestName: appt.guest_name != null ? String(appt.guest_name) : null,
    serviceLabel: String(appt.service_slug ?? '').replace(/-/g, ' ') || 'Mobile detailing',
    scheduledIso: appt.scheduled_start != null ? String(appt.scheduled_start) : undefined,
  });
  revalidatePath('/tech');
}

export async function techCompleteJobAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  if (!appointmentId) return { error: 'Missing job reference.' };

  const gate = await requireTechSupabase();
  if (!gate.ok) return { error: 'Session unavailable.' };

  const { data: appt, error: fetchErr } = await gate.supabase
    .from('appointments')
    .select('id, assigned_technician_id, status, guest_phone, guest_email, guest_name, service_slug')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchErr || !appt || appt.assigned_technician_id !== gate.userId) {
    console.warn('[tech] complete job denied', appointmentId);
    return { error: 'You cannot complete this job.' };
  }

  const { data: sig } = await gate.supabase.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();

  if (!sig) {
    return {
      error:
        'Liability acknowledgment is required — have the customer sign the agreement (or complete `/agreement`) before marking complete.',
    };
  }

  const { data: intake } = await gate.supabase.from('intake_submissions').select('id').eq('appointment_id', appointmentId).maybeSingle();
  if (!intake) {
    const { data: apptIntake } = await gate.supabase
      .from('appointments')
      .select('intake_completed_at')
      .eq('id', appointmentId)
      .maybeSingle();
    if (!apptIntake?.intake_completed_at) {
      return { error: 'Customer intake must be submitted before marking this job complete.' };
    }
  }

  const { error } = await gate.supabase
    .from('appointments')
    .update({
      status: 'completed',
      job_completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId);

  if (error) {
    console.error('[tech] complete job', error.message);
    return { error: error.message || 'Could not update job status.' };
  }

  const vis = await gate.supabase
    .from('job_media')
    .update({ visible_to_customer: true })
    .eq('appointment_id', appointmentId)
    .eq('category', 'after');
  if (vis.error && isSchemaDriftError(vis.error.message)) {
    const slim = await gate.supabase.from('job_media').update({ visible_to_customer: true }).eq('appointment_id', appointmentId);
    if (slim.error) console.warn('[tech] reveal after photos', slim.error.message);
  } else if (vis.error) {
    console.warn('[tech] reveal after photos', vis.error.message);
  }

  await recordJobTimelineEvent(gate.supabase, {
    appointmentId,
    eventType: 'job_completed',
    meta: {},
    createdBy: gate.userId,
  });

  void notifyJobCompletedPlaceholder(appt.guest_phone != null ? String(appt.guest_phone) : null, appointmentId, {
    guestEmail: appt.guest_email != null ? String(appt.guest_email) : null,
    guestName: appt.guest_name != null ? String(appt.guest_name) : null,
    serviceLabel: String(appt.service_slug ?? '').replace(/-/g, ' ') || 'Mobile detailing',
  });

  revalidatePath('/tech');
  return null;
}

export async function techSaveJobNotesAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  if (!appointmentId) return;

  const gate = await requireTechSupabase();
  if (!gate.ok) return;

  const { data: appt, error: fetchErr } = await gate.supabase
    .from('appointments')
    .select('id, assigned_technician_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchErr || !appt || appt.assigned_technician_id !== gate.userId) return;

  const { error } = await gate.supabase
    .from('appointments')
    .update({ notes: notes || null, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

  if (error) console.warn('[tech] save notes', error.message);
  revalidatePath('/tech');
}

/** Log checklist progress to the job timeline (does not persist checkbox state server-side). */
export async function techSaveChecklistSnapshotAction(appointmentId: string, itemsJson: string) {
  const apptId = String(appointmentId ?? '').trim();
  if (!apptId) return;

  const gate = await requireTechSupabase();
  if (!gate.ok) return;

  const { data: appt, error: fetchErr } = await gate.supabase
    .from('appointments')
    .select('id, assigned_technician_id')
    .eq('id', apptId)
    .maybeSingle();

  if (fetchErr || !appt || appt.assigned_technician_id !== gate.userId) return;

  let items: string[] = [];
  try {
    const parsed = JSON.parse(itemsJson) as unknown;
    if (Array.isArray(parsed)) items = parsed.map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 40);
  } catch {
    return;
  }

  await recordJobTimelineEvent(gate.supabase, {
    appointmentId: apptId,
    eventType: 'checklist_saved',
    meta: { items },
    createdBy: gate.userId,
  });
  revalidatePath('/tech');
}

function timelineCategory(cat: string): 'photo_before' | 'photo_after' | 'photo_inspection' | 'photo_damage' {
  if (cat === 'before') return 'photo_before';
  if (cat === 'after') return 'photo_after';
  if (cat === 'damage') return 'photo_damage';
  return 'photo_inspection';
}

export async function techAddJobMediaAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const category = String(formData.get('category') ?? 'other').trim();
  const fileUrl = String(formData.get('fileUrl') ?? '').trim();
  if (!appointmentId || !fileUrl) return;

  const allowed = new Set(['inspection', 'before', 'after', 'damage', 'other']);
  const cat = allowed.has(category) ? category : 'other';

  const gate = await requireTechSupabase();
  if (!gate.ok) return;

  const { data: appt, error: fetchErr } = await gate.supabase
    .from('appointments')
    .select('id, assigned_technician_id')
    .eq('id', appointmentId)
    .maybeSingle();

  if (fetchErr || !appt || appt.assigned_technician_id !== gate.userId) return;

  const insertRow: Record<string, unknown> = {
    appointment_id: appointmentId,
    uploaded_by: gate.userId,
    category: cat,
    file_url: fileUrl,
    visible_to_customer: cat === 'after' ? false : false,
  };

  let ins = await gate.supabase.from('job_media').insert(insertRow);
  if (ins.error && isSchemaDriftError(ins.error.message)) {
    ins = await gate.supabase
      .from('job_media')
      .insert({
        appointment_id: appointmentId,
        uploaded_by: gate.userId,
        category: cat,
        file_url: fileUrl,
      });
  }

  if (ins.error) {
    console.warn('[tech] job_media insert', ins.error.message);
    return;
  }

  const ev = cat === 'other' ? 'photo_inspection' : timelineCategory(cat);
  await recordJobTimelineEvent(gate.supabase, {
    appointmentId,
    eventType: ev,
    meta: { category: cat, file_url: fileUrl },
    createdBy: gate.userId,
  });

  revalidatePath('/tech');
}
