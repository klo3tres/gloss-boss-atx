'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
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
  db: SupabaseClient | null,
  row: Record<string, unknown>,
): Promise<void> {
  if (!db) return;
  const { error } = await db.from('notification_outbox').insert({
    ...row,
    created_at: new Date().toISOString(),
  });
  if (error) console.warn('[tech] notification_outbox', error.message);
}

async function hasSmsConsent(db: SupabaseClient | null, appointmentId: string): Promise<boolean> {
  if (!db) return false;
  const { data: agreement } = await db.from('signed_agreements').select('sms_consent').eq('appointment_id', appointmentId).maybeSingle();
  if ((agreement as { sms_consent?: boolean } | null)?.sms_consent === true) return true;
  const { data: intake } = await db.from('intake_submissions').select('form_data').eq('appointment_id', appointmentId).maybeSingle();
  const fd = (intake?.form_data as Record<string, unknown> | undefined) ?? {};
  const sms = fd.walk_in_sms_consent as Record<string, unknown> | undefined;
  return sms?.agreed === true;
}

function normalizePhotoCategory(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

const BEFORE_PHOTO_CATEGORIES = new Set([
  'before',
  'front',
  'rear',
  'driver_side',
  'passenger_side',
  'interior',
  'wheels',
  'inspection',
]);

function photoMatchesPhase(row: Record<string, unknown>, phase: 'before' | 'after'): boolean {
  const category = normalizePhotoCategory(row.category);
  const photoCategory = normalizePhotoCategory(row.photo_category);
  if (phase === 'after') return category === 'after';
  return BEFORE_PHOTO_CATEGORIES.has(category) || BEFORE_PHOTO_CATEGORIES.has(photoCategory);
}

function countUploadedPhotoProof(
  raw: FormDataEntryValue | null,
  refs: { appointmentId?: string; fallbackBookingId?: string; workflowSessionId?: string; accessToken?: string; jobReference?: string },
): number {
  if (typeof raw !== 'string' || !raw.trim()) return 0;
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return 0;
  }
  if (!Array.isArray(rows)) return 0;
  const refSet = new Set(
    [refs.appointmentId, refs.fallbackBookingId, refs.workflowSessionId, refs.accessToken, refs.jobReference]
      .filter((v): v is string => Boolean(v)),
  );
  const recentCutoff = Date.now() - 36 * 60 * 60 * 1000;
  return rows.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const r = row as Record<string, unknown>;
    if (r.uploadedProof !== true) return false;
    const uploadedAt = Date.parse(String(r.uploadedAt ?? r.uploaded_at ?? ''));
    if (!Number.isFinite(uploadedAt) || uploadedAt < recentCutoff) return false;
    if (!photoMatchesPhase({ category: r.category, photo_category: r.photoCategory ?? r.photo_category }, 'before')) return false;
    const proofRefs = [r.appointmentId, r.appointment_id, r.fallbackBookingId, r.fallback_booking_id, r.workflowSessionId, r.workflow_session_id]
      .filter((v): v is string => typeof v === 'string' && v.length > 0);
    return proofRefs.length === 0 || proofRefs.some((v) => refSet.has(v));
  }).length;
}

