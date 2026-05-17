import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import {
  TechPremiumShell,
  type TechAnalytics,
  type TechJob,
  type TechLeadRow,
  type TechPerformanceMetrics,
} from '@/components/tech/tech-premium-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function addOnSlugCounts(bookingAddOns: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!Array.isArray(bookingAddOns)) return out;
  for (const item of bookingAddOns) {
    const s = String(item ?? '').trim().toLowerCase();
    if (!s) continue;
    out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

function isBeforePhotoCategory(input: unknown): boolean {
  const cat = String(input ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['before', 'inspection', 'front', 'rear', 'driver_side', 'passenger_side', 'interior', 'wheels', 'damage'].includes(cat);
}

function isAfterPhotoCategory(input: unknown): boolean {
  return String(input ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_') === 'after';
}

function payloadObject(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

function normalizeActiveJob(input: {
  id: string;
  source: 'appointment' | 'fallback' | 'workflow_session' | 'timer';
  row?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  timer?: { id: string; startedAt: string | null; workflowSessionId: string | null } | null;
  fallbackBookingId?: string | null;
  workflowSessionId?: string | null;
  customerAddress?: string | null;
  counts?: { before: number; after: number; beforePhotos: { url: string; category: string; uploadedAt: string | null }[]; afterPhotos: { url: string; category: string; uploadedAt: string | null }[] };
}): TechJob {
  const row = input.row ?? {};
  const payload = input.payload ?? {};
  const vehicleSummary = String(row.vehicle_description ?? payload.vehicle_summary ?? payload.vehicleDescription ?? payload.vehicle_description ?? 'Not provided');
  const serviceSlug = String(row.service_slug ?? payload.service_slug ?? payload.serviceSlug ?? 'service-not-provided');
  const status = String(row.status ?? 'in_progress');
  const created = String(row.scheduled_start ?? row.created_at ?? input.timer?.startedAt ?? new Date().toISOString());
  const address =
    [row.service_address, row.service_city, row.service_state, row.service_zip].map((v) => (v == null ? '' : String(v))).filter(Boolean).join(', ') ||
    String(payload.service_address ?? payload.address ?? payload.customer_address ?? input.customerAddress ?? '') ||
    null;
  return {
    id: input.id,
    fallback_booking_id: input.fallbackBookingId ?? null,
    workflowSessionId: input.workflowSessionId ?? input.timer?.workflowSessionId ?? null,
    status: status === 'assigned' || status === 'confirmed' || input.timer ? 'in_progress' : status,
    scheduled_start: created,
    guest_name: row.guest_name != null ? String(row.guest_name) : payload.customer_name != null ? String(payload.customer_name) : 'Not provided',
    guest_phone: row.guest_phone != null ? String(row.guest_phone) : payload.customer_phone != null ? String(payload.customer_phone) : null,
    guest_email: row.guest_email != null ? String(row.guest_email) : null,
    vehicle_description: vehicleSummary,
    booking_vehicles: Array.isArray(row.booking_vehicles) ? (row.booking_vehicles as Record<string, unknown>[]) : Array.isArray(payload.booking_vehicles) ? (payload.booking_vehicles as Record<string, unknown>[]) : [],
    service_address: address,
    service_slug: serviceSlug,
    vehicle_class: String(row.vehicle_class ?? payload.vehicle_class ?? 'sedan'),
    base_price_cents: typeof row.base_price_cents === 'number' ? row.base_price_cents : null,
    notes: row.notes != null ? String(row.notes) : input.source === 'workflow_session' ? 'Active workflow session recovered into work order.' : null,
    fieldNotesPreview: null,
    hasIntake: true,
    beforePhotoCount: input.counts?.before ?? 0,
    afterPhotoCount: input.counts?.after ?? 0,
    beforePhotos: input.counts?.beforePhotos.slice(0, 8) ?? [],
    afterPhotos: input.counts?.afterPhotos.slice(0, 8) ?? [],
    payment_status: row.payment_status != null ? String(row.payment_status) : 'Not provided',
    balance_due_cents: typeof row.balance_due_cents === 'number' ? row.balance_due_cents : null,
    timerId: input.timer?.id ?? null,
    timerStartedAt: input.timer?.startedAt ?? null,
    isFallback: input.source === 'fallback' || Boolean(input.fallbackBookingId),
  };
}

export default async function TechnicianDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const justStarted = resolvedSearchParams.jobStarted === '1';
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  const admin = tryCreateAdminSupabase();
  const db = admin ?? supabase;

  let jobs: TechJob[] = [];
  let activeDebug: { userId: string | null; checked: string[]; adminRead: boolean } | null = null;
  let revenueTodayCents = 0;
  let revenueWeekCents = 0;
  const analytics: TechAnalytics = { completedCount: 0, avgJobMinutes: null, revenueMonthCents: 0 };
  let assignedLeads: TechLeadRow[] = [];
  let poolLeads: TechLeadRow[] = [];
  const performance: TechPerformanceMetrics = {
    jobsCompleted: 0,
    avgCompletionMinutes: null,
    longestJobs: [],
    revenueTodayFromPayments: 0,
    revenueWeekFromPayments: 0,
    serviceFrequency: [],
    topAddOns: [],
  };
  let goalLabel: string | null = null;
  let goalTargetCents: number | null = null;

  const techName = session.profile?.full_name?.trim() || session.user?.email?.split('@')[0] || 'Technician';
  const roleLabel = session.profile?.role ?? null;

  if (db && session.user) {
    const uid = session.user.id;
    activeDebug = { userId: uid, checked: [], adminRead: Boolean(admin) };
    let selectCols =
      'id, customer_id, status, scheduled_start, guest_name, guest_phone, guest_email, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, address, booking_add_ons, service_slug, vehicle_class, base_price_cents, notes, intake_completed_at, payment_status, balance_due_cents, archived';
    let appointmentQuery = await db
      .from('appointments')
      .select(selectCols)
      .eq('assigned_technician_id', uid)
      .in('status', ['assigned', 'confirmed', 'in_progress'])
      .order('scheduled_start', { ascending: true });
    if (appointmentQuery.error) {
      selectCols =
        'id, status, scheduled_start, guest_name, guest_phone, guest_email, vehicle_description, service_slug, vehicle_class, base_price_cents, notes, intake_completed_at, payment_status, balance_due_cents';
      appointmentQuery = await db
        .from('appointments')
        .select(selectCols)
        .eq('assigned_technician_id', uid)
        .in('status', ['assigned', 'confirmed', 'in_progress'])
        .order('scheduled_start', { ascending: true });
    }
    let rawRows = (((appointmentQuery.data ?? []) as unknown) as Record<string, unknown>[]).filter((row) => row.archived !== true && row.status !== 'archived');
    activeDebug.checked.push(`appointments.assigned=${rawRows.length}${appointmentQuery.error ? ` error:${appointmentQuery.error.message}` : ''}`);
    let ids = rawRows.map((row) => String(row.id));
    const openTimerByAppt = new Map<string, { id: string; startedAt: string | null; workflowSessionId: string | null }>();
    const openTimerByFallback = new Map<string, { id: string; startedAt: string | null; workflowSessionId: string | null }>();
    const timerQueryPrimary = await db
      .from('tech_job_timers')
      .select('id, appointment_id, fallback_booking_id, workflow_session_id, started_at, created_at')
      .eq('technician_id', uid)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(20);
    const timerQuerySecondary = timerQueryPrimary.error
      ? await db
        .from('tech_job_timers')
        .select('id, appointment_id, fallback_booking_id, workflow_session_id, created_at')
        .eq('technician_id', uid)
        .is('ended_at', null)
        .order('created_at', { ascending: false })
        .limit(20)
      : null;
    const timerQueryMinimal = timerQuerySecondary?.error
      ? await db
        .from('tech_job_timers')
        .select('id, appointment_id, created_at')
        .eq('technician_id', uid)
        .limit(20)
      : null;
    const timerFinal = timerQueryMinimal ?? timerQuerySecondary ?? timerQueryPrimary;
    const timerRows = !timerFinal.error ? (((timerFinal.data ?? []) as unknown) as Record<string, unknown>[]) : [];
    if (timerFinal.error) console.warn('[tech dashboard] open timers select', timerFinal.error.message);
    activeDebug.checked.push(`tech_job_timers.open=${timerRows.length}${timerFinal.error ? ` error:${timerFinal.error.message}` : ''}`);
    for (const timer of timerRows) {
      const row = timer as Record<string, unknown>;
      const t = {
        id: String(row.id ?? ''),
        startedAt: row.started_at != null ? String(row.started_at) : row.created_at != null ? String(row.created_at) : null,
        workflowSessionId: row.workflow_session_id != null ? String(row.workflow_session_id) : null,
      };
      const aid = row.appointment_id != null ? String(row.appointment_id) : '';
      const fid = row.fallback_booking_id != null ? String(row.fallback_booking_id) : '';
      if (aid && !openTimerByAppt.has(aid)) openTimerByAppt.set(aid, t);
      if (fid && !openTimerByFallback.has(fid)) openTimerByFallback.set(fid, t);
    }
    const timerByWorkflow = new Map<string, { id: string; startedAt: string | null; workflowSessionId: string | null }>();
    for (const timer of timerRows) {
      const wid = timer.workflow_session_id != null ? String(timer.workflow_session_id) : '';
      if (wid && !timerByWorkflow.has(wid)) {
        timerByWorkflow.set(wid, {
          id: String(timer.id ?? ''),
          startedAt: timer.started_at != null ? String(timer.started_at) : timer.created_at != null ? String(timer.created_at) : null,
          workflowSessionId: wid,
        });
      }
    }

    const workflowQueryPrimary = await db
      .from('tech_workflow_sessions')
      .select('id, appointment_id, fallback_booking_id, status, payload, before_photo_count, after_photo_count, updated_at, created_at')
      .eq('technician_id', uid)
      .in('status', ['active', 'in_progress'])
      .order('updated_at', { ascending: false })
      .limit(10);
    const workflowQueryFallback = workflowQueryPrimary.error
      ? await db
        .from('tech_workflow_sessions')
        .select('id, appointment_id, fallback_booking_id, status, payload, before_photo_count, after_photo_count, created_at')
        .eq('technician_id', uid)
        .in('status', ['active', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(10)
      : null;
    const workflowFinal = workflowQueryFallback ?? workflowQueryPrimary;
    const workflowRows = !workflowFinal.error ? (((workflowFinal.data ?? []) as unknown) as Record<string, unknown>[]) : [];
    if (workflowFinal.error) console.warn('[tech dashboard] workflow sessions select', workflowFinal.error.message);
    activeDebug.checked.push(`tech_workflow_sessions.active=${workflowRows.length}${workflowFinal.error ? ` error:${workflowFinal.error.message}` : ''}`);
    for (const sessionRow of workflowRows) {
      const row = sessionRow as Record<string, unknown>;
      const t = {
        id: `workflow-${String(row.id ?? '')}`,
        startedAt: row.updated_at != null ? String(row.updated_at) : row.created_at != null ? String(row.created_at) : null,
        workflowSessionId: row.id != null ? String(row.id) : null,
      };
      const aid = row.appointment_id != null ? String(row.appointment_id) : '';
      const fid = row.fallback_booking_id != null ? String(row.fallback_booking_id) : '';
      if (aid && !openTimerByAppt.has(aid)) openTimerByAppt.set(aid, t);
      if (fid && !openTimerByFallback.has(fid)) openTimerByFallback.set(fid, t);
    }

    const missingActiveAppointmentIds = Array.from(openTimerByAppt.keys()).filter((id) => !ids.includes(id));
    if (missingActiveAppointmentIds.length > 0) {
      const extra = await db
        .from('appointments')
        .select(selectCols)
        .in('id', missingActiveAppointmentIds);
      if (extra.error) console.warn('[tech dashboard] active appointment backfill', extra.error.message);
      const extraRows = !extra.error ? (((extra.data ?? []) as unknown) as Record<string, unknown>[]) : [];
      activeDebug.checked.push(`appointments.timer_backfill=${extraRows.length}${extra.error ? ` error:${extra.error.message}` : ''}`);
      rawRows = [...rawRows, ...extraRows.filter((row) => !ids.includes(String(row.id)))];
      ids = rawRows.map((row) => String(row.id));
    }

    let intakeIds = new Set<string>();
    const legalIds = new Set<string>();
    const customerAddressById = new Map<string, string>();
    if (ids.length > 0) {
      const { data: subs } = await db.from('intake_submissions').select('appointment_id').in('appointment_id', ids);
      intakeIds = new Set((subs ?? []).map((s) => String((s as { appointment_id: string }).appointment_id)));
      const { data: sigs } = await db.from('signed_agreements').select('appointment_id').in('appointment_id', ids);
      for (const row of sigs ?? []) {
        const aid = String((row as { appointment_id?: string }).appointment_id ?? '');
        if (aid) legalIds.add(aid);
      }
      const { data: jobAgreements } = await db.from('job_agreements').select('appointment_id').in('appointment_id', ids);
      for (const row of jobAgreements ?? []) {
        const aid = String((row as { appointment_id?: string }).appointment_id ?? '');
        if (aid) legalIds.add(aid);
      }
    }
    const customerIds = [...new Set(rawRows.map((r) => String(r.customer_id ?? '')).filter(Boolean))];
    if (customerIds.length > 0) {
      const { data: customers } = await db
        .from('customers')
        .select('id, service_address, service_city, service_state, service_zip, address_line1, city, state, postal_code')
        .in('id', customerIds);
      for (const c of customers ?? []) {
        const r = c as Record<string, unknown>;
        const full = [r.service_address ?? r.address_line1, r.service_city ?? r.city, r.service_state ?? r.state, r.service_zip ?? r.postal_code]
          .map((v) => (v == null ? '' : String(v)))
          .filter(Boolean)
          .join(', ');
        if (r.id && full) customerAddressById.set(String(r.id), full);
      }
    }

    const mediaByAppt = new Map<string, { before: number; after: number; beforePhotos: { url: string; category: string; uploadedAt: string | null }[]; afterPhotos: { url: string; category: string; uploadedAt: string | null }[] }>();
    const mediaByWorkflow = new Map<string, { before: number; after: number; beforePhotos: { url: string; category: string; uploadedAt: string | null }[]; afterPhotos: { url: string; category: string; uploadedAt: string | null }[] }>();
    const addPhoto = (
      map: Map<string, { before: number; after: number; beforePhotos: { url: string; category: string; uploadedAt: string | null }[]; afterPhotos: { url: string; category: string; uploadedAt: string | null }[] }>,
      key: string,
      row: { category?: string; photo_category?: string; file_url?: string; media_url?: string; public_url?: string; created_at?: string },
    ) => {
      if (!key) return;
      const cur = map.get(key) ?? { before: 0, after: 0, beforePhotos: [], afterPhotos: [] };
      const url = row.public_url || row.media_url || row.file_url || '';
      const photo = { url, category: String(row.photo_category ?? row.category ?? 'photo'), uploadedAt: row.created_at ?? null };
      if (isAfterPhotoCategory(row.photo_category ?? row.category)) {
        cur.after += 1;
        if (url) cur.afterPhotos.push(photo);
      } else if (isBeforePhotoCategory(row.photo_category ?? row.category) || row.category) {
        cur.before += 1;
        if (url) cur.beforePhotos.push(photo);
      }
      map.set(key, cur);
    };
    if (ids.length > 0) {
      const { data: med } = await db.from('job_media').select('appointment_id, category, photo_category, file_url, media_url, public_url, created_at').in('appointment_id', ids);
      for (const m of med ?? []) {
        const row = m as { appointment_id?: string; category?: string; photo_category?: string; file_url?: string; media_url?: string; public_url?: string; created_at?: string };
        addPhoto(mediaByAppt, String(row.appointment_id ?? ''), row);
      }
      const { data: photos } = await db.from('job_photos').select('appointment_id, category, photo_category, file_url, media_url, public_url, created_at').in('appointment_id', ids);
      for (const p of photos ?? []) {
        const row = p as { appointment_id?: string; category?: string; photo_category?: string; file_url?: string; media_url?: string; public_url?: string; created_at?: string };
        addPhoto(mediaByAppt, String(row.appointment_id ?? ''), row);
      }
    }
    const workflowIdsForMedia = workflowRows.map((row) => String(row.id ?? '')).filter(Boolean);
    if (workflowIdsForMedia.length > 0) {
      const workflowToAppt = new Map(workflowRows.map((row) => [String(row.id ?? ''), String(row.appointment_id ?? '')]));
      for (const table of ['job_media', 'job_photos']) {
        const { data } = await db
          .from(table)
          .select('workflow_session_id, category, photo_category, file_url, media_url, public_url, created_at')
          .in('workflow_session_id', workflowIdsForMedia);
        for (const p of data ?? []) {
          const row = p as { workflow_session_id?: string; category?: string; photo_category?: string; file_url?: string; media_url?: string; public_url?: string; created_at?: string };
          const wid = String(row.workflow_session_id ?? '');
          addPhoto(mediaByWorkflow, wid, row);
          const aid = workflowToAppt.get(wid) ?? '';
          if (aid) addPhoto(mediaByAppt, aid, row);
        }
      }
    }

    const fieldPreviewByAppt = new Map<string, string>();
    if (ids.length > 0) {
      const nq = await db
        .from('tech_job_notes')
        .select(
          'appointment_id, before_notes, after_notes, upsell_suggestions, internal_notes, damage_notes, customer_visible, created_at',
        )
        .eq('technician_id', uid)
        .in('appointment_id', ids)
        .order('created_at', { ascending: false });
      const noteRows = !nq.error ? (nq.data ?? []) : [];
      if (nq.error) {
        console.warn('[tech dashboard] tech_job_notes select', nq.error.message);
      }
      for (const row of noteRows) {
        const r = row as Record<string, unknown>;
        const aid = String(r.appointment_id ?? '');
        if (!aid || fieldPreviewByAppt.has(aid)) continue;
        const parts: string[] = [];
        if (r.before_notes) parts.push(`Before: ${String(r.before_notes).slice(0, 80)}`);
        if (r.after_notes) parts.push(`After: ${String(r.after_notes).slice(0, 80)}`);
        if (r.damage_notes) parts.push(`Damage: ${String(r.damage_notes).slice(0, 80)}`);
        if (r.upsell_suggestions) parts.push(`Upsell: ${String(r.upsell_suggestions).slice(0, 80)}`);
        if (r.internal_notes) parts.push(`Internal: ${String(r.internal_notes).slice(0, 80)}`);
        const preview = parts.join(' · ');
        if (preview) fieldPreviewByAppt.set(aid, preview.slice(0, 220));
      }
    }

    jobs = rawRows.map((row) => {
      const id = String(row.id);
      const intakeCompleted = row.intake_completed_at != null && String(row.intake_completed_at).length > 0;
      const counts = mediaByAppt.get(id);
      return {
        id,
        status: String(row.status),
        scheduled_start: String(row.scheduled_start),
        guest_name: row.guest_name != null ? String(row.guest_name) : null,
        guest_phone: row.guest_phone != null ? String(row.guest_phone) : null,
        guest_email: row.guest_email != null ? String(row.guest_email) : null,
        vehicle_description: row.vehicle_description != null ? String(row.vehicle_description) : null,
        booking_vehicles: Array.isArray(row.booking_vehicles) ? (row.booking_vehicles as Record<string, unknown>[]) : [],
        service_address:
          [row.service_address, row.service_city, row.service_state, row.service_zip].map((v) => (v == null ? '' : String(v))).filter(Boolean).join(', ') ||
          (row.address != null ? String(row.address) : customerAddressById.get(String(row.customer_id ?? '')) ?? null),
        service_slug: String(row.service_slug ?? ''),
        vehicle_class: String(row.vehicle_class ?? 'sedan'),
        base_price_cents: typeof row.base_price_cents === 'number' ? row.base_price_cents : null,
        notes: row.notes != null ? String(row.notes) : null,
        fieldNotesPreview: fieldPreviewByAppt.get(id) ?? null,
        hasIntake: intakeIds.has(id) || legalIds.has(id) || intakeCompleted,
        beforePhotoCount: counts?.before,
        afterPhotoCount: counts?.after,
        beforePhotos: counts?.beforePhotos.slice(0, 8) ?? [],
        afterPhotos: counts?.afterPhotos.slice(0, 8) ?? [],
        payment_status: row.payment_status != null ? String(row.payment_status) : null,
        balance_due_cents: typeof row.balance_due_cents === 'number' ? row.balance_due_cents : null,
        timerId: openTimerByAppt.get(id)?.id ?? null,
        timerStartedAt: openTimerByAppt.get(id)?.startedAt ?? null,
        workflowSessionId: openTimerByAppt.get(id)?.workflowSessionId ?? null,
        isFallback: false,
      };
    });

    const inProgressFallbackQuery = await db
      .from('booking_fallbacks')
      .select('id')
      .eq('assigned_technician_id', uid)
      .eq('status', 'in_progress')
      .limit(20);
    const inProgressFallbackIds = !inProgressFallbackQuery.error
      ? (inProgressFallbackQuery.data ?? []).map((row) => String((row as { id?: string }).id ?? '')).filter(Boolean)
      : [];
    if (inProgressFallbackQuery.error) console.warn('[tech dashboard] in-progress fallback select', inProgressFallbackQuery.error.message);
    activeDebug.checked.push(`booking_fallbacks.in_progress=${inProgressFallbackIds.length}${inProgressFallbackQuery.error ? ` error:${inProgressFallbackQuery.error.message}` : ''}`);
    for (const id of inProgressFallbackIds) {
      if (!openTimerByFallback.has(id)) {
        openTimerByFallback.set(id, { id: `fallback-${id}`, startedAt: null, workflowSessionId: null });
      }
    }

    const fallbackIds = Array.from(openTimerByFallback.keys());
    if (fallbackIds.length > 0) {
      const { data: fallbackRows, error: fallbackErr } = await db
        .from('booking_fallbacks')
      .select('id, status, guest_name, guest_phone, guest_email, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, service_slug, vehicle_class, payload, created_at')
        .in('id', fallbackIds);
      if (fallbackErr) console.warn('[tech dashboard] fallback active select', fallbackErr.message);
      const mediaByFallback = new Map<string, { before: number; after: number; beforePhotos: { url: string; category: string; uploadedAt: string | null }[]; afterPhotos: { url: string; category: string; uploadedAt: string | null }[] }>();
      const { data: fallbackMedia } = await db.from('job_media').select('fallback_booking_id, category, photo_category, file_url, media_url, public_url, created_at').in('fallback_booking_id', fallbackIds);
      for (const m of fallbackMedia ?? []) {
        const row = m as { fallback_booking_id?: string; category?: string; photo_category?: string; file_url?: string; media_url?: string; public_url?: string; created_at?: string };
        const fid = String(row.fallback_booking_id ?? '');
        const cur = mediaByFallback.get(fid) ?? { before: 0, after: 0, beforePhotos: [], afterPhotos: [] };
        const url = row.public_url || row.media_url || row.file_url || '';
        const photo = { url, category: String(row.photo_category ?? row.category ?? 'photo'), uploadedAt: row.created_at ?? null };
        if (isBeforePhotoCategory(row.photo_category ?? row.category)) {
          cur.before += 1;
          if (url) cur.beforePhotos.push(photo);
        } else if (isAfterPhotoCategory(row.photo_category ?? row.category)) {
          cur.after += 1;
          if (url) cur.afterPhotos.push(photo);
        }
        mediaByFallback.set(fid, cur);
      }
      const { data: fallbackPhotos } = await db.from('job_photos').select('fallback_booking_id, category, photo_category, file_url, media_url, public_url, created_at').in('fallback_booking_id', fallbackIds);
      for (const p of fallbackPhotos ?? []) {
        const row = p as { fallback_booking_id?: string; category?: string; photo_category?: string; file_url?: string; media_url?: string; public_url?: string; created_at?: string };
        const fid = String(row.fallback_booking_id ?? '');
        const cur = mediaByFallback.get(fid) ?? { before: 0, after: 0, beforePhotos: [], afterPhotos: [] };
        const url = row.public_url || row.media_url || row.file_url || '';
        const photo = { url, category: String(row.photo_category ?? row.category ?? 'photo'), uploadedAt: row.created_at ?? null };
        if (isBeforePhotoCategory(row.photo_category ?? row.category)) {
          cur.before += 1;
          if (url) cur.beforePhotos.push(photo);
        } else if (isAfterPhotoCategory(row.photo_category ?? row.category)) {
          cur.after += 1;
          if (url) cur.afterPhotos.push(photo);
        }
        mediaByFallback.set(fid, cur);
      }
      for (const row of fallbackRows ?? []) {
        const r = row as Record<string, unknown>;
        const id = String(r.id ?? '');
        const timer = openTimerByFallback.get(id);
        const payload = (r.payload && typeof r.payload === 'object' ? r.payload : {}) as Record<string, unknown>;
        const counts = mediaByFallback.get(id);
        jobs.unshift({
          id,
          fallback_booking_id: id,
          status: 'in_progress',
          scheduled_start: String(r.created_at ?? new Date().toISOString()),
          guest_name: r.guest_name != null ? String(r.guest_name) : payload.customer_name != null ? String(payload.customer_name) : 'Walk-in customer',
          guest_phone: r.guest_phone != null ? String(r.guest_phone) : payload.customer_phone != null ? String(payload.customer_phone) : null,
          guest_email: r.guest_email != null ? String(r.guest_email) : null,
          vehicle_description: r.vehicle_description != null ? String(r.vehicle_description) : payload.vehicle_summary != null ? String(payload.vehicle_summary) : null,
          booking_vehicles: Array.isArray(r.booking_vehicles)
            ? (r.booking_vehicles as Record<string, unknown>[])
            : Array.isArray(payload.booking_vehicles)
              ? (payload.booking_vehicles as Record<string, unknown>[])
              : [],
          service_address:
            [r.service_address, r.service_city, r.service_state, r.service_zip].map((v) => (v == null ? '' : String(v))).filter(Boolean).join(', ') ||
            (payload.service_address != null
              ? String(payload.service_address)
              : payload.address != null
                ? String(payload.address)
                : payload.customer_address != null
                  ? String(payload.customer_address)
                  : null),
          service_slug: String(r.service_slug ?? payload.service_slug ?? 'walk-in-service'),
          vehicle_class: String(r.vehicle_class ?? 'sedan'),
          base_price_cents: null,
          notes: 'Fallback work order created from walk-in workflow.',
          fieldNotesPreview: null,
          hasIntake: true,
          beforePhotoCount: counts?.before ?? 0,
          afterPhotoCount: counts?.after ?? 0,
          beforePhotos: counts?.beforePhotos.slice(0, 8) ?? [],
          afterPhotos: counts?.afterPhotos.slice(0, 8) ?? [],
          payment_status: 'pending',
          balance_due_cents: null,
          timerId: timer?.id ?? null,
          timerStartedAt: timer?.startedAt ?? null,
          workflowSessionId: timer?.workflowSessionId ?? null,
          isFallback: true,
        });
      }
    }

    const renderedAppointmentIds = new Set(jobs.map((job) => job.id));
    const renderedFallbackIds = new Set(jobs.map((job) => job.fallback_booking_id ?? '').filter(Boolean));
    const renderedWorkflowIds = new Set(jobs.map((job) => job.workflowSessionId ?? '').filter(Boolean));
    for (const sessionRow of workflowRows) {
      const row = sessionRow as Record<string, unknown>;
      const wid = row.id != null ? String(row.id) : '';
      const aid = row.appointment_id != null ? String(row.appointment_id) : '';
      const fid = row.fallback_booking_id != null ? String(row.fallback_booking_id) : '';
      if (!wid || renderedWorkflowIds.has(wid) || (aid && renderedAppointmentIds.has(aid)) || (fid && renderedFallbackIds.has(fid))) continue;
      const timer = timerByWorkflow.get(wid) ?? {
        id: `workflow-${wid}`,
        startedAt: row.updated_at != null ? String(row.updated_at) : row.created_at != null ? String(row.created_at) : null,
        workflowSessionId: wid,
      };
      const before = Number(row.before_photo_count ?? 0);
      const after = Number(row.after_photo_count ?? 0);
      const workflowCounts = mediaByWorkflow.get(wid);
      jobs.unshift(normalizeActiveJob({
        id: aid || fid || wid,
        source: 'workflow_session',
        row,
        payload: payloadObject(row.payload),
        timer,
        fallbackBookingId: fid || null,
        workflowSessionId: wid,
        counts: {
          before: Math.max(Number.isFinite(before) ? before : 0, workflowCounts?.before ?? 0),
          after: Math.max(Number.isFinite(after) ? after : 0, workflowCounts?.after ?? 0),
          beforePhotos: workflowCounts?.beforePhotos ?? [],
          afterPhotos: workflowCounts?.afterPhotos ?? [],
        },
      }));
      renderedWorkflowIds.add(wid);
    }
    for (const timerRow of timerRows) {
      const row = timerRow as Record<string, unknown>;
      const tid = row.id != null ? String(row.id) : '';
      const aid = row.appointment_id != null ? String(row.appointment_id) : '';
      const fid = row.fallback_booking_id != null ? String(row.fallback_booking_id) : '';
      const wid = row.workflow_session_id != null ? String(row.workflow_session_id) : '';
      if (!tid || (aid && renderedAppointmentIds.has(aid)) || (fid && renderedFallbackIds.has(fid)) || (wid && renderedWorkflowIds.has(wid))) continue;
      const workflowCounts = wid ? mediaByWorkflow.get(wid) : undefined;
      jobs.unshift(normalizeActiveJob({
        id: aid || fid || wid || tid,
        source: 'timer',
        row,
        timer: {
          id: tid,
          startedAt: row.started_at != null ? String(row.started_at) : row.created_at != null ? String(row.created_at) : null,
          workflowSessionId: wid || null,
        },
        fallbackBookingId: fid || null,
        workflowSessionId: wid || null,
        counts: workflowCounts,
      }));
    }

    const { data: done } = await db
      .from('appointments')
      .select('id, base_price_cents, job_completed_at, updated_at, booking_add_ons, service_slug')
      .eq('assigned_technician_id', uid)
      .eq('status', 'completed');
    const now = new Date();
    const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const sow = sod - 7 * 86400000;
    const monthAgo = Date.now() - 30 * 86400000;
    const completedIds: string[] = [];

    const serviceCount: Record<string, number> = {};
    const addonAgg: Record<string, number> = {};

    for (const row of done ?? []) {
      const r = row as Record<string, unknown>;
      const id = String(r.id ?? '');
      completedIds.push(id);
      const completed = r.job_completed_at != null ? String(r.job_completed_at) : String(r.updated_at ?? '');
      const t = new Date(completed).getTime();
      const cents = typeof r.base_price_cents === 'number' ? r.base_price_cents : 0;
      const slug = typeof r.service_slug === 'string' ? r.service_slug : '';
      if (slug) serviceCount[slug] = (serviceCount[slug] ?? 0) + 1;
      const merged = addOnSlugCounts(r.booking_add_ons);
      for (const [k, v] of Object.entries(merged)) addonAgg[k] = (addonAgg[k] ?? 0) + v;

      if (!Number.isNaN(t)) {
        if (t >= sod) revenueTodayCents += cents;
        if (t >= sow) revenueWeekCents += cents;
        if (t >= monthAgo) {
          analytics.revenueMonthCents += cents;
          analytics.completedCount += 1;
        }
      }
    }

    performance.jobsCompleted = completedIds.length;
    performance.serviceFrequency = Object.entries(serviceCount)
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    performance.topAddOns = Object.entries(addonAgg)
      .map(([slug, count]) => ({ slug, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    if (completedIds.length > 0) {
      const { data: pays } = await db
        .from('payments')
        .select('amount_cents, status, created_at, appointment_id')
        .in('appointment_id', completedIds)
        .eq('status', 'succeeded');
      for (const p of pays ?? []) {
        const row = p as { amount_cents?: number; created_at?: string };
        const c = typeof row.amount_cents === 'number' ? row.amount_cents : 0;
        const t = new Date(String(row.created_at ?? '')).getTime();
        if (!Number.isNaN(t)) {
          performance.revenueWeekFromPayments += t >= sow ? c : 0;
          performance.revenueTodayFromPayments += t >= sod ? c : 0;
        }
      }
    }

    const monthIso = new Date(monthAgo).toISOString();
    const { data: timers } = await db
      .from('tech_job_timers')
      .select('duration_seconds, appointment_id, started_at')
      .eq('technician_id', uid)
      .gte('started_at', monthIso)
      .not('duration_seconds', 'is', null)
      .limit(120);
    const secs = (timers ?? [])
      .map((t) => (t as { duration_seconds?: number }).duration_seconds)
      .filter((n): n is number => typeof n === 'number' && n > 0);
    if (secs.length > 0) {
      const avgSec = secs.reduce((a, b) => a + b, 0) / secs.length;
      analytics.avgJobMinutes = Math.round(avgSec / 60);
      performance.avgCompletionMinutes = Math.round(avgSec / 60);
    }

    const { data: longest } = await db
      .from('tech_job_timers')
      .select('duration_seconds, appointment_id, started_at')
      .eq('technician_id', uid)
      .not('duration_seconds', 'is', null)
      .order('duration_seconds', { ascending: false })
      .limit(5);
    performance.longestJobs =
      longest?.map((r) => {
        const row = r as { duration_seconds?: number; appointment_id?: string | null };
        return {
          durationMinutes: Math.round((row.duration_seconds ?? 0) / 60),
          appointmentId: row.appointment_id != null ? String(row.appointment_id) : null,
        };
      }) ?? [];

    const { data: goalRow } = await db
      .from('business_goals')
      .select('target_cents, label')
      .eq('goal_key', 'tech_revenue_week')
      .maybeSingle();
    if (goalRow && typeof (goalRow as { target_cents?: number }).target_cents === 'number') {
      goalTargetCents = (goalRow as { target_cents: number }).target_cents;
      goalLabel = typeof (goalRow as { label?: string }).label === 'string' ? (goalRow as { label: string }).label : 'Weekly revenue goal';
    }

    const { data: leadsMine } = await db
      .from('leads')
      .select('id, name, phone, email, status, contact_attempts, notes, created_at, in_pool, assigned_technician_id, archived, archived_at, deleted_at')
      .eq('assigned_technician_id', uid)
      .order('updated_at', { ascending: false })
      .limit(40);

    assignedLeads =
      leadsMine?.filter((r: Record<string, unknown>) => r.archived !== true && !r.archived_at && !r.deleted_at && r.status !== 'deleted').map((r: Record<string, unknown>) => ({
        id: String(r.id),
        name: String(r.name ?? ''),
        phone: r.phone != null ? String(r.phone) : null,
        email: r.email != null ? String(r.email) : null,
        status: String(r.status ?? 'new'),
        contact_attempts: typeof r.contact_attempts === 'number' ? r.contact_attempts : 0,
        notes: r.notes != null ? String(r.notes) : null,
        created_at: String(r.created_at ?? ''),
        in_pool: Boolean(r.in_pool),
      })) ?? [];

    const { data: pool } = await db
      .from('leads')
      .select('id, name, phone, email, status, contact_attempts, notes, created_at, in_pool, assigned_technician_id, archived, archived_at, deleted_at')
      .eq('in_pool', true)
      .is('assigned_technician_id', null)
      .order('created_at', { ascending: false })
      .limit(30);

    poolLeads =
      pool?.filter((r: Record<string, unknown>) => r.archived !== true && !r.archived_at && !r.deleted_at && r.status !== 'deleted').map((r: Record<string, unknown>) => ({
        id: String(r.id),
        name: String(r.name ?? ''),
        phone: r.phone != null ? String(r.phone) : null,
        email: r.email != null ? String(r.email) : null,
        status: String(r.status ?? 'new'),
        contact_attempts: typeof r.contact_attempts === 'number' ? r.contact_attempts : 0,
        notes: r.notes != null ? String(r.notes) : null,
        created_at: String(r.created_at ?? ''),
        in_pool: Boolean(r.in_pool),
      })) ?? [];
  }

  return (
    <DashboardShell title='Technician workspace' subtitle='Dispatch-grade command center — jobs, leads, analytics, field tools.' role='technician'>
      <TechPremiumShell
        techName={techName}
        roleLabel={roleLabel}
        jobs={jobs}
        revenueTodayCents={revenueTodayCents}
        revenueWeekCents={revenueWeekCents}
        analytics={analytics}
        assignedLeads={assignedLeads}
        poolLeads={poolLeads}
        performance={performance}
        goalLabel={goalLabel}
        goalTargetCents={goalTargetCents}
        justStarted={justStarted}
        activeDebug={activeDebug}
      />
    </DashboardShell>
  );
}
