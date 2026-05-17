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

async function hasLegalAgreementForJob(
  db: SupabaseClient | null,
  refs: {
    appointmentId?: string;
    fallbackBookingId?: string;
    customerId?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
  },
): Promise<boolean> {
  if (!db) return false;
  const phoneDigits = String(refs.guestPhone ?? '').replace(/\D/g, '');
  const email = String(refs.guestEmail ?? '').trim().toLowerCase();
  const checks: Array<() => Promise<boolean>> = [];

  for (const table of ['signed_agreements', 'job_agreements']) {
    if (refs.appointmentId) {
      checks.push(async () => {
        const { data, error } = await db.from(table).select('id').eq('appointment_id', refs.appointmentId).limit(1);
        if (error) return false;
        return Boolean(data?.length);
      });
    }
    if (refs.fallbackBookingId) {
      checks.push(async () => {
        const { data, error } = await db.from(table).select('id').eq('fallback_booking_id', refs.fallbackBookingId).limit(1);
        if (error) return false;
        return Boolean(data?.length);
      });
    }
    if (refs.customerId) {
      checks.push(async () => {
        const { data, error } = await db.from(table).select('id').eq('customer_id', refs.customerId).limit(1);
        if (error) return false;
        return Boolean(data?.length);
      });
    }
  }

  if (refs.appointmentId) {
    checks.push(async () => {
      const { data, error } = await db.from('intake_submissions').select('id, form_data').eq('appointment_id', refs.appointmentId).limit(1);
      if (error) return false;
      return Boolean(data?.length);
    });
  }
  if (refs.customerId) {
    checks.push(async () => {
      const { data, error } = await db.from('intake_submissions').select('id').eq('customer_id', refs.customerId).limit(1);
      if (error) return false;
      return Boolean(data?.length);
    });
  }
  if (email || phoneDigits) {
    checks.push(async () => {
      const { data, error } = await db
        .from('intake_submissions')
        .select('id, form_data, created_at')
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) return false;
      return (data ?? []).some((row) => {
        const fd = ((row as { form_data?: unknown }).form_data ?? {}) as Record<string, unknown>;
        const raw = JSON.stringify(fd).toLowerCase();
        return (email && raw.includes(email)) || (phoneDigits && raw.replace(/\D/g, '').includes(phoneDigits));
      });
    });
  }

  for (const check of checks) {
    try {
      if (await check()) return true;
    } catch {
      // Optional linkage columns may not exist in older deployments.
    }
  }
  return false;
}

async function updateAppointmentSafely(
  db: SupabaseClient | null,
  appointmentId: string,
  variants: Record<string, unknown>[],
): Promise<{ ok: boolean; error?: string }> {
  if (!db) return { ok: false, error: 'Database unavailable' };
  let lastError = '';
  for (const patch of variants) {
    const { error } = await db.from('appointments').update(patch).eq('id', appointmentId);
    if (!error) return { ok: true };
    lastError = error.message;
    if (!isSchemaDriftError(error.message)) return { ok: false, error: error.message };
    console.warn('[tech] appointment update schema drift retry', error.message, Object.keys(patch));
  }
  return { ok: false, error: lastError || 'Could not update appointment.' };
}

async function fetchAppointmentForStart(db: SupabaseClient | null, appointmentId: string) {
  if (!db) return { data: null as Record<string, unknown> | null, error: 'Database unavailable' };
  const selects = [
    'id, assigned_technician_id, status, guest_phone, guest_email, guest_name, service_slug, scheduled_start, booking_source, vehicle_description, customer_id',
    'id, assigned_technician_id, status, guest_phone, guest_email, guest_name, service_slug, scheduled_start, vehicle_description, customer_id',
    'id, status, guest_phone, guest_email, guest_name, service_slug, scheduled_start, vehicle_description, customer_id',
    'id, status',
  ];
  let lastError = '';
  for (const selectCols of selects) {
    const { data, error } = await db.from('appointments').select(selectCols).eq('id', appointmentId).maybeSingle();
    if (!error) return { data: (data as Record<string, unknown> | null) ?? null, error: null };
    lastError = error.message;
    if (!isSchemaDriftError(error.message)) return { data: null, error: error.message };
    console.warn('[tech] appointment select schema drift retry', error.message, selectCols);
  }
  return { data: null, error: lastError || 'Could not load appointment.' };
}

