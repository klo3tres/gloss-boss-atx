import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell, type DashboardShellRole } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { WorkOrderGallery, type WorkOrderGalleryPhoto } from '../../work-order-gallery';
import { techCompleteJobAction, techRecordCashPaymentAction, techSaveJobNotesAction } from '../../tech-actions';
import { revalidatePath } from 'next/cache';
import { WorkOrderConsoleClient, type WorkOrderConsoleData } from '@/components/tech/work-order-console-client';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function money(v: unknown) {
  return typeof v === 'number' ? `$${(v / 100).toFixed(2)}` : 'Not provided';
}

function label(v: unknown) {
  const text = str(v).trim();
  if (!text) return 'Not provided';
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function vehicleParts(v: Row) {
  const raw = str(v.vehicle_description || v.description);
  const parts = raw.split(/\s+/).filter(Boolean);
  const year = parts.find((p) => /^(19|20)\d{2}$/.test(p)) ?? '';
  const rest = year ? parts.filter((p) => p !== year) : parts;
  return {
    year: year || 'Not provided',
    make: str(v.make || rest[0]) || 'Not provided',
    model: str(v.model || rest.slice(1).join(' ')) || raw || 'Not provided',
  };
}

function photoPhase(row: Row): 'before' | 'after' {
  const cat = str(row.photo_category || row.category).toLowerCase().replace(/[\s-]+/g, '_');
  return cat === 'after' ? 'after' : 'before';
}

function photoUrl(row: Row) {
  return str(row.public_url || row.media_url || row.file_url);
}

function mapsHref(address: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function chicago(v: unknown) {
  if (!v) return 'Not provided';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(str(v)));
}

function payloadObject(v: unknown): Row {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
}

async function completeWorkOrderFormAction(formData: FormData) {
  'use server';
  await techCompleteJobAction(null, formData);
}

async function saveVehicleNotesAction(formData: FormData) {
  'use server';
  await techSaveJobNotesAction(formData);
}

async function updateWorkOrderDetailsAction(formData: FormData) {
  'use server';
  const admin = tryCreateAdminSupabase();
  if (!admin) return;
  const id = str(formData.get('id')).trim();
  const source = str(formData.get('source')).trim();
  if (!id) return;
  const table = source === 'fallback' ? 'booking_fallbacks' : 'appointments';
  const patch = {
    guest_name: str(formData.get('guestName')).trim() || null,
    guest_email: str(formData.get('guestEmail')).trim().toLowerCase() || null,
    guest_phone: str(formData.get('guestPhone')).replace(/\D/g, '') || null,
    service_address: str(formData.get('serviceAddress')).trim() || null,
    service_city: str(formData.get('serviceCity')).trim() || null,
    service_state: str(formData.get('serviceState')).trim().toUpperCase() || null,
    service_zip: str(formData.get('serviceZip')).replace(/\D/g, '').slice(0, 5) || null,
    updated_at: new Date().toISOString(),
  };
  await admin.from(table).update(patch).eq('id', id);
  revalidatePath(`/tech/work-orders/${id}`);
  revalidatePath('/tech');
  revalidatePath('/admin/work-orders');
}

async function updateWorkOrderVehiclesAction(formData: FormData) {
  'use server';
  const admin = tryCreateAdminSupabase();
  if (!admin) return;
  const id = str(formData.get('id')).trim();
  const source = str(formData.get('source')).trim();
  if (!id) return;
  const table = source === 'fallback' ? 'booking_fallbacks' : 'appointments';
  const descriptions = formData.getAll('vehicleDescription').map((v) => str(v).trim());
  const years = formData.getAll('vehicleYear').map((v) => str(v).trim());
  const makes = formData.getAll('vehicleMake').map((v) => str(v).trim());
  const models = formData.getAll('vehicleModel').map((v) => str(v).trim());
  const colors = formData.getAll('vehicleColor').map((v) => str(v).trim());
  const services = formData.getAll('vehicleService').map((v) => str(v).trim());
  const classes = formData.getAll('vehicleClass').map((v) => str(v).trim());
  const vehicles = descriptions.map((description, index) => ({
    year: years[index] || null,
    make: makes[index] || null,
    model: models[index] || null,
    vehicle_description: description || [years[index], makes[index], models[index]].filter(Boolean).join(' ') || `Vehicle ${index + 1}`,
    vehicle_color: colors[index] || null,
    service_slug: services[index] || null,
    vehicle_class: classes[index] || null,
  }));
  const patch = {
    booking_vehicles: vehicles,
    vehicle_description: vehicles.map((v) => v.vehicle_description).join(' · '),
    service_slug: vehicles[0]?.service_slug,
    vehicle_class: vehicles[0]?.vehicle_class,
    updated_at: new Date().toISOString(),
  };
  await admin.from(table).update(patch).eq('id', id);
  revalidatePath(`/tech/work-orders/${id}`);
  revalidatePath('/tech');
  revalidatePath('/admin/work-orders');
}

export default async function TechWorkOrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = searchParams ? await searchParams : {};
  const source = str(sp.source);
  const shellRole: DashboardShellRole = str(sp.shell) === 'admin' ? 'admin' : 'technician';
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin) notFound();

  let row: Row | null = null;
  let isFallback = source === 'fallback';
  if (!isFallback) {
    const appt = await admin
      .from('appointments')
      .select('id, status, access_token, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, notes, intake_completed_at, scheduled_start, job_completed_at, completed_at')
      .eq('id', id)
      .maybeSingle();
    row = (appt.data ?? null) as Row | null;
  }
  if (!row) {
    const fb = await admin
      .from('booking_fallbacks')
      .select('id, status, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, payload, created_at')
      .eq('id', id)
      .maybeSingle();
    row = (fb.data ?? null) as Row | null;
    isFallback = Boolean(row);
  }
  if (!row) {
    const wf = await admin
      .from('tech_workflow_sessions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    const wfRow = (wf.data ?? null) as Row | null;
    const wfAppointmentId = str(wfRow?.appointment_id);
    const wfFallbackId = str(wfRow?.fallback_booking_id);
    if (wfAppointmentId) {
      const linked = await admin
        .from('appointments')
        .select('id, status, access_token, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, notes, intake_completed_at, scheduled_start, job_completed_at, completed_at')
        .eq('id', wfAppointmentId)
        .maybeSingle();
      row = (linked.data ?? null) as Row | null;
    } else if (wfFallbackId) {
      const linked = await admin
        .from('booking_fallbacks')
        .select('id, status, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, payload, created_at')
        .eq('id', wfFallbackId)
        .maybeSingle();
      row = (linked.data ?? null) as Row | null;
      isFallback = Boolean(row);
    } else if (wfRow) {
      const payload = payloadObject(wfRow.payload);
      row = {
        id,
        status: wfRow.status ?? 'in_progress',
        assigned_technician_id: wfRow.technician_id,
        guest_name: payload.guest_name ?? payload.customerName ?? 'Operational work order',
        guest_phone: payload.guest_phone ?? payload.customerPhone,
        guest_email: payload.guest_email ?? payload.customerEmail,
        service_slug: payload.service_slug ?? payload.serviceSlug,
        vehicle_description: payload.vehicle_description ?? payload.vehicleDescription,
        booking_vehicles: payload.booking_vehicles ?? payload.vehicles ?? [],
        service_address: payload.service_address ?? payload.serviceAddress,
        service_city: payload.service_city,
        service_state: payload.service_state,
        service_zip: payload.service_zip,
        vehicle_class: payload.vehicle_class ?? payload.vehicleClass,
        base_price_cents: payload.base_price_cents ?? payload.total_cents,
        balance_due_cents: payload.balance_due_cents ?? 0,
        payment_status: payload.payment_status ?? 'pending',
        notes: payload.notes,
      };
    }
  }
  if (!row) {
    const timer = await admin.from('tech_job_timers').select('*').eq('id', id).maybeSingle();
    const timerRow = (timer.data ?? null) as Row | null;
    const timerAppointmentId = str(timerRow?.appointment_id);
    const timerFallbackId = str(timerRow?.fallback_booking_id);
    if (timerAppointmentId) {
      const linked = await admin
        .from('appointments')
        .select('id, status, access_token, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, notes, intake_completed_at, scheduled_start, job_completed_at, completed_at')
        .eq('id', timerAppointmentId)
        .maybeSingle();
      row = (linked.data ?? null) as Row | null;
    } else if (timerFallbackId) {
      const linked = await admin
        .from('booking_fallbacks')
        .select('id, status, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, payload, created_at')
        .eq('id', timerFallbackId)
        .maybeSingle();
      row = (linked.data ?? null) as Row | null;
      isFallback = Boolean(row);
    } else if (timerRow) {
      row = { id, status: 'in_progress', assigned_technician_id: timerRow.technician_id, guest_name: 'Operational work order', payment_status: 'pending', balance_due_cents: 0 };
    }
  }
  if (!row) {
    row = { id, status: 'in_progress', guest_name: 'Operational work order', payment_status: 'pending', balance_due_cents: 0 };
  }

  const assigned = str(row.assigned_technician_id);
  if (assigned && assigned !== session.user.id && session.profile?.role === 'technician') notFound();

  const workflowRows = await admin
    .from('tech_workflow_sessions')
    .select('id, started_at, created_at')
    .or(`${isFallback ? `fallback_booking_id.eq.${id}` : `appointment_id.eq.${id}`}`)
    .limit(10);
  const workflowIds = (workflowRows.data ?? []).map((r) => str((r as Row).id)).filter(Boolean);

  const mediaRows: Row[] = [];
  for (const table of ['job_media', 'job_photos']) {
    const direct = await admin
      .from(table)
      .select('id, category, photo_category, file_url, media_url, public_url, uploaded_by, technician_id, created_at, workflow_session_id')
      .eq(isFallback ? 'fallback_booking_id' : 'appointment_id', id)
      .limit(120);
    if (!direct.error) mediaRows.push(...((direct.data ?? []) as Row[]));
    if (workflowIds.length > 0) {
      const byWorkflow = await admin
        .from(table)
        .select('id, category, photo_category, file_url, media_url, public_url, uploaded_by, technician_id, created_at, workflow_session_id')
        .in('workflow_session_id', workflowIds)
        .limit(120);
      if (!byWorkflow.error) mediaRows.push(...((byWorkflow.data ?? []) as Row[]));
    }
  }

  const uploaderIds = Array.from(new Set(mediaRows.map((p) => str(p.uploaded_by || p.technician_id)).filter(Boolean)));
  const uploaderById = new Map<string, string>();
  if (uploaderIds.length > 0) {
    const profiles = await admin.from('profiles').select('id, full_name, email').in('id', uploaderIds);
    for (const p of profiles.data ?? []) uploaderById.set(str((p as Row).id), str((p as Row).full_name || (p as Row).email) || 'Technician');
  }

  const photos = Array.from(new Map(mediaRows.filter((p) => photoUrl(p)).map((p) => [photoUrl(p), p])).values());
  const before = photos.filter((p) => photoPhase(p) === 'before');
  const after = photos.filter((p) => photoPhase(p) === 'after');
  const fullAddress = [row.service_address, row.service_city, row.service_state, row.service_zip].map(str).filter(Boolean).join(', ');
  const vehicles = Array.isArray(row.booking_vehicles) && row.booking_vehicles.length > 0
    ? (row.booking_vehicles as Row[])
    : [{ vehicle_description: row.vehicle_description, vehicle_color: null, service_slug: row.service_slug, vehicle_class: row.vehicle_class }];
  const job = {
    id,
    status: str(row.status || 'in_progress'),
    service_slug: str(row.service_slug),
    notes: str(row.notes) || null,
    fallback_booking_id: isFallback ? id : null,
    workflowSessionId: workflowIds[0] ?? null,
    isFallback,
  };
  const openTimer = await admin
    .from('tech_job_timers')
    .select('id, started_at, created_at')
    .eq(isFallback ? 'fallback_booking_id' : 'appointment_id', id)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const [timelineRes, notesRes, outboxRes, agreementRes] = await Promise.all([
    !isFallback
      ? admin.from('job_timeline_events').select('id, event_type, created_at, created_by, meta').eq('appointment_id', id).order('created_at', { ascending: false }).limit(50)
      : Promise.resolve({ data: [] }),
    admin.from('tech_job_notes').select('id, notes, internal_notes, before_notes, after_notes, damage_notes, upsell_notes, vehicle_index, created_at, created_by').eq(isFallback ? 'fallback_booking_id' : 'appointment_id', id).order('created_at', { ascending: false }).limit(50),
    admin.from('notification_outbox').select('id, kind, channel, status, skipped_reason, created_at, payload').eq(isFallback ? 'fallback_booking_id' : 'appointment_id', id).order('created_at', { ascending: false }).limit(30),
    !isFallback
      ? admin.from('signed_agreements').select('id, signed_at').eq('appointment_id', id).order('signed_at', { ascending: false }).limit(1).maybeSingle()
      : admin.from('signed_agreements').select('id, signed_at').eq('fallback_booking_id', id).order('signed_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const timeline = ((timelineRes.data ?? []) as Row[]);
  const notes = ((notesRes.data ?? []) as Row[]);
  const outbox = ((outboxRes.data ?? []) as Row[]);
  const agreementRow = (agreementRes.data as Row | null) ?? null;
  const agreementSigned = Boolean(agreementRow?.id);
  const agreementCaptureHref = `/agreement?${[
    isFallback ? `fallbackBookingId=${encodeURIComponent(id)}` : `appointmentId=${encodeURIComponent(id)}`,
    row.customer_id ? `customerId=${encodeURIComponent(str(row.customer_id))}` : '',
    str(row.access_token) ? `token=${encodeURIComponent(str(row.access_token))}` : '',
    row.guest_email ? `email=${encodeURIComponent(str(row.guest_email))}` : '',
    row.guest_phone ? `phone=${encodeURIComponent(str(row.guest_phone))}` : '',
  ].filter(Boolean).join('&')}`;
  const agreementDetailHref = agreementRow?.id ? `/admin/agreements/${encodeURIComponent(`signed_agreements:${str(agreementRow.id)}`)}` : agreementCaptureHref;
  const checklistSaved = timeline.some((t) => str(t.event_type) === 'checklist_saved');
  const paymentComplete = ['paid', 'paid_cash', 'full_paid', 'comped', 'test_comped'].includes(str(row.payment_status).toLowerCase()) || Number(row.balance_due_cents ?? 0) === 0;
  const requirements = [
    { label: 'Agreement complete', ok: agreementSigned },
    { label: 'Before photos complete', ok: before.length > 0 },
    { label: 'Checklist complete', ok: checklistSaved },
    { label: 'After photos complete', ok: after.length > 0 },
    { label: 'Payment complete', ok: paymentComplete },
  ];

  const toGallery = (items: Row[]): WorkOrderGalleryPhoto[] => items.map((p) => ({
    id: str(p.id) || photoUrl(p),
    url: photoUrl(p),
    category: str(p.photo_category || p.category) || 'photo',
    createdAt: str(p.created_at),
    uploader: uploaderById.get(str(p.uploaded_by || p.technician_id)) ?? 'Unknown',
  }));

  const consoleData: WorkOrderConsoleData = {
    id,
    isFallback,
    shellBackHref: shellRole === 'admin' ? '/admin/work-orders' : '/tech',
    guestName: str(row.guest_name) || 'Customer',
    guestPhone: str(row.guest_phone),
    guestEmail: str(row.guest_email),
    serviceLabel: label(row.service_slug),
    statusLabel: label(row.status) || 'In progress',
    fullAddress,
    serviceAddress: str(row.service_address),
    serviceCity: str(row.service_city),
    serviceState: str(row.service_state) || 'TX',
    serviceZip: str(row.service_zip),
    mapsHref: fullAddress ? mapsHref(fullAddress) : '#',
    baseTotal: money(row.base_price_cents),
    balanceDue: money(row.balance_due_cents),
    paymentStatus: label(row.payment_status),
    paymentComplete,
    agreementSigned,
    agreementCaptureHref,
    agreementDetailHref,
    requirements,
    timeline: timeline.map((t) => ({
      id: str(t.id),
      title: label(t.event_type),
      time: t.created_at ? chicago(t.created_at) : '—',
    })),
    notes: notes.map((n) => ({
      id: str(n.id),
      vehicleLabel: `Vehicle ${Number(n.vehicle_index ?? -1) >= 0 ? Number(n.vehicle_index) + 1 : 'All'}`,
      time: n.created_at ? chicago(n.created_at) : '—',
      body: [n.internal_notes, n.notes, n.before_notes, n.after_notes, n.damage_notes, n.upsell_notes].map((t) => str(t).trim()).filter(Boolean).join('\n'),
    })),
    outbox: outbox.map((n) => ({
      id: str(n.id),
      kind: label(n.kind),
      status: label(n.status),
      time: n.created_at ? chicago(n.created_at) : '—',
      skipped: str(n.skipped_reason) || undefined,
    })),
    beforePhotos: toGallery(before),
    afterPhotos: toGallery(after),
    vehicles: vehicles.map((v, i) => {
      const p = vehicleParts(v);
      const vehicleLabel = str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`;
      return {
        year: p.year === 'Not provided' ? '' : p.year,
        make: p.make === 'Not provided' ? '' : p.make,
        model: p.model === 'Not provided' ? '' : p.model,
        description: str(v.vehicle_description || v.description),
        color: str(v.vehicle_color || v.color),
        service: str(v.service_slug || row.service_slug),
        vehicleClass: str(v.vehicle_class || row.vehicle_class),
        label: vehicleLabel,
        partsLine: `${p.year} · ${p.make} · ${p.model}`,
      };
    }),
    job,
    hasIntake: Boolean(row.intake_completed_at) || isFallback,
    workflowSessionId: workflowIds[0] ?? null,
    openTimerId: str((openTimer.data as Row | null)?.id),
    openTimerStartedAt: str((openTimer.data as Row | null)?.started_at || (openTimer.data as Row | null)?.created_at),
    vehicleForms: { defaultService: str(row.service_slug), defaultClass: str(row.vehicle_class) },
  };

  return (
    <DashboardShell title='Work order' subtitle='Timeline, progress, photos, agreement, and payment.' role={shellRole}>
      <WorkOrderConsoleClient
        data={consoleData}
        updateDetailsAction={updateWorkOrderDetailsAction}
        updateVehiclesAction={updateWorkOrderVehiclesAction}
        saveVehicleNotesAction={saveVehicleNotesAction}
        recordCashAction={techRecordCashPaymentAction}
        completeJobAction={completeWorkOrderFormAction}
      />
    </DashboardShell>
  );
}
