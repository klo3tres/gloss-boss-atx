'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSchemaDriftError } from '@/lib/booking-server-shared';
import { notifyJobCompletedPlaceholder, notifyJobStartedPlaceholder } from '@/lib/notifications-placeholder';
import { recordJobTimelineEvent } from '@/lib/job-timeline-server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { createCustomerFinalBalanceCheckoutSession } from '@/lib/stripe/checkout';
import { resendConfigured, sendResendHtml, twilioConfigured } from '@/lib/email-send';
import { resendDomainWarning } from '@/lib/resend-config';
import {
  jobCompletedEmailHtml,
  jobStartedEmailHtml,
  notifyKindEmailHtml,
  paymentLinkEmailHtml,
  reviewRequestEmailHtml,
} from '@/lib/email/templates/transactional';
import { actionErr, actionOk, actionWarn, type ActionResult } from '@/lib/action-result';
import { sendCustomerSms } from '@/lib/sms-send';
import { describeTwilioDelivery } from '@/lib/twilio-delivery';
import { syncVehiclesForAppointment } from '@/lib/crm-vehicle-sync';
import { resolveJobPricing, syncJobBalanceDue } from '@/lib/job-pricing-display';
import { fetchPaymentsForJob } from '@/lib/payments-resolve';
import { isAdminLevel } from '@/lib/auth/roles';
import { displayMoney } from '@/lib/display-format';

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