async function ensureOpenTechTimer(
  db: SupabaseClient | null,
  refs: {
    technicianId: string;
    appointmentId?: string;
    fallbackBookingId?: string;
    workflowSessionId?: string;
    label?: string;
  },
): Promise<{ ok: boolean; id?: string | null; startedAt?: string | null; error?: string }> {
  if (!db) return { ok: false, error: 'Database unavailable' };
  const startedAt = new Date().toISOString();
  const selectCols = 'id, started_at, created_at';
  const existingQueries = [];
  if (refs.appointmentId) {
    existingQueries.push(db.from('tech_job_timers').select(selectCols).eq('appointment_id', refs.appointmentId).is('ended_at', null).limit(1));
  }
  if (refs.fallbackBookingId) {
    existingQueries.push(db.from('tech_job_timers').select(selectCols).eq('fallback_booking_id', refs.fallbackBookingId).is('ended_at', null).limit(1));
  }
  if (refs.workflowSessionId) {
    existingQueries.push(db.from('tech_job_timers').select(selectCols).eq('workflow_session_id', refs.workflowSessionId).is('ended_at', null).limit(1));
  }
  for (const query of existingQueries) {
    const { data, error } = await query;
    if (error) {
      if (isSchemaDriftError(error.message)) continue;
      console.warn('[tech] open timer lookup', error.message);
      continue;
    }
    const row = ((data ?? [])[0] ?? null) as Record<string, unknown> | null;
    if (row?.id) {
      return {
        ok: true,
        id: String(row.id),
        startedAt: row.started_at != null ? String(row.started_at) : row.created_at != null ? String(row.created_at) : null,
      };
    }
  }
  const label = refs.label || 'Job start';
  const variants: Record<string, unknown>[] = [
    {
      technician_id: refs.technicianId,
      appointment_id: refs.appointmentId || null,
      fallback_booking_id: refs.fallbackBookingId || null,
      workflow_session_id: refs.workflowSessionId || null,
      started_at: startedAt,
      status: 'running',
      running: true,
      label,
    },
    {
      technician_id: refs.technicianId,
      appointment_id: refs.appointmentId || null,
      fallback_booking_id: refs.fallbackBookingId || null,
      workflow_session_id: refs.workflowSessionId || null,
      started_at: startedAt,
      label,
    },
    {
      technician_id: refs.technicianId,
      appointment_id: refs.appointmentId || null,
      fallback_booking_id: refs.fallbackBookingId || null,
      label,
    },
    {
      technician_id: refs.technicianId,
      appointment_id: refs.appointmentId || null,
      label,
    },
    {
      technician_id: refs.technicianId,
      label,
    },
  ];
  let lastError = '';
  for (const payload of variants) {
    let query = db.from('tech_job_timers').insert(payload).select('id, started_at, created_at').maybeSingle();
    const { data, error } = await query;
    if (!error) {
      const row = (data ?? {}) as Record<string, unknown>;
      return {
        ok: true,
        id: row.id != null ? String(row.id) : null,
        startedAt: row.started_at != null ? String(row.started_at) : row.created_at != null ? String(row.created_at) : startedAt,
      };
    }
    lastError = error.message;
    if (!isSchemaDriftError(error.message)) return { ok: false, error: error.message };
    console.warn('[tech] timer insert schema drift retry', error.message, Object.keys(payload));
  }
  return { ok: false, error: lastError || 'Could not start timer.' };
}

async function findExistingOpenTechTimer(
  db: SupabaseClient | null,
  refs: { appointmentId?: string; fallbackBookingId?: string; workflowSessionId?: string; technicianId?: string },
): Promise<{ id: string; startedAt: string | null } | null> {
  if (!db) return null;
  const selectCols = 'id, started_at, created_at';
  const queries = [];
  if (refs.appointmentId) queries.push(db.from('tech_job_timers').select(selectCols).eq('appointment_id', refs.appointmentId).is('ended_at', null).limit(1));
  if (refs.fallbackBookingId) queries.push(db.from('tech_job_timers').select(selectCols).eq('fallback_booking_id', refs.fallbackBookingId).is('ended_at', null).limit(1));
  if (refs.workflowSessionId) queries.push(db.from('tech_job_timers').select(selectCols).eq('workflow_session_id', refs.workflowSessionId).is('ended_at', null).limit(1));
  if (refs.technicianId) queries.push(db.from('tech_job_timers').select(selectCols).eq('technician_id', refs.technicianId).is('ended_at', null).order('created_at', { ascending: false }).limit(1));
  for (const query of queries) {
    const { data, error } = await query;
    if (error) {
      if (!isSchemaDriftError(error.message)) console.warn('[tech] existing open timer lookup', error.message);
      continue;
    }
    const row = ((data ?? [])[0] ?? null) as Record<string, unknown> | null;
    if (row?.id) {
      return {
        id: String(row.id),
        startedAt: row.started_at != null ? String(row.started_at) : row.created_at != null ? String(row.created_at) : null,
      };
    }
  }
  return null;
}

