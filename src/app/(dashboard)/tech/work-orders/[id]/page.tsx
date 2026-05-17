import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { TechJobWorkspace } from '../../tech-job-workspace';
import { TechTimerControls } from '../../tech-timer-controls';
import { techCompleteJobAction, techRecordCashPaymentAction, techSendActiveJobNotificationAction } from '../../tech-actions';

export const dynamic = 'force-dynamic';

type Row = Record<string, unknown>;

function str(v: unknown) {
  return v == null ? '' : String(v);
}

function money(v: unknown) {
  return typeof v === 'number' ? `$${(v / 100).toFixed(2)}` : 'Not provided';
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

async function completeWorkOrderFormAction(formData: FormData) {
  'use server';
  await techCompleteJobAction(null, formData);
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
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin) notFound();

  let row: Row | null = null;
  let isFallback = source === 'fallback';
  if (!isFallback) {
    const appt = await admin
      .from('appointments')
      .select('id, status, assigned_technician_id, guest_name, guest_phone, guest_email, service_slug, vehicle_description, booking_vehicles, service_address, service_city, service_state, service_zip, vehicle_class, base_price_cents, balance_due_cents, payment_status, notes, intake_completed_at')
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
  if (!row) notFound();

  const assigned = str(row.assigned_technician_id);
  if (assigned && assigned !== session.user.id && session.profile?.role === 'technician') notFound();

  const workflowRows = await admin
    .from('tech_workflow_sessions')
    .select('id')
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
  const vehicles = Array.isArray(row.booking_vehicles) ? (row.booking_vehicles as Row[]) : [];
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
    .select('id')
    .eq(isFallback ? 'fallback_booking_id' : 'appointment_id', id)
    .is('ended_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const renderGallery = (items: Row[], label: string) => (
    <section className='rounded-2xl border border-gold/20 bg-black/35 p-4'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>{label}</p>
        <span className='rounded-full border border-white/10 px-3 py-1 text-xs text-white'>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className='mt-3 rounded-xl border border-dashed border-white/10 p-4 text-sm text-zinc-500'>No {label.toLowerCase()} uploaded yet.</p>
      ) : (
        <div className='mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
          {items.map((p) => {
            const uploader = uploaderById.get(str(p.uploaded_by || p.technician_id)) ?? 'Unknown';
            return (
              <a key={`${photoUrl(p)}-${str(p.id)}`} href={photoUrl(p)} target='_blank' rel='noreferrer' className='group block rounded-xl border border-white/10 bg-zinc-950 p-2 transition hover:border-gold/50 hover:shadow-[0_0_24px_rgba(212,166,77,0.18)]'>
                <img src={photoUrl(p)} alt={`${str(p.photo_category || p.category) || 'photo'} ${label}`} className='aspect-square w-full rounded-lg object-cover' />
                <p className='mt-2 truncate text-[10px] font-black uppercase tracking-wider text-gold-soft'>{str(p.photo_category || p.category).replace(/_/g, ' ') || 'photo'}</p>
                <p className='text-[10px] text-zinc-500'>{p.created_at ? new Date(str(p.created_at)).toLocaleString() : 'Time not provided'}</p>
                <p className='truncate text-[10px] text-zinc-600'>By {uploader}</p>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );

  return (
    <DashboardShell title='Active work order' subtitle='Photos, notes, checklist, payment, timer, and completion controls.' role='technician'>
      <section className='rounded-3xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-950 p-5 shadow-[0_0_45px_rgba(212,166,77,0.12)]'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
          <div>
            <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>{str(row.status).replace(/_/g, ' ') || 'in progress'}</p>
            <h1 className='mt-2 text-2xl font-black uppercase text-white'>{str(row.guest_name) || 'Not provided'}</h1>
            <p className='mt-1 text-sm text-zinc-400'>{str(row.service_slug).replace(/-/g, ' ') || 'Service not provided'} · {str(row.vehicle_description) || 'Vehicle not provided'}</p>
            <p className='mt-2 text-sm text-zinc-500'>{money(row.base_price_cents)} total · {money(row.balance_due_cents)} balance · {str(row.payment_status) || 'payment pending'}</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {str(row.guest_phone) ? <a href={`tel:${str(row.guest_phone)}`} className='rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black'>Call</a> : null}
            {fullAddress ? <a href={mapsHref(fullAddress)} target='_blank' rel='noreferrer' className='rounded-xl border border-gold/35 px-4 py-3 text-xs font-black uppercase tracking-wider text-gold-soft'>Directions</a> : null}
            <Link href='/tech' className='rounded-xl border border-white/10 px-4 py-3 text-xs font-black uppercase tracking-wider text-zinc-300'>Back to tech</Link>
          </div>
        </div>
        {vehicles.length > 0 ? (
          <div className='mt-5 grid gap-3 sm:grid-cols-2'>
            {vehicles.map((v, i) => (
              <div key={i} className='rounded-2xl border border-white/10 bg-black/35 p-3 text-sm'>
                <p className='font-bold text-white'>Vehicle {i + 1}: {str(v.vehicle_description || v.description) || 'Not provided'}</p>
                <p className='text-xs text-zinc-500'>{str(v.service_slug).replace(/-/g, ' ')} · {str(v.vehicle_color || v.color) || 'Color not provided'}</p>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className='grid gap-4 lg:grid-cols-2'>
        {renderGallery(before, 'Before Photos')}
        {renderGallery(after, 'After Photos')}
      </div>

      <section className='rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5'>
        <p className='mb-3 text-xs font-black uppercase tracking-[0.22em] text-emerald-300'>Work order controls</p>
        <div className='mb-4 flex flex-wrap gap-2'>
          {(['last_touches', 'payment_link', 'review_request'] as const).map((kind) => (
            <form key={kind} action={techSendActiveJobNotificationAction}>
              <input type='hidden' name='kind' value={kind} />
              {!isFallback ? <input type='hidden' name='appointmentId' value={id} /> : null}
              {isFallback ? <input type='hidden' name='fallbackBookingId' value={id} /> : null}
              <button className='rounded-lg border border-emerald-400/30 bg-black/40 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-200'>
                {kind === 'last_touches' ? 'Last Touches' : kind === 'payment_link' ? 'Send Pay Now Link' : 'Send Review Request'}
              </button>
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