function escapeEmailText(value: string): string {
  return value.replace(/[<>&]/g, (m) => (m === '<' ? '&lt;' : m === '>' ? '&gt;' : '&amp;'));
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
  'roof',
  'interior',
  'wheels',
  'inspection',
  'damage',
  'existing_damage',
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
  _prev: { error?: string; redirect?: string } | null,
  formData: FormData,
): Promise<{ error?: string; redirect?: string } | null> {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const workflowSessionId = String(formData.get('workflowSessionId') ?? '').trim();
  const accessToken = String(formData.get('accessToken') ?? '').trim();
  const jobReference = String(formData.get('jobReference') ?? '').trim();
  const preInspectionOverride = String(formData.get('preInspectionOverride') ?? '') === 'true';
  const preInspectionOverrideReason = String(formData.get('preInspectionOverrideReason') ?? '').trim();
  if (!appointmentId && !fallbackBookingId) return { error: 'Missing job reference.' };

  const gate = await requireTechSupabase();
  if (!gate.ok) return { error: 'Session unavailable.' };

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;

  if (!appointmentId && fallbackBookingId) {
    const { data: fb, error: fbErr } = await db
      .from('booking_fallbacks')
      .select('id, status, guest_email, guest_phone, guest_name, service_slug, scheduled_start')
      .eq('id', fallbackBookingId)
      .maybeSingle();
    if (fbErr || !fb) return { error: 'Job not found.' };
    const fbStatus = String((fb as { status?: string }).status ?? '');
    if (fbStatus === 'in_progress') return null;
    if (!['assigned', 'confirmed', 'awaiting_payment', 'deposit_paid'].includes(fbStatus)) {
      return { error: `Job cannot start from status “${fbStatus || 'unknown'}”.` };
    }
    const legalAckFb = await hasLegalAgreementForJob(db, {
      fallbackBookingId,
      guestEmail: (fb as { guest_email?: string }).guest_email ?? null,
      guestPhone: (fb as { guest_phone?: string }).guest_phone ?? null,
    });
    if (!legalAckFb) {
      return { error: 'Liability agreement must be on file before starting.' };
    }
    const sessionFb = await getSessionWithProfile();
    const canOverrideFb = preInspectionOverride && isAdminLevel(sessionFb.profile?.role ?? null);
    if (preInspectionOverride && !canOverrideFb) return { error: 'Only admins can override pre-inspection requirements.' };
    if (canOverrideFb && !preInspectionOverrideReason) return { error: 'Admin override requires a written reason.' };
    const { listJobPhotosForRefs, loadPreInspectionDamageAck, evaluatePreInspectionStartGate } = await import(
      '@/lib/pre-inspection',
    );
    const photoRowsFb = await listJobPhotosForRefs(db, { fallbackBookingId, workflowSessionIds: workflowSessionId ? [workflowSessionId] : [] });
    const damageAckFb = await loadPreInspectionDamageAck(db, { fallbackBookingId, vehicleIndex: 0 });
    const startGateFb = evaluatePreInspectionStartGate({
      photos: photoRowsFb,
      damageAck: damageAckFb,
      agreementSigned: true,
      preInspectionOverridden: Boolean(canOverrideFb),
    });
    if (!startGateFb.canStart) {
      return { error: `Cannot start job. ${startGateFb.missingItems.join('; ')}.` };
    }
    if (canOverrideFb && admin) {
      await admin
        .from('booking_fallbacks')
        .update({
          pre_inspection_override_reason: preInspectionOverrideReason,
          pre_inspection_override_by: gate.userId,
          pre_inspection_override_at: new Date().toISOString(),
        })
        .eq('id', fallbackBookingId);
    }
    await updateFallbackSafely(db, fallbackBookingId, 'in_progress');
    await updateWorkflowSessionSafely(db, workflowSessionId, 'in_progress');
    revalidatePath('/tech');
    revalidatePath(`/tech/work-orders/${fallbackBookingId}`);
    return null;
  }

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

  const session = await getSessionWithProfile();
  const canOverridePreInspection = preInspectionOverride && isAdminLevel(session.profile?.role ?? null);
  if (preInspectionOverride && !canOverridePreInspection) {
    return { error: 'Only admins can override pre-inspection requirements.' };
  }
  if (canOverridePreInspection && !preInspectionOverrideReason) {
    return { error: 'Admin override requires a written reason.' };
  }

  const { listJobPhotosForRefs, loadPreInspectionDamageAck, evaluatePreInspectionStartGate } = await import(
    '@/lib/pre-inspection',
  );

  const workflowSessionIds = workflowSessionId ? [workflowSessionId] : [];
  const photoRows = await listJobPhotosForRefs(db, {
    appointmentId,
    fallbackBookingId,
    workflowSessionIds,
  });
  const damageAck = await loadPreInspectionDamageAck(db, {
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
    vehicleIndex: 0,
  });
  const startGate = evaluatePreInspectionStartGate({
    photos: photoRows,
    damageAck,
    agreementSigned: true,
    preInspectionOverridden: canOverridePreInspection,
  });

  if (!startGate.canStart) {
    const detail = startGate.missingItems
      .map((m) => {
        if (m.startsWith('Before photos')) {
          const labels = startGate.missingPhotoLabels.join(', ');
          return labels ? `${m} — missing: ${labels}` : m;
        }
        return m;
      })
      .join('; ');
    return {
      error: `Cannot start job. ${detail}. Complete pre-inspection on the work order or use admin override with reason.`,
    };
  }

  if (canOverridePreInspection && admin) {
    const overridePatch = {
      pre_inspection_override_reason: preInspectionOverrideReason,
      pre_inspection_override_by: gate.userId,
      pre_inspection_override_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (appointmentId) await updateAppointmentSafely(admin, appointmentId, [overridePatch]);
    if (fallbackBookingId) {
      await admin.from('booking_fallbacks').update(overridePatch).eq('id', fallbackBookingId);
    }
    await recordJobTimelineEvent(gate.supabase, {
      appointmentId,
      eventType: 'pre_inspection_ack_saved',
      meta: { admin_override: true, reason: preInspectionOverrideReason },
      createdBy: gate.userId,
    });
  }

  const existingTimer = await findExistingOpenTechTimer(db, {
    appointmentId,
    fallbackBookingId,
    workflowSessionId,
    technicianId: gate.userId,
  });

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
  await notifyJobStartedPlaceholder(smsOk && appt.guest_phone != null ? String(appt.guest_phone) : null, appointmentId, {
    guestEmail: appt.guest_email != null ? String(appt.guest_email) : null,
    guestName: appt.guest_name != null ? String(appt.guest_name) : null,
    serviceLabel: String(appt.service_slug ?? '').replace(/-/g, ' ') || 'Mobile detailing',
    scheduledIso: appt.scheduled_start != null ? String(appt.scheduled_start) : undefined,
    customerId: (appt as { customer_id?: string | null }).customer_id ?? null,
    technicianId: gate.userId,
  });
  revalidatePath('/tech');
  revalidatePath('/tech/workflow');
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  const woId = fallbackBookingId || appointmentId;
  const { workOrderPath } = await import('@/lib/work-order-links');
  return {
    redirect: workOrderPath(woId, {
      source: fallbackBookingId ? 'fallback' : 'appointment',
      shell: 'technician',
    }),
  };
}

const NOTIFY_LABELS: Record<string, string> = {
  job_started: 'Job started',
  last_touches: 'Last touches',
  payment_link: 'Pay now',
  review_request: 'Review request',
  job_completed: 'Job complete',
  appointment_confirmed: 'Booking confirmation',
  booking_confirmation: 'Booking confirmation',
};

export async function techSendActiveJobNotificationAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const gate = await requireTechSupabase();
  if (!gate.ok) return actionErr('Not signed in.');
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const kind = String(formData.get('kind') ?? '').trim();
  const allowed = new Set([
    'job_started',
    'last_touches',
    'payment_link',
    'review_request',
    'job_completed',
    'technician_assigned',
    'work_started',
    'appointment_reminder',
    'appointment_confirmed',
    'booking_confirmation',
  ]);
  if (!allowed.has(kind) || (!appointmentId && !fallbackBookingId)) return actionErr('Invalid notification request.');
  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  let vehicle = 'your vehicle';
  let guestName = 'there';
  let guestEmail: string | null = null;
  let guestPhone: string | null = null;
  let customerId: string | null = null;
  if (appointmentId) {
    const { data } = await db
      .from('appointments')
      .select('vehicle_description, guest_name, guest_email, guest_phone, customer_id')
      .eq('id', appointmentId)
      .maybeSingle();
    const row = (data ?? {}) as Record<string, unknown>;
    vehicle = row.vehicle_description ? String(row.vehicle_description) : vehicle;
    guestName = row.guest_name ? String(row.guest_name) : guestName;
    guestEmail = row.guest_email ? String(row.guest_email) : null;
    guestPhone = row.guest_phone ? String(row.guest_phone) : null;
    customerId = row.customer_id ? String(row.customer_id) : null;
  }
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || ''}/dashboard`;
  let paymentUrl: string | null = null;
  const notificationConfigured = Boolean(resendConfigured() || twilioConfigured());
  let outboxStatus = guestEmail || guestPhone ? (notificationConfigured ? 'queued' : 'skipped') : 'skipped';
  let skippedReason: string | null = guestEmail || guestPhone
    ? notificationConfigured ? null : 'Skipped — configure Twilio/Resend.'
    : 'No customer email or phone on file.';
  if (kind === 'payment_link' && appointmentId) {
    const { data: apptRow } = await db.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
    const jobRow = (apptRow ?? {}) as Record<string, unknown>;
    const pays = await fetchPaymentsForJob(db, jobRow, { appointmentId });
    const pricing = resolveJobPricing(jobRow, pays);
    if (pricing.remainingBalanceCents < 50) {
      return actionErr(`No balance due. Final ${displayMoney(pricing.finalTotalCents)} · paid ${displayMoney(pricing.totalPaidCents)}.`);
    }
    const checkout = await createCustomerFinalBalanceCheckoutSession({
      admin: db,
      appointmentId,
      origin: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://glossbossatx.com',
      technicianId: gate.userId,
    });
    if (checkout.ok) {
      paymentUrl = checkout.url;
      skippedReason = null;
    } else if (checkout.code === 'NO_BALANCE_DUE') {
      return actionErr(`Balance link blocked: computed balance ${displayMoney(checkout.balanceCents ?? pricing.remainingBalanceCents)}.`);
    } else if (checkout.code === 'STRIPE_NOT_CONFIGURED') {
      return actionErr('Stripe is not configured — cannot create balance checkout.');
    } else {
      return actionErr(checkout.error || 'Could not create balance checkout.');
    }
  }
  const message =
    kind === 'last_touches'
      ? `Gloss Boss ATX update: We are doing the last touches on ${vehicle}. Track updates here: ${dashboardUrl}`
      : kind === 'payment_link'
        ? `Gloss Boss ATX update: Your service payment link is ready for ${vehicle}. ${paymentUrl ? `Pay here: ${paymentUrl}` : `Track updates here: ${dashboardUrl}`}`
        : kind === 'job_started' || kind === 'work_started'
          ? `Gloss Boss ATX update: Work has started on ${vehicle}. Track live progress here: ${dashboardUrl}`
          : kind === 'job_completed'
            ? `Gloss Boss ATX update: Your detail is complete for ${vehicle}. Photos and receipt are available here: ${dashboardUrl}`
            : kind === 'technician_assigned'
              ? `Gloss Boss ATX update: Your technician has been assigned for ${vehicle}. Track your appointment here: ${dashboardUrl}`
              : kind === 'appointment_reminder'
                ? `Gloss Boss ATX reminder: Your appointment for ${vehicle} is coming up. Details: ${dashboardUrl}`
                : kind === 'appointment_confirmed' || kind === 'booking_confirmation'
                  ? `Gloss Boss ATX: Your appointment for ${vehicle} is confirmed. Details: ${dashboardUrl}`
                  : `Gloss Boss ATX update: Thanks for choosing Gloss Boss ATX. Review your completed service here: ${dashboardUrl}`;
  let smsResult: Awaited<ReturnType<typeof sendCustomerSms>> | null = null;
  let emailResult: Awaited<ReturnType<typeof sendResendHtml>> | null = null;
  if (outboxStatus !== 'skipped') {
    const smsTo = String(guestPhone ?? '').trim();
    if (smsTo && twilioConfigured()) {
      smsResult = await sendCustomerSms({
        db,
        kind,
        template_key: kind,
        to: smsTo,
        body: message,
        appointment_id: appointmentId || null,
        fallback_booking_id: fallbackBookingId || null,
        customer_id: customerId,
        technician_id: gate.userId,
        extraPayload: { payment_url: paymentUrl, dashboard_url: dashboardUrl },
      });
    }
    if (guestEmail && resendConfigured()) {
      let reviewUrl = dashboardUrl;
      if (kind === 'review_request') {
        const { data: ss } = await db.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle();
        const raw = (ss as { value?: unknown } | null)?.value;
        if (typeof raw === 'string' && raw.trim().startsWith('http')) reviewUrl = raw.trim();
        else if (raw && typeof raw === 'object' && raw !== null && 'review_url' in raw) {
          const u = (raw as { review_url?: unknown }).review_url;
          if (typeof u === 'string' && u.trim().startsWith('http')) reviewUrl = u.trim();
        }
      }
      const emailHtml =
        kind === 'payment_link' && paymentUrl
          ? paymentLinkEmailHtml({ guestName, vehicle, paymentUrl })
          : kind === 'review_request'
            ? reviewRequestEmailHtml({ guestName, vehicle, reviewUrl })
            : kind === 'job_started' || kind === 'work_started'
              ? jobStartedEmailHtml({
                  guestName,
                  serviceLabel: vehicle,
                  whenLabel: new Date().toLocaleString(),
                })
              : kind === 'job_completed'
                ? jobCompletedEmailHtml({ guestName, serviceLabel: vehicle })
                : notifyKindEmailHtml({
                    kind,
                    guestName,
                    vehicle,
                    message,
                    ctaHref: kind === 'payment_link' ? paymentUrl ?? dashboardUrl : undefined,
                    ctaLabel: kind === 'payment_link' ? 'Pay now' : undefined,
                  });
      emailResult = await sendResendHtml({
        to: guestEmail,
        subject:
          kind === 'payment_link'
            ? 'Gloss Boss ATX — Payment link'
            : kind === 'last_touches'
              ? 'Gloss Boss ATX — Last touches'
              : kind === 'job_started' || kind === 'work_started'
                ? 'Gloss Boss ATX — Service started'
                : kind === 'job_completed'
                  ? 'Gloss Boss ATX — Service complete'
                  : kind === 'review_request'
                    ? 'Gloss Boss ATX — How did we do?'
                    : kind === 'appointment_confirmed' || kind === 'booking_confirmation'
                      ? 'Gloss Boss ATX — Booking confirmed'
                      : 'Gloss Boss ATX — Update',
        html: emailHtml,
      });
      await writeNotificationOutbox(db, {
        kind: `${kind}_email`,
        appointment_id: appointmentId || null,
        fallback_booking_id: fallbackBookingId || null,
        customer_id: customerId,
        technician_id: gate.userId,
        channel: 'email',
        status: emailResult.ok ? 'sent' : 'failed',
        skipped_reason: emailResult.ok ? null : emailResult.error ?? 'Email send failed.',
        payload: { message, guest_email: guestEmail, dashboard_url: dashboardUrl, payment_url: paymentUrl },
      });
    }
    if (smsResult?.ok === false || emailResult?.ok === false) {
      outboxStatus = 'failed';
      skippedReason = smsResult?.error || emailResult?.error || resendDomainWarning() || 'Provider send failed.';
    } else if (!smsResult && !emailResult) {
      outboxStatus = 'skipped';
      skippedReason = 'Skipped — configure Twilio Messaging Service (or From number) and/or Resend.';
    } else {
      const smsInfo = smsResult?.ok
        ? describeTwilioDelivery(smsResult.deliveryStatus, {
            errorMessage: smsResult.carrierError,
            sid: smsResult.sid,
          })
        : null;
      if (smsInfo?.isFailure) {
        outboxStatus = 'failed';
        skippedReason = smsInfo.detail;
      } else if (smsInfo && !smsInfo.isDelivered) {
        outboxStatus = 'queued';
        skippedReason = smsInfo.detail;
      } else {
        outboxStatus = 'sent';
        skippedReason = null;
      }
    }
  }
  if (appointmentId) {
    await recordJobTimelineEvent(db, {
      appointmentId,
      eventType: 'checklist_saved',
      meta: { notification_kind: kind, message, status: outboxStatus },
      createdBy: gate.userId,
    });
  }
  revalidatePath('/tech');
  if (appointmentId) revalidatePath(`/tech/work-orders/${appointmentId}`);

  const label = NOTIFY_LABELS[kind] ?? kind.replace(/_/g, ' ');
  if (kind === 'payment_link' && paymentUrl) {
    const dest = [guestEmail ? `email: ${guestEmail}` : null, guestPhone ? `SMS: ${guestPhone}` : null].filter(Boolean).join(' · ');
    if (outboxStatus === 'sent') return actionOk(`Balance link sent to ${dest || 'customer'}.`);
    if (smsResult && !smsResult.ok) {
      const smsInfo = describeTwilioDelivery(smsResult.deliveryStatus, {
        errorMessage: smsResult.carrierError,
        sid: smsResult.sid,
      });
      return actionErr(smsInfo.detail || smsResult.error || 'SMS failed — email may have sent.');
    }
    if (emailResult && !emailResult.ok) return actionErr(emailResult.error ?? 'Email failed.');
    return actionWarn(`Link created: ${paymentUrl.slice(0, 60)}… — confirm delivery in outbox.`);
  }

  if (outboxStatus === 'sent') return actionOk(`${label} delivered.`);
  if (outboxStatus === 'queued') return actionWarn(`${label}: ${skippedReason ?? 'Accepted by Twilio, delivery not confirmed.'}`);
  if (outboxStatus === 'skipped') return actionErr(skippedReason ?? `${label} skipped.`);
  return actionErr(skippedReason ?? `${label} failed.`);
}

export async function techRecordCashPaymentAction(formData: FormData): Promise<void> {
  const gate = await requireTechSupabase();
  if (!gate.ok) return;
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  if (!appointmentId && !fallbackBookingId) return;
  const amountReceivedRaw = Number(String(formData.get('amountReceived') ?? '').replace(/[^0-9.]/g, ''));
  const changeGivenRaw = Number(String(formData.get('changeGiven') ?? '').replace(/[^0-9.]/g, ''));
  const cashNote = String(formData.get('cashNote') ?? '').trim();

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
  const paysBefore = await fetchPaymentsForJob(db, row, {
    appointmentId: appointmentId || undefined,
    fallbackBookingId: fallbackBookingId || undefined,
  });
  const pricingBefore = resolveJobPricing(row, paysBefore);
  const amountCents = Math.max(
    0,
    Number.isFinite(amountReceivedRaw) && amountReceivedRaw > 0
      ? Math.round(amountReceivedRaw * 100)
      : pricingBefore.remainingBalanceCents > 0
        ? pricingBefore.remainingBalanceCents
        : 0,
  );
  const changeGivenCents = Math.max(0, Number.isFinite(changeGivenRaw) && changeGivenRaw > 0 ? Math.round(changeGivenRaw * 100) : 0);
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
        cash_received_cents: amountCents,
        change_given_cents: changeGivenCents,
        note: cashNote || null,
        receipt_number: `CASH-${nowIso.slice(0, 10).replace(/-/g, '')}-${(appointmentId || fallbackBookingId).slice(0, 8)}`,
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
      metadata: { source: 'technician_cash_payment', recorded_by: gate.userId, cash_received_cents: amountCents, change_given_cents: changeGivenCents, note: cashNote || null },
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

  const receiptNumber = `CASH-${nowIso.slice(0, 10).replace(/-/g, '')}-${(appointmentId || fallbackBookingId).slice(0, 8)}`;
  if (paymentId) {
    await db.from('receipts').insert({
      appointment_id: appointmentId || null,
      fallback_booking_id: fallbackBookingId || null,
      payment_id: paymentId,
      customer_id: row.customer_id ?? null,
      receipt_number: receiptNumber,
      amount_cents: amountCents,
      payment_method: 'cash',
      status: 'issued',
      metadata: { source: 'technician_cash_payment', note: cashNote || null, change_given_cents: changeGivenCents },
    });
  }
  await db.from('notification_outbox').insert({
    appointment_id: appointmentId || null,
    fallback_booking_id: fallbackBookingId || null,
    channel: 'internal',
    kind: 'cash_payment_receipt',
    status: 'skipped',
    skipped_reason: 'Cash receipt recorded internally; outbound delivery depends on notification config.',
    payload: { payment_id: paymentId, receipt_number: receiptNumber, amount_cents: amountCents },
  });

  if (appointmentId) {
    const { data: freshAppt } = await db.from('appointments').select('*').eq('id', appointmentId).maybeSingle();
    const freshRow = (freshAppt ?? row) as Record<string, unknown>;
    const paysAfter = await fetchPaymentsForJob(db, freshRow, { appointmentId });
    const pricingAfter = resolveJobPricing(freshRow, paysAfter);
    const balanceAfter = pricingAfter.remainingBalanceCents;
    const paidStatus = balanceAfter <= 0 ? 'paid_cash' : 'balance_due';
    await updateAppointmentSafely(db, appointmentId, [
      { payment_status: paidStatus, balance_due_cents: balanceAfter, paid_at: nowIso, updated_at: nowIso },
      { payment_status: paidStatus, balance_due_cents: balanceAfter, updated_at: nowIso },
      { payment_status: paidStatus, balance_due_cents: balanceAfter },
      { payment_status: paidStatus },
    ]);
    if (admin) await syncJobBalanceDue(admin, freshRow, pricingAfter, { appointmentId });
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
  revalidatePath('/dashboard');
}

export async function techArchiveTestWorkOrderAction(formData: FormData): Promise<void> {
  const gate = await requireTechSupabase();
  if (!gate.ok) return;
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  if (!appointmentId && !fallbackBookingId) return;
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
  _prev: { error?: string; ok?: boolean } | null,
  formData: FormData,
): Promise<{ error?: string; ok?: boolean } | null> {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const noDamageObserved = String(formData.get('noDamageObserved') ?? '') === 'true';
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const workflowSessionId = String(formData.get('workflowSessionId') ?? '').trim();
  const accessToken = String(formData.get('accessToken') ?? '').trim();
  const jobReference = String(formData.get('jobReference') ?? '').trim();
  if (!appointmentId && !fallbackBookingId) return { error: 'Missing job reference.' };

  const gate = await requireTechSupabase();
  if (!gate.ok) return { error: 'Session unavailable.' };

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  const adminOverride = String(formData.get('adminOverride') ?? '') === 'true';
  const completionOverride = String(formData.get('completionOverride') ?? '') === 'true';
  const completionOverrideReason = String(formData.get('completionOverrideReason') ?? '').trim();
  const session = await getSessionWithProfile();
  const canOverridePayment = adminOverride && isAdminLevel(session.profile?.role ?? null);
  const canOverrideCompletion = completionOverride && isAdminLevel(session.profile?.role ?? null);
  if (completionOverride && !canOverrideCompletion) {
    return { error: 'Only admins can override completion requirements.' };
  }
  if (canOverrideCompletion && !completionOverrideReason) {
    return { error: 'Completion override requires a written reason.' };
  }

  if (fallbackBookingId && !appointmentId) {
    const session = await getSessionWithProfile();
    if (!isAdminLevel(session.profile?.role ?? null)) {
      return { error: 'Fallback bookings must be completed from admin work order tools.' };
    }
    const now = new Date().toISOString();
    const { error: fbErr } = await db
      .from('booking_fallbacks')
      .update({ status: 'completed', job_completed_at: now, updated_at: now })
      .eq('id', fallbackBookingId);
    if (fbErr) return { error: fbErr.message };
    revalidatePath(`/tech/work-orders/${fallbackBookingId}`);
    revalidatePath('/admin/work-orders');
    return { ok: true };
  }

  const { data: appt, error: fetchErr } = await db
    .from('appointments')
    .select('*')
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
  } else if (fetchErr || !appt) {
    return { error: 'Job not found.' };
  } else if (assigned !== gate.userId && !isAdminLevel(session.profile?.role ?? null)) {
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

  const { listJobPhotosForRefs, evaluateJobCompletionGate } = await import('@/lib/pre-inspection');

  const workflowSessionIds = workflowSessionId ? [workflowSessionId] : [];
  const photoRows = await listJobPhotosForRefs(db, {
    appointmentId,
    fallbackBookingId,
    workflowSessionIds,
  });

  const { data: checklistRow } = await gate.supabase
    .from('job_timeline_events')
    .select('id')
    .eq('appointment_id', appointmentId)
    .eq('event_type', 'checklist_saved')
    .limit(1)
    .maybeSingle();

  const jobRow = appt as Record<string, unknown>;
  const pays = await fetchPaymentsForJob(db, jobRow, { appointmentId });
  const pricing = resolveJobPricing(jobRow, pays);
  const paymentComplete = pricing.remainingBalanceCents <= 0;

  const completionGate = evaluateJobCompletionGate({
    photos: photoRows,
    checklistSaved: Boolean(checklistRow),
    paymentComplete,
    agreementSigned: legalAck,
    completionOverridden: canOverrideCompletion,
    adminPaymentOverride: canOverridePayment,
  });

  if (!canOverridePayment && pricing.remainingBalanceCents > 0) {
    return {
      error: `Balance due ${displayMoney(pricing.remainingBalanceCents)} must be paid before completing (or admin payment override).`,
    };
  }

  if (!completionGate.canComplete) {
    return {
      error: `Cannot complete job: ${completionGate.missingItems.join('; ')}.`,
    };
  }

  if (canOverrideCompletion && admin) {
    const overridePatch = {
      completion_override_reason: completionOverrideReason,
      completion_override_by: gate.userId,
      completion_override_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await updateAppointmentSafely(admin, appointmentId, [overridePatch]);
    await recordJobTimelineEvent(gate.supabase, {
      appointmentId,
      eventType: 'checklist_saved',
      meta: { completion_admin_override: true, reason: completionOverrideReason },
      createdBy: gate.userId,
    });
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

  const adminClient = tryCreateAdminSupabase();
  if (adminClient) void syncVehiclesForAppointment(adminClient, appointmentId);

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
  revalidatePath(`/tech/work-orders/${appointmentId}`);
  revalidatePath('/admin/work-orders');
  return { ok: true };
}

export async function techSaveJobNotesAction(formData: FormData) {
  const appointmentId = String(formData.get('appointmentId') ?? '').trim();
  const fallbackBookingId = String(formData.get('fallbackBookingId') ?? '').trim();
  const workflowSessionId = String(formData.get('workflowSessionId') ?? '').trim();
  const vehicleIndexRaw = Number(String(formData.get('vehicleIndex') ?? '').trim());
  const notes = String(formData.get('notes') ?? '').trim();
  const beforeNotes = String(formData.get('beforeNotes') ?? '').trim();
  const afterNotes = String(formData.get('afterNotes') ?? '').trim();
  const internalNotes = String(formData.get('internalNotes') ?? '').trim();
  const damageNotes = String(formData.get('damageNotes') ?? '').trim();
  const upsellNotes = String(formData.get('upsellNotes') ?? '').trim();
  const customerVisible = String(formData.get('customerVisible') ?? '') === 'on';
  if (!appointmentId && !fallbackBookingId) return;

  const gate = await requireTechSupabase();
  if (!gate.ok) return;

  const admin = tryCreateAdminSupabase();
  const db = admin ?? gate.supabase;
  if (appointmentId) {
    const { data: appt, error: fetchErr } = await db
      .from('appointments')
      .select('id, assigned_technician_id')
      .eq('id', appointmentId)
      .maybeSingle();
    if (fetchErr || !appt || (appt as { assigned_technician_id?: string | null }).assigned_technician_id !== gate.userId) return;
  }

  const nowIso = new Date().toISOString();
  const combined = notes || [beforeNotes, afterNotes, damageNotes, upsellNotes, internalNotes].filter(Boolean).join('\n\n');
  if (appointmentId) {
    const { error } = await db
      .from('appointments')
      .update({ notes: combined || null, updated_at: nowIso })
      .eq('id', appointmentId);
    if (error && !isSchemaDriftError(error.message)) console.warn('[tech] save appointment notes', error.message);
  }

  const noteRow: Record<string, unknown> = {
    appointment_id: appointmentId || null,
    fallback_booking_id: fallbackBookingId || null,
    workflow_session_id: workflowSessionId || null,
    technician_id: gate.userId,
    notes: notes || combined || null,
    before_notes: beforeNotes || null,
    after_notes: afterNotes || null,
    internal_notes: internalNotes || null,
    damage_notes: damageNotes || null,
    upsell_suggestions: upsellNotes || null,
    customer_visible: customerVisible,
    created_at: nowIso,
  };
  if (Number.isInteger(vehicleIndexRaw) && vehicleIndexRaw >= 0) noteRow.vehicle_index = vehicleIndexRaw;
  const ins = await db.from('tech_job_notes').insert(noteRow);
  if (ins.error && isSchemaDriftError(ins.error.message)) {
    await db.from('tech_job_notes').insert({
      appointment_id: appointmentId || null,
      technician_id: gate.userId,
      notes: combined || null,
      before_notes: beforeNotes || null,
      after_notes: afterNotes || null,
      upsell_suggestions: upsellNotes || null,
      created_at: nowIso,
    });
  } else if (ins.error) {
    console.warn('[tech] save structured notes', ins.error.message);
  }
  if (appointmentId) {
    await recordJobTimelineEvent(db, {
      appointmentId,
      eventType: 'checklist_saved',
      meta: { notification_kind: 'notes_saved', has_customer_visible: customerVisible },
      createdBy: gate.userId,
    });
  }
  revalidatePath('/tech');
  if (appointmentId || fallbackBookingId) revalidatePath(`/tech/work-orders/${appointmentId || fallbackBookingId}`);
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