async function countWorkflowSessionPhotos(
  db: SupabaseClient | null,
  refs: { appointmentId?: string; fallbackBookingId?: string; workflowSessionId?: string; technicianId?: string; phase: 'before' | 'after' },
): Promise<number> {
  if (!db) return 0;
  const column = refs.phase === 'after' ? 'after_photo_count' : 'before_photo_count';
  const selectCols = `id, ${column}`;
  const queries = [];
  if (refs.workflowSessionId) queries.push(db.from('tech_workflow_sessions').select(selectCols).eq('id', refs.workflowSessionId).limit(1));
  if (refs.appointmentId) queries.push(db.from('tech_workflow_sessions').select(selectCols).eq('appointment_id', refs.appointmentId).order('updated_at', { ascending: false }).limit(3));
  if (refs.fallbackBookingId) queries.push(db.from('tech_workflow_sessions').select(selectCols).eq('fallback_booking_id', refs.fallbackBookingId).order('updated_at', { ascending: false }).limit(3));
  if (refs.technicianId) {
    queries.push(
      db
        .from('tech_workflow_sessions')
        .select(selectCols)
        .eq('technician_id', refs.technicianId)
        .eq('status', 'active')
        .gte('updated_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
        .order('updated_at', { ascending: false })
        .limit(3),
    );
  }
  let count = 0;
  for (const query of queries) {
    const { data, error } = await query;
    if (error) {
      if (isSchemaDriftError(error.message)) continue;
      console.warn('[tech] workflow session photo count', error.message);
      continue;
    }
    for (const row of data ?? []) {
      const value = Number(((row as unknown) as Record<string, unknown>)[column] ?? 0);
      if (Number.isFinite(value)) count = Math.max(count, value);
    }
  }
  return count;
}

async function resolveFallbackForPhotoGate(
  db: SupabaseClient | null,
  refs: { appointmentId?: string; fallbackBookingId?: string; workflowSessionId?: string; accessToken?: string; jobReference?: string; technicianId?: string },
): Promise<string[]> {
  const ids = new Set<string>();
  if (refs.fallbackBookingId) ids.add(refs.fallbackBookingId);
  if (!db) return Array.from(ids);
  if (refs.workflowSessionId) {
    const { data } = await db
      .from('tech_workflow_sessions')
      .select('fallback_booking_id')
      .eq('id', refs.workflowSessionId)
      .maybeSingle();
    const id = (data as { fallback_booking_id?: string | null } | null)?.fallback_booking_id;
    if (id) ids.add(id);
  }
  if (refs.appointmentId) {
    const { data } = await db
      .from('tech_workflow_sessions')
      .select('fallback_booking_id')
      .eq('appointment_id', refs.appointmentId)
      .order('updated_at', { ascending: false })
      .limit(5);
    for (const row of data ?? []) {
      const id = (row as { fallback_booking_id?: string | null }).fallback_booking_id;
      if (id) ids.add(id);
    }
  }
  const token = refs.accessToken || refs.jobReference || '';
  if (token) {
    const { data } = await db.from('booking_fallbacks').select('id').eq('access_token', token).maybeSingle();
    const id = (data as { id?: string | null } | null)?.id;
    if (id) ids.add(id);
  }
  if (refs.technicianId) {
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data } = await db
      .from('tech_workflow_sessions')
      .select('fallback_booking_id')
      .eq('technician_id', refs.technicianId)
      .eq('status', 'active')
      .gte('created_at', since)
      .order('updated_at', { ascending: false })
      .limit(3);
    for (const row of data ?? []) {
      const id = (row as { fallback_booking_id?: string | null }).fallback_booking_id;
      if (id) ids.add(id);
    }
  }
  return Array.from(ids);
}

