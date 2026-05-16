'use server';

import { revalidatePath } from 'next/cache';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { notifyJobCompletedPlaceholder, notifyJobStartedPlaceholder } from '@/lib/notifications-placeholder';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireTechSupabase() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user) {
    return { ok: false as const, supabase: null, userId: null };
  }
  return { ok: true as const, supabase, userId: session.user.id };
}

async function writeNotificationOutbox(
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  row: Record<string, unknown>,
): Promise<void> {
  if (!db) return;
  const { error } = await db.from('notification_outbox').insert({
    ...row,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn('[tech] notification_outbox', error.message);
}

async function hasSmsConsent(db: Awaited<ReturnType<typeof createSupabaseServerClient>>, appointmentId: string): Promise<boolean> {
  if (!db) return false;
  const { data: agreement } = await db.from('signed_agreements').select('sms_consent').eq('appointment_id', appointmentId).maybeSingle();
  if ((agreement as { sms_consent?: boolean } | null)?.sms_consent === true) return true;
  const { data: intake } = await db.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
  const fd = (intake?.form_data as Record<string, unknown> | undefined) ?? {};
  const sms = fd.walk_in_sms_consent as Record<string, unknown> | undefined;
  return sms?.agreed === true;
}

export async function techStartJobAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  if (!appointmentId) return { error: 'Missing job reference.' };

  const gate = await requireTechSupabase();
  if (!gate.ok) return { error: 'Session unavailable.' };

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  const { data: appt, error: fetchErr } = await db
    .from('appointments')
    .select('id, assigned_technician_id, status, guest_phone, guest_email, guest_name, service_slug, scheduled_start, booking_source, vehicle_description, customer_id')
    .eq('id', appointmentId)
    .maybeSingle();

  const assigned = appt && typeof appt.assigned_technician_id === 'string' ? appt.assigned_technician_id : null;
  const isWalkIn = appt && String((appt as { booking_source?: string | null }).booking_source ?? '') === 'tech_workflow';
  if (!fetchErr && appt && assigned !== gate.userId && isWalkIn && !assigned && admin) {
    await admin
      .from('appointments')
      .update({
        assigned_technician_id: gate.userId,
        assigned_by: gate.userId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId);
    (appt as { assigned_technician_id?: string }).assigned_technician_id = gate.userId;
  } else if (fetchErr || !appt || assigned !== gate.userId) {
    console.warn('[tech] start job denied', appointmentId, fetchErr?.message);
    return { error: 'You cannot start this job.' };
  }

  if (appt.status === 'in_progress') {
    return null;
  }

  if (!['assigned', 'confirmed'].includes(appt.status)) {
    console.warn('[tech] start job invalid status', appt.status);
    return { error: `Job cannot start from status “${appt.status}”.` };
  }

  const { data: sig } = await gate.supabase.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();
  let legalAck = Boolean(sig);
  if (!legalAck) {
    const { data: jobAgreement } = await gate.supabase.from('job_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();
    legalAck = Boolean(jobAgreement);
  }
  if (!legalAck) {
    const { data: intakeAck } = await gate.supabase.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
    const fd = (intakeAck?.form_data as Record<string, unknown> | undefined) ?? {};
    legalAck = Boolean(fd.walk_in_legal_ack || fd.deposit_legal_ack);
  }
  if (!legalAck) {
    return {
      error:
        'Liability agreement must be on file before starting. Complete /agreement (customer) or use Walk-in workflow to capture a signature.',
    };
  }

  const { count: beforeCount, error: bcErr } = await gate.supabase
    .from('job_media')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', appointmentId)
    .in('category', ['before', 'inspection', 'damage']);
  if (bcErr) {
    console.warn('[tech] before photo count', bcErr.message);
    return { error: 'Could not verify before photos.' };
  }
  if ((beforeCount ?? 0) < 1) {
    const { count: photoBeforeCount } = await gate.supabase
      .from('job_photos')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .in('category', ['before', 'inspection', 'damage']);
    if ((photoBeforeCount ?? 0) < 1) {
      return {
        error: 'Add at least one before/inspection photo before starting.',
      };
    }
  }

  const { data: openTimer } = await gate.supabase
    .from('tech_job_timers')
    .select('id')
    .eq('appointment_id', appointmentId)
    .is('ended_at', null)
    .maybeSingle();

  if (!openTimer) {
    let ins = await gate.supabase.from('tech_job_timers').insert({
      technician_id: gate.userId,
      appointment_id: appointmentId,
      label: 'Job start',
    });
    if (ins.error && isSchemaDriftError(ins.error.message)) {
      ins = await gate.supabase.from('tech_job_timers').insert({
        technician_id: gate.userId,
        label: `Job ${appointmentId.slice(0, 8)}`,
      });
    }
    if (ins.error) {
      console.warn('[tech] timer insert', ins.error.message);
      return { error: 'Could not start job timer. Confirm tech_job_timers exists and migration 000020 is applied.' };
    }
    await recordJobTimelineEvent(gate.supabase, {
      appointmentId,
      eventType: 'timer_started',
      meta: { source: 'tech_start_job' },
      createdBy: gate.userId,
    });
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
    return { error: error.message || 'Could not update job status.' };
  }

  await recordJobTimelineEvent(gate.supabase, {
    appointmentId,
    eventType: 'job_started',
    meta: {},
    createdBy: gate.userId,
  });

  const smsOk = await hasSmsConsent(gate.supabase, appointmentId);
  await writeNotificationOutbox(gate.supabase, {
    kind: 'job_started',
    appointment_id: appointmentId,
    customer_id: (appt as { customer_id?: string | null }).customer_id ?? null,
    technician_id: gate.userId,
    channel: 'customer',
    status: smsOk || appt.guest_email ? 'queued' : 'skipped',
    payload: {
      message: `Your Gloss Boss ATX service has started on your ${String((appt as { vehicle_description?: string | null }).vehicle_description ?? 'vehicle')}. You can follow updates in your customer dashboard.`,
      guest_email: appt.guest_email ?? null,
      guest_phone: appt.guest_phone ?? null,
    },
  });

  void notifyJobStartedPlaceholder(smsOk && appt.guest_phone != null ? String(appt.guest_phone) : null, appointmentId, {
    guestEmail: appt.guest_email != null ? String(appt.guest_email) : null,
    guestName: appt.guest_name != null ? String(appt.guest_name) : null,
    serviceLabel: String(appt.service_slug ?? '').replace(/-/g, ' ') || 'Mobile detailing',
    scheduledIso: appt.scheduled_start != null ? String(appt.scheduled_start) : undefined,
  });
  revalidatePath('/tech');
  revalidatePath('/tech/workflow');
  return null;
}

export async function techCompleteJobAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const noDamageObserved = String(formData.get('noDamageObserved') ?? '') === 'true';
  if (!appointmentId) return { error: 'Missing job reference.' };

  const gate = await requireTechSupabase();
  if (!gate.ok) return { error: 'Session unavailable.' };

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  const { data: appt, error: fetchErr } = await db
    .from('appointments')
    .select('id, assigned_technician_id, status, guest_phone, guest_email, guest_name, service_slug, booking_source, vehicle_description, customer_id')
    .eq('id', appointmentId)
    .maybeSingle();

  const assigned = appt && typeof appt.assigned_technician_id === 'string' ? appt.assigned_technician_id : null;
  const isWalkIn = appt && String((appt as { booking_source?: string | null }).booking_source ?? '') === 'tech_workflow';
  if (!fetchErr && appt && assigned !== gate.userId && isWalkIn && !assigned && admin) {
    await admin
      .from('appointments')
      .update({
        assigned_technician_id: gate.userId,
        assigned_by: gate.userId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId);
    (appt as { assigned_technician_id?: string }).assigned_technician_id = gate.userId;
  } else if (fetchErr || !appt || assigned !== gate.userId) {
    console.warn('[tech] complete job denied', appointmentId);
    return { error: 'You cannot complete this job.' };
  }

  const { data: sig } = await gate.supabase.from('signed_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();
  let legalAck = Boolean(sig);
  if (!legalAck) {
    const { data: jobAgreement } = await gate.supabase.from('job_agreements').select('id').eq('appointment_id', appointmentId).maybeSingle();
    legalAck = Boolean(jobAgreement);
  }
  if (!legalAck) {
    const { data: intakeAck } = await gate.supabase.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
    const fd = (intakeAck?.form_data as Record<string, unknown> | undefined) ?? {};
    legalAck = Boolean(fd.walk_in_legal_ack || fd.deposit_legal_ack);
  }

  if (!legalAck) {
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

  const { count: afterCount, error: acErr } = await gate.supabase
    .from('job_media')
    .select('id', { count: 'exact', head: true })
    .eq('appointment_id', appointmentId)
    .eq('category', 'after');
  if (acErr) {
    return { error: 'Could not verify after photos.' };
  }
  if ((afterCount ?? 0) < 1) {
    const { count: photoAfterCount } = await gate.supabase
      .from('job_photos')
      .select('id', { count: 'exact', head: true })
      .eq('appointment_id', appointmentId)
      .eq('category', 'after');
    if ((photoAfterCount ?? 0) < 1) {
      return { error: 'Add at least one after photo to this job before marking complete.' };
    }
  }

  const { data: checklistRow } = await gate.supabase
    .from('job_timeline_events')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('event_type', 'checklist_saved')
    .limit(1)
    .maybeSingle();

  if (!checklistRow) {
    return {
      error: 'Log the service checklist to the job timeline from the workspace below before completing.',
    };
  }

  const { data: openTimer } = await gate.supabase
    .from('tech_job_timers')
    .select('id, started_at')
    .eq('appointment_id', appointmentId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (openTimer?.id) {
    const endedAt = new Date();
    const startedAt = new Date(String((openTimer as { started_at?: string }).started_at ?? endedAt.toISOString()));
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));
    const timerUpdate = await gate.supabase
      .from('tech_job_timers')
      .update({ ended_at: endedAt.toISOString(), duration_seconds: durationSeconds, stopped_reason: 'job_completed' })
      .eq('id', String(openTimer.id));
    if (timerUpdate.error && isSchemaDriftError(timerUpdate.error.message)) {
      await gate.supabase.from('tech_job_timers').update({ ended_at: endedAt.toISOString() }).eq('id', String(openTimer.id));
    }
  }

  let completeUpdate = await gate.supabase
    .from('appointments')
    .update({
      status: 'completed',
      job_completed_at: new Date().toISOString(),
      no_damage_observed: noDamageObserved,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appointmentId);
  if (completeUpdate.error && isSchemaDriftError(completeUpdate.error.message)) {
    completeUpdate = await gate.supabase
      .from('appointments')
      .update({
        status: 'completed',
        job_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', appointmentId);
  }

  if (completeUpdate.error) {
    console.error('[tech] complete job', completeUpdate.error.message);
    return { error: completeUpdate.error.message || 'Could not update job status.' };
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

  const smsOk = await hasSmsConsent(gate.supabase, appointmentId);
  await writeNotificationOutbox(gate.supabase, {
    kind: 'job_completed',
    appointment_id: appointmentId,
    customer_id: (appt as { customer_id?: string | null }).customer_id ?? null,
    technician_id: gate.userId,
    channel: 'customer',
    status: smsOk || appt.guest_email ? 'queued' : 'skipped',
    payload: {
      message: `Your Gloss Boss ATX service is complete on your ${String((appt as { vehicle_description?: string | null }).vehicle_description ?? 'vehicle')}. Thank you for choosing Gloss Boss ATX.`,
      guest_email: appt.guest_email ?? null,
      guest_phone: appt.guest_phone ?? null,
    },
  });

  void notifyJobCompletedPlaceholder(smsOk && appt.guest_phone != null ? String(appt.guest_phone) : null, appointmentId, {
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
