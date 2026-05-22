import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell, type DashboardShellRole } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { TechJobWorkspace } from '../../tech-job-workspace';
import { TechTimerControls } from '../../tech-timer-controls';
import { WorkOrderPhotoUpload } from '../../work-order-photo-upload';
import { WorkOrderGallery, type WorkOrderGalleryPhoto } from '../../work-order-gallery';
import { techCompleteJobAction, techRecordCashPaymentAction, techSaveJobNotesAction, techSendActiveJobNotificationAction } from '../../tech-actions';
import { revalidatePath } from 'next/cache';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { WorkOrderVehiclesForm } from '@/components/tech/work-order-vehicles-form';

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

  return (
    <DashboardShell title='Active work order' subtitle='Photos, notes, checklist, payment, timer, and completion controls.' role={shellRole}>
      <section className='rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-5 shadow-[0_0_45px_rgba(212,166,77,0.12)]'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>{label(row.status) || 'In Progress'}</p>
            <h1 className='mt-2 text-2xl font-black uppercase text-white'>{str(row.guest_name) || 'Not provided'}</h1>
            <p className='mt-1 text-sm text-zinc-400'>{label(row.service_slug)} · {str(row.vehicle_description) || 'Vehicle not provided'}</p>
            <p className='mt-2 text-sm text-zinc-500'>{money(row.base_price_cents)} total · {money(row.balance_due_cents)} balance · {str(row.payment_status) || 'payment pending'}</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {str(row.guest_phone) ? <a href={`tel:${str(row.guest_phone)}`} className='rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black'>Call</a> : null}
            {fullAddress ? <a href={mapsHref(fullAddress)} target='_blank' rel='noreferrer' className='rounded-xl border border-gold/35 px-4 py-3 text-xs font-black uppercase tracking-wider text-gold-soft'>Directions</a> : null}
            <Link href='/tech' className='rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-300'>Back to tech</Link>
          </div>
        </div>
      </section>

      <section className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <div className='rounded-3xl border border-gold/20 bg-white/[0.035] p-4 shadow-[0_0_28px_rgba(212,166,77,0.08)] backdrop-blur'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Customer</p>
          <p className='mt-3 text-lg font-black text-white'>{str(row.guest_name) || 'Not provided'}</p>
          <p className='text-xs text-zinc-400'>{str(row.guest_phone) || 'No phone'}</p>
          <p className='text-xs text-zinc-500'>{str(row.guest_email) || 'No email'}</p>
        </div>
        <div className='rounded-3xl border border-gold/20 bg-white/[0.035] p-4 shadow-[0_0_28px_rgba(212,166,77,0.08)] backdrop-blur'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Service</p>
          <p className='mt-3 text-lg font-black text-white'>{label(row.service_slug)}</p>
          <p className='text-xs text-zinc-400'>{vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'} in scope</p>
          <p className='text-xs text-zinc-500'>{label(row.status)}</p>
        </div>
        <div className='rounded-3xl border border-gold/20 bg-white/[0.035] p-4 shadow-[0_0_28px_rgba(212,166,77,0.08)] backdrop-blur'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Address</p>
          <p className='mt-3 text-sm font-bold text-white'>{fullAddress || 'Not provided'}</p>
          {fullAddress ? <a href={mapsHref(fullAddress)} target='_blank' rel='noreferrer' className='mt-2 inline-block text-xs font-bold uppercase text-gold-soft underline'>Open directions</a> : null}
        </div>
        <div className='rounded-3xl border border-gold/20 bg-white/[0.035] p-4 shadow-[0_0_28px_rgba(212,166,77,0.08)] backdrop-blur'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Payment</p>
          <p className='mt-3 text-lg font-black text-white'>{money(row.balance_due_cents)} due</p>
          <p className='text-xs text-zinc-400'>{label(row.payment_status)}</p>
          <p className={`mt-2 text-xs font-bold ${paymentComplete ? 'text-emerald-300' : 'text-amber-200'}`}>{paymentComplete ? 'Ready' : 'Needs payment'}</p>
        </div>
      </section>

      <section className='grid gap-4 lg:grid-cols-3'>
        <div className='rounded-3xl border border-white/10 bg-zinc-950/80 p-4'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Agreement</p>
          <p className={`mt-3 text-sm font-bold ${agreementSigned ? 'text-emerald-300' : 'text-amber-200'}`}>{agreementSigned ? 'Agreement Signed' : 'Agreement Missing'}</p>
          <div className='mt-3 flex flex-wrap gap-2'>
            <Link href={agreementCaptureHref} className='rounded-xl border border-gold/35 px-4 py-2 text-xs font-black uppercase text-gold-soft'>Capture Agreement</Link>
            <Link href={agreementDetailHref} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-200'>View Agreement</Link>
            <Link href={agreementDetailHref} className='rounded-xl border border-white/15 px-4 py-2 text-xs font-black uppercase text-zinc-200'>Print / PDF</Link>
          </div>
        </div>
        <div className='rounded-3xl border border-white/10 bg-zinc-950/80 p-4'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Completion Requirements</p>
          <ul className='mt-3 space-y-2'>
            {requirements.map((r) => (
              <li key={r.label} className='flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs'>
                <span className='text-zinc-300'>{r.label}</span>
                <span className={r.ok ? 'text-emerald-300' : 'text-red-300'}>{r.ok ? 'Ready' : 'Missing'}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className='rounded-3xl border border-white/10 bg-zinc-950/80 p-4'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Timeline</p>
          <ul className='mt-3 max-h-44 space-y-2 overflow-y-auto text-xs'>
            {timeline.length === 0 ? <li className='text-zinc-500'>No timeline events yet.</li> : null}
            {timeline.slice(0, 8).map((t) => (
              <li key={str(t.id)} className='rounded-xl border border-white/10 bg-black/35 px-3 py-2'>
                <p className='font-bold text-white'>{label(t.event_type)}</p>
                <p className='text-[10px] text-zinc-500'>{t.created_at ? chicago(t.created_at) : 'No timestamp'}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className='grid gap-4 lg:grid-cols-2'>
        <form action={updateWorkOrderDetailsAction} className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-4'>
          <input type='hidden' name='id' value={id} />
          <input type='hidden' name='source' value={isFallback ? 'fallback' : 'appointment'} />
          <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Customer + address</p>
          <div className='mt-3 grid gap-2 sm:grid-cols-2'>
            <input name='guestName' defaultValue={str(row.guest_name)} placeholder='Customer name' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            <input name='guestPhone' defaultValue={str(row.guest_phone)} placeholder='Phone' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            <input name='guestEmail' defaultValue={str(row.guest_email)} placeholder='Email' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2' />
            <input name='serviceAddress' defaultValue={str(row.service_address)} placeholder='Service address' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2' />
            <input name='serviceCity' defaultValue={str(row.service_city)} placeholder='City' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            <div className='grid grid-cols-2 gap-2'>
              <input name='serviceState' defaultValue={str(row.service_state) || 'TX'} placeholder='State' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <input name='serviceZip' defaultValue={str(row.service_zip)} placeholder='ZIP' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </div>
          </div>
          <button className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save customer/address</button>
        </form>

        <WorkOrderVehiclesForm
          id={id}
          source={isFallback ? 'fallback' : 'appointment'}
          defaultService={str(row.service_slug)}
          defaultClass={str(row.vehicle_class)}
          saveAction={updateWorkOrderVehiclesAction}
          initialVehicles={vehicles.map((v) => {
            const p = vehicleParts(v);
            return {
              year: p.year === 'Not provided' ? '' : p.year,
              make: p.make === 'Not provided' ? '' : p.make,
              model: p.model === 'Not provided' ? '' : p.model,
              description: str(v.vehicle_description || v.description),
              color: str(v.vehicle_color || v.color),
              service: str(v.service_slug || row.service_slug),
              vehicleClass: str(v.vehicle_class || row.vehicle_class),
            };
          })}
        />
      </section>

      <section className='rounded-2xl border border-gold/20 bg-zinc-950/90 p-4'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>Per-vehicle operations</p>
        <div className='mt-4 grid gap-4 lg:grid-cols-2'>
          {vehicles.map((v, i) => {
            const vehicleLabel = str(v.vehicle_description || v.description) || `Vehicle ${i + 1}`;
            const parts = vehicleParts(v);
            return (
              <article key={i} className='rounded-2xl border border-white/10 bg-black/35 p-4'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <p className='font-bold text-white'>Vehicle {i + 1}: {vehicleLabel}</p>
                    <p className='text-xs text-zinc-500'>{parts.year} · {parts.make} · {parts.model}</p>
                    <p className='text-xs text-zinc-500'>{str(v.vehicle_color || v.color) || 'Color not provided'} · {label(v.service_slug || row.service_slug)} · {money(v.price_cents || row.base_price_cents)} · {label(v.status || row.status)}</p>
                  </div>
                  <TechTimerControls
                    appointmentId={isFallback ? null : id}
                    fallbackBookingId={isFallback ? id : null}
                    workflowSessionId={workflowIds[0] ?? null}
                    initialTimerId={null}
                    initialStartedAt={null}
                    compact
                  />
                </div>
                <div className='mt-3'>
                  <WorkOrderPhotoUpload
                    appointmentId={isFallback ? null : id}
                    fallbackBookingId={isFallback ? id : null}
                    workflowSessionId={workflowIds[0] ?? null}
                    vehicleIndex={i}
                    vehicleLabel={vehicleLabel}
                  />
                </div>
                <form action={saveVehicleNotesAction} className='mt-3 rounded-xl border border-white/10 bg-black/25 p-3'>
                  {!isFallback ? <input type='hidden' name='appointmentId' value={id} /> : null}
                  {isFallback ? <input type='hidden' name='fallbackBookingId' value={id} /> : null}
                  {workflowIds[0] ? <input type='hidden' name='workflowSessionId' value={workflowIds[0]} /> : null}
                  <input type='hidden' name='vehicleIndex' value={String(i)} />
                  <textarea name='internalNotes' rows={2} placeholder={`Notes for ${vehicleLabel}`} className='w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
                  <button className='mt-2 rounded border border-gold/40 px-3 py-2 text-[10px] font-black uppercase text-gold-soft'>Save vehicle notes</button>
                </form>
              </article>
            );
          })}
        </div>
      </section>

      <div className='grid gap-4 lg:grid-cols-2'>
        <WorkOrderGallery title='Before Photos' photos={toGallery(before)} />
        <WorkOrderGallery title='After Photos' photos={toGallery(after)} />
      </div>

      <section className='grid gap-4 lg:grid-cols-2'>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950/85 p-4'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Notes history</p>
          <div className='mt-3 max-h-72 space-y-2 overflow-y-auto'>
            {notes.length === 0 ? <p className='rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-500'>No saved notes yet.</p> : null}
            {notes.map((n) => (
              <article key={str(n.id)} className='rounded-xl border border-white/10 bg-black/35 p-3 text-xs'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='font-black uppercase tracking-wider text-gold-soft'>Vehicle {Number(n.vehicle_index ?? -1) >= 0 ? Number(n.vehicle_index) + 1 : 'All'}</p>
                  <p className='text-zinc-500'>{n.created_at ? chicago(n.created_at) : 'No timestamp'}</p>
                </div>
                {[n.internal_notes, n.notes, n.before_notes, n.after_notes, n.damage_notes, n.upsell_notes].map((text, idx) => str(text).trim() ? (
                  <p key={idx} className='mt-2 whitespace-pre-wrap text-zinc-300'>{str(text)}</p>
                ) : null)}
              </article>
            ))}
          </div>
        </div>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950/85 p-4'>
          <p className='text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft'>Notification history</p>
          <div className='mt-3 max-h-72 space-y-2 overflow-y-auto'>
            {outbox.length === 0 ? <p className='rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-500'>No notifications sent or queued yet.</p> : null}
            {outbox.map((n) => (
              <article key={str(n.id)} className='rounded-xl border border-white/10 bg-black/35 p-3 text-xs'>
                <div className='flex flex-wrap items-center justify-between gap-2'>
                  <p className='font-black uppercase tracking-wider text-white'>{label(n.kind)}</p>
                  <p className={str(n.status) === 'skipped' ? 'text-amber-200' : str(n.status) === 'failed' ? 'text-red-300' : 'text-emerald-300'}>{label(n.status)}</p>
                </div>
                <p className='mt-1 text-zinc-500'>{n.created_at ? chicago(n.created_at) : 'No timestamp'} · {label(n.channel)}</p>
                {n.skipped_reason ? <p className='mt-2 text-amber-200'>{str(n.skipped_reason)}</p> : null}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className='rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5'>
        <p className='mb-3 text-xs font-black uppercase tracking-[0.22em] text-emerald-300'>Work order controls</p>
        <div className='mb-4 flex flex-wrap gap-2'>
          {(['job_started', 'technician_assigned', 'work_started', 'last_touches', 'payment_link', 'appointment_reminder', 'appointment_confirmed', 'job_completed', 'review_request'] as const).map((kind) => (
            <form key={kind} action={techSendActiveJobNotificationAction}>
              <input type='hidden' name='kind' value={kind} />
              {!isFallback ? <input type='hidden' name='appointmentId' value={id} /> : null}
              {isFallback ? <input type='hidden' name='fallbackBookingId' value={id} /> : null}
              <SubmitStatusButton pendingText='Sending...' className='rounded-lg border border-emerald-400/30 bg-black/40 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-200 disabled:opacity-60'>
                {label(kind === 'payment_link' ? 'send_pay_now' : kind)}
              </SubmitStatusButton>
            </form>
          ))}
        </div>
        <form action={techRecordCashPaymentAction} className='mb-4 grid gap-2 rounded-xl border border-white/10 bg-black/30 p-3 sm:grid-cols-4'>
          {!isFallback ? <input type='hidden' name='appointmentId' value={id} /> : null}
          {isFallback ? <input type='hidden' name='fallbackBookingId' value={id} /> : null}
          <input name='amountReceived' inputMode='decimal' placeholder='Amount received' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='changeGiven' inputMode='decimal' placeholder='Change given' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='cashNote' placeholder='Cash note' className='rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <button className='rounded bg-emerald-500 px-4 py-2 text-xs font-black uppercase text-black'>Paid Cash</button>
        </form>
        <div className='mb-4 rounded-xl border border-white/10 bg-black/30 p-3'>
          <p className='mb-2 text-xs font-black uppercase tracking-wider text-gold-soft'>Timer controls</p>
          <TechTimerControls
            appointmentId={isFallback ? null : id}
            fallbackBookingId={isFallback ? id : null}
            workflowSessionId={workflowIds[0] ?? null}
            initialTimerId={str((openTimer.data as Row | null)?.id)}
            initialStartedAt={str((openTimer.data as Row | null)?.started_at || (openTimer.data as Row | null)?.created_at)}
          />
        </div>
        <TechJobWorkspace job={job} hasIntake={Boolean(row.intake_completed_at) || isFallback} />
        {!isFallback ? (
          <form action={completeWorkOrderFormAction} className='mt-4'>
            <input type='hidden' name='appointmentId' value={id} />
            {workflowIds[0] ? <input type='hidden' name='workflowSessionId' value={workflowIds[0]} /> : null}
            <button className='w-full rounded-xl bg-gold px-5 py-4 text-sm font-black uppercase tracking-wider text-black'>Complete Job</button>
          </form>
        ) : (
          <p className='mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100'>Fallback work orders can capture photos/notes/payment here. Convert or link to an appointment before final completion.</p>
        )}
      </section>
    </DashboardShell>
  );
}