async function countWorkflowPhotos(
  db: SupabaseClient | null,
  refs: {
    appointmentId?: string;
    fallbackBookingId?: string;
    workflowSessionId?: string;
    accessToken?: string;
    jobReference?: string;
    technicianId?: string;
    phase: 'before' | 'after';
  },
): Promise<{ count: number; checked: string[]; error?: string }> {
  if (!db) return { count: 0, checked: [], error: 'Database unavailable' };
  const fallbackBookingIds = await resolveFallbackForPhotoGate(db, refs);
  const checked: string[] = [];
  const rows: Record<string, unknown>[] = [];

  for (const table of ['job_media', 'job_photos']) {
    if (refs.appointmentId) {
      checked.push(`${table}.appointment_id=${refs.appointmentId.slice(0, 8)}`);
      const { data, error } = await db
        .from(table)
        .select('category, photo_category')
        .eq('appointment_id', refs.appointmentId);
      if (error && !isSchemaDriftError(error.message)) return { count: 0, checked, error: error.message };
      if (error && isSchemaDriftError(error.message)) {
        const lean = await db.from(table).select('category').eq('appointment_id', refs.appointmentId);
        if (lean.error && !isSchemaDriftError(lean.error.message)) return { count: 0, checked, error: lean.error.message };
        rows.push(...((lean.data ?? []) as Record<string, unknown>[]));
      } else {
        rows.push(...((data ?? []) as Record<string, unknown>[]));
      }
    }
    for (const fallbackBookingId of fallbackBookingIds) {
      checked.push(`${table}.fallback_booking_id=${fallbackBookingId.slice(0, 8)}`);
      const { data, error } = await db
        .from(table)
        .select('category, photo_category')
        .eq('fallback_booking_id', fallbackBookingId);
      if (error && !isSchemaDriftError(error.message)) return { count: 0, checked, error: error.message };
      if (error && isSchemaDriftError(error.message)) {
        const lean = await db.from(table).select('category').eq('fallback_booking_id', fallbackBookingId);
        if (lean.error && !isSchemaDriftError(lean.error.message)) return { count: 0, checked, error: lean.error.message };
        rows.push(...((lean.data ?? []) as Record<string, unknown>[]));
      } else {
        rows.push(...((data ?? []) as Record<string, unknown>[]));
      }
    }
  }

  return { count: rows.filter((row) => photoMatchesPhase(row, refs.phase)).length, checked };
}

export async function techStartJobAction(
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const workflowSessionId = String(formData.get('workflowSessionId') ?? '').trim();
  const accessToken = String(formData.get('accessToken') ?? '').trim();
  const jobReference = String(formData.get('jobReference') ?? '').trim();
  const uploadedProofCount = countUploadedPhotoProof(formData.get('uploadedPhotoProof'), {
    appointmentId,
    fallbackBookingId,
    workflowSessionId,
    accessToken,
    jobReference,
  });
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

  const beforeGate = await countWorkflowPhotos(db, {
    appointmentId,
    fallbackBookingId,
    workflowSessionId,
    accessToken,
    jobReference,
    technicianId: gate.userId,
    phase: 'before',
  });
  const sessionPhotoCount = await countWorkflowSessionPhotos(db, {
    appointmentId,
    fallbackBookingId,
    workflowSessionId,
    technicianId: gate.userId,
    phase: 'before',
  });
  if (beforeGate.error) {
    console.warn('[tech] before photo count', beforeGate.error);
    if (uploadedProofCount < 1 && sessionPhotoCount < 1) {
      return {
        error: `Could not verify before photos. Uploaded proof: ${uploadedProofCount}. DB: ${beforeGate.count}. Workflow session: ${sessionPhotoCount}. Checked: ${beforeGate.checked.join(', ') || 'no job reference'}`,
      };
    }
  }
  if (beforeGate.count < 1 && uploadedProofCount < 1 && sessionPhotoCount < 1) {
    return {
      error: `Add at least one vehicle photo before starting. Uploaded proof: ${uploadedProofCount}. DB: ${beforeGate.count}. Workflow session: ${sessionPhotoCount}. Checked: ${beforeGate.checked.join(', ') || appointmentId.slice(0, 8)}`,
    };
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
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const workflowSessionId = String(formData.get('workflowSessionId') ?? '').trim();
  const accessToken = String(formData.get('accessToken') ?? '').trim();
  const jobReference = String(formData.get('jobReference') ?? '').trim();
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

  const afterGate = await countWorkflowPhotos(db, {
    appointmentId,
    fallbackBookingId,
    workflowSessionId,
    accessToken,
    jobReference,
    technicianId: gate.userId,
    phase: 'after',
  });
  if (afterGate.error) {
    return { error: `Could not verify after photos. Checked: ${afterGate.checked.join(', ') || 'no job reference'}` };
  }
  if (afterGate.count < 1) {
    return { error: `Add at least one after photo before marking complete. Checked: ${afterGate.checked.join(', ') || appointmentId.slice(0, 8)}` };
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