async function updateFallbackSafely(db: SupabaseClient | null, fallbackBookingId: string, status: string): Promise<void> {
  if (!db || !fallbackBookingId) return;
  const nowIso = new Date().toISOString();
  const variants = [
    { status, updated_at: nowIso },
    { status },
  ];
  for (const patch of variants) {
    const { error } = await db.from('booking_fallbacks').update(patch).eq('id', fallbackBookingId);
    if (!error) return;
    if (!isSchemaDriftError(error.message)) {
      console.warn('[tech] fallback status update', error.message);
      return;
    }
  }
}

async function updateWorkflowSessionSafely(db: SupabaseClient | null, workflowSessionId: string, status: string): Promise<void> {
  if (!db || !workflowSessionId) return;
  const nowIso = new Date().toISOString();
  const variants = [
    { status, updated_at: nowIso },
    { status },
  ];
  for (const patch of variants) {
    const { error } = await db.from('tech_workflow_sessions').update(patch).eq('id', workflowSessionId);
    if (!error) return;
    if (!isSchemaDriftError(error.message)) {
      console.warn('[tech] workflow session status update', error.message);
      return;
    }
  }
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
  const { data: appt, error: fetchErr } = await fetchAppointmentForStart(db, appointmentId);

  const assigned = appt && typeof appt.assigned_technician_id === 'string' ? appt.assigned_technician_id : null;
  const isWalkIn = appt && String((appt as { booking_source?: string | null }).booking_source ?? '') === 'tech_workflow';
  if (!fetchErr && appt && assigned !== gate.userId && isWalkIn && !assigned && admin) {
    await updateAppointmentSafely(admin, appointmentId, [
      {
        assigned_technician_id: gate.userId,
        assigned_by: gate.userId,
        assigned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        assigned_technician_id: gate.userId,
        assigned_by: gate.userId,
        assigned_at: new Date().toISOString(),
      },
      { assigned_technician_id: gate.userId },
    ]);
    (appt as { assigned_technician_id?: string }).assigned_technician_id = gate.userId;
  } else if (fetchErr || !appt || assigned !== gate.userId) {
    console.warn('[tech] start job denied', appointmentId, fetchErr);
    return { error: 'You cannot start this job.' };
  }

  const appointmentStatus = typeof appt.status === 'string' ? appt.status : '';
  if (appointmentStatus === 'in_progress') {
    return null;
  }

  if (!['assigned', 'confirmed'].includes(appointmentStatus)) {
    console.warn('[tech] start job invalid status', appointmentStatus);
    return { error: `Job cannot start from status “${appointmentStatus || 'unknown'}”.` };
  }

  const legalAck = await hasLegalAgreementForJob(db, {
    appointmentId,
    fallbackBookingId,
    customerId: (appt as { customer_id?: string | null }).customer_id ?? null,
    guestEmail: appt.guest_email != null ? String(appt.guest_email) : null,
    guestPhone: appt.guest_phone != null ? String(appt.guest_phone) : null,
  });
  if (!legalAck) {
    return {
      error:
        'Liability agreement must be on file before starting. Use Capture Agreement on this work order or send the customer agreement link.',
    };
  }

  const existingTimer = await findExistingOpenTechTimer(db, {
    appointmentId,
    fallbackBookingId,
    workflowSessionId,
    technicianId: gate.userId,
  });

  if (!existingTimer) {
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
  }

  const startedAt = new Date().toISOString();
  const statusUpdate = await updateAppointmentSafely(gate.supabase, appointmentId, [
    {
      status: 'in_progress',
      job_started_at: startedAt,
      started_at: startedAt,
      updated_at: startedAt,
    },
    {
      status: 'in_progress',
      job_started_at: startedAt,
      started_at: startedAt,
    },
    {
      status: 'in_progress',
      job_started_at: startedAt,
    },
    { status: 'in_progress' },
  ]);

  if (!statusUpdate.ok) {
    console.error('[tech] start job', statusUpdate.error);
    return { error: statusUpdate.error || 'Could not update job status.' };
  }

  await updateFallbackSafely(db, fallbackBookingId, 'in_progress');
  await updateWorkflowSessionSafely(db, workflowSessionId, 'in_progress');

  const timer = await ensureOpenTechTimer(db, {
    technicianId: gate.userId,
    appointmentId,
    fallbackBookingId,
    workflowSessionId,
    label: `Active work order ${appointmentId.slice(0, 8)}`,
  });
  if (!timer.ok) {
    console.warn('[tech] ensure active timer failed', timer.error);
    return { error: timer.error || 'Could not create the active work order timer.' };
  }

  await recordJobTimelineEvent(gate.supabase, {
    appointmentId,
    eventType: 'timer_started',
    meta: { source: 'tech_start_job', timer_id: timer.id, started_at: timer.startedAt },
    createdBy: gate.userId,
  });

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

export async function techSendActiveJobNotificationAction(formData: FormData): Promise<void> {
  const gate = await requireTechSupabase();
  if (!gate.ok) return;
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const kind = String(formData.get('kind') ?? '').trim();
  const allowed = new Set(['last_touches', 'payment_link', 'review_request']);
  if (!allowed.has(kind) || (!appointmentId && !fallbackBookingId)) return;
  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  let vehicle = 'your vehicle';
  let guestEmail: string | null = null;
  let guestPhone: string | null = null;
  let customerId: string | null = null;
  if (appointmentId) {
    const { data } = await db
      .from('appointments')
      .select('vehicle_description, guest_email, guest_phone, customer_id')
      .eq('id', appointmentId)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    vehicle = row.vehicle_description ? String(row.vehicle_description) : vehicle;
    guestEmail = row.guest_email ? String(row.guest_email) : null;
    guestPhone = row.guest_phone ? String(row.guest_phone) : null;
    customerId = row.customer_id ? String(row.customer_id) : null;
  }
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || ''}/dashboard`;
  const message =
    kind === 'last_touches'
      ? `Gloss Boss ATX update: We are doing the last touches on ${vehicle}. Track updates here: ${dashboardUrl}`
      : kind === 'payment_link'
        ? `Gloss Boss ATX update: Your service payment link is ready for ${vehicle}. Track updates here: ${dashboardUrl}`
        : `Gloss Boss ATX update: Thanks for choosing Gloss Boss ATX. Review your completed service here: ${dashboardUrl}`;
  await writeNotificationOutbox(db, {
    kind,
    appointment_id: appointmentId || null,
    fallback_booking_id: fallbackBookingId || null,
    customer_id: customerId,
    technician_id: gate.userId,
    channel: 'customer',
    status: guestEmail || guestPhone ? 'queued' : 'skipped',
    payload: { message, guest_email: guestEmail, guest_phone: guestPhone, dashboard_url: dashboardUrl },
  });
  if (appointmentId) {
    await recordJobTimelineEvent(db, {
      appointmentId,
      eventType: 'checklist_saved',
      meta: { notification_kind: kind, message, channel: guestEmail || guestPhone ? 'queued' : 'skipped' },
      createdBy: gate.userId,
    });
  }
  revalidatePath('/tech');
}

export async function techRecordCashPaymentAction(formData: FormData): Promise<void> {
  const gate = await requireTechSupabase();
  if (!gate.ok) return;
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  if (!appointmentId && !fallbackBookingId) return;

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  const nowIso = new Date().toISOString();
  let row: Record<string, unknown> = {};
  if (appointmentId) {
    const { data } = await db
      .from('appointments')
      .select('id, customer_id, guest_name, guest_email, guest_phone, service_slug, vehicle_description, base_price_cents, balance_due_cents')
      .eq('id', appointmentId)
      .maybeSingle();
    row = (data ?? {}) as Record<string, unknown>;
  } else {
    const { data } = await db
      .from('booking_fallbacks')
      .select('id, customer_id, guest_name, guest_email, guest_phone, service_slug, vehicle_description, base_price_cents, balance_due_cents')
      .eq('id', fallbackBookingId)
      .maybeSingle();
    row = (data ?? {}) as Record<string, unknown>;
  }
  const balance = typeof row.balance_due_cents === 'number' ? row.balance_due_cents : null;
  const base = typeof row.base_price_cents === 'number' ? row.base_price_cents : null;
  const amountCents = Math.max(0, balance ?? base ?? 0);
  if (amountCents < 1) return;

  const paymentVariants: Record<string, unknown>[] = [
    {
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      customer_id: row.customer_id ?? null,
      amount_cents: amountCents,
      currency: 'usd',
      status: 'succeeded',
      payment_method: 'cash',
      payment_choice: 'cash',
      paid_at: nowIso,
      technician_id: gate.userId,
      metadata: {
        source: 'technician_cash_payment',
        recorded_by: gate.userId,
        service_slug: row.service_slug ?? null,
        vehicle_description: row.vehicle_description ?? null,
      },
    },
    {
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      customer_id: row.customer_id ?? null,
      amount_cents: amountCents,
      status: 'succeeded',
      payment_method: 'cash',
      payment_choice: 'cash',
      metadata: { source: 'technician_cash_payment', recorded_by: gate.userId },
    },
    {
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      amount_cents: amountCents,
      status: 'succeeded',
    },
  ];
  let paymentId: string | null = null;
  for (const payload of paymentVariants) {
    const { data, error } = await db.from('payments').insert(payload).select('id').maybeSingle();
    if (!error) {
      paymentId = ((data ?? {}) as { id?: string | null }).id ?? null;
      break;
    }
    if (!isSchemaDriftError(error.message)) {
      console.warn('[tech] cash payment insert', error.message);
      break;
    }
  }

  if (appointmentId) {
    await updateAppointmentSafely(db, appointmentId, [
      { payment_status: 'paid_cash', balance_due_cents: 0, paid_at: nowIso, updated_at: nowIso },
      { payment_status: 'paid_cash', balance_due_cents: 0, updated_at: nowIso },
      { payment_status: 'paid_cash', balance_due_cents: 0 },
      { payment_status: 'paid_cash' },
    ]);
    await recordJobTimelineEvent(db, {
      appointmentId,
      eventType: 'checklist_saved',
      meta: { notification_kind: 'cash_payment_recorded', amount_cents: amountCents, payment_id: paymentId },
      createdBy: gate.userId,
    });
  } else {
    await updateFallbackSafely(db, fallbackBookingId, 'in_progress');
    await db.from('booking_fallbacks').update({ payment_status: 'paid_cash', balance_due_cents: 0 }).eq('id', fallbackBookingId);
  }
  revalidatePath('/tech');
  revalidatePath('/admin/payments');
}

export async function techArchiveTestWorkOrderAction(formData: FormData): Promise<void> {
  const gate = await requireTechSupabase();
  if (!gate.ok) return;
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const confirm = String(formData.get('confirm') ?? '').trim().toUpperCase();
  if (confirm !== 'ARCHIVE' || (!appointmentId && !fallbackBookingId)) return;
  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  const nowIso = new Date().toISOString();
  if (appointmentId) {
    const { data } = await db
      .from('appointments')
      .select('id, assigned_technician_id, payment_status, status')
      .eq('id', appointmentId)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    const paymentStatus = String(row.payment_status ?? '').toLowerCase();
    if (row.assigned_technician_id !== gate.userId || ['paid', 'succeeded'].includes(paymentStatus)) return;
    await updateAppointmentSafely(db, appointmentId, [
      { archived: true, archived_at: nowIso, status: 'archived', updated_at: nowIso },
      { archived: true, archived_at: nowIso, status: 'archived' },
      { status: 'archived' },
    ]);
  }
  if (fallbackBookingId) {
    await updateFallbackSafely(db, fallbackBookingId, 'archived');
  }
  revalidatePath('/tech');
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

  const legalAck = await hasLegalAgreementForJob(db, {
    appointmentId,
    fallbackBookingId,
    customerId: (appt as { customer_id?: string | null }).customer_id ?? null,
    guestEmail: appt.guest_email != null ? String(appt.guest_email) : null,
    guestPhone: appt.guest_phone != null ? String(appt.guest_phone) : null,
  });

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
