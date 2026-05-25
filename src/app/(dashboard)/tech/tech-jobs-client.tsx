'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { techCompleteJobAction, techStartJobAction } from './tech-actions';
import { workOrderPath } from '@/lib/work-order-links';
import { TechJobWorkspace } from './tech-job-workspace';
import { formatVehicleClassLabel } from '@/lib/display-pricing';

type Job = {
  id: string;
  status: string;
  scheduled_start: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  vehicle_description: string | null;
  booking_vehicles?: Array<Record<string, unknown>>;
  service_address?: string | null;
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number | null;
  notes?: string | null;
  fieldNotesPreview?: string | null;
  hasIntake?: boolean;
  beforePhotoCount?: number;
  afterPhotoCount?: number;
  fallback_booking_id?: string | null;
  workflowSessionId?: string | null;
  timerId?: string | null;
  timerStartedAt?: string | null;
  isFallback?: boolean;
};

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function vehicleLines(job: Job) {
  if (Array.isArray(job.booking_vehicles) && job.booking_vehicles.length > 0) {
    return job.booking_vehicles.map((v, i) => ({
      label: String(v.vehicle_description ?? v.description ?? `Vehicle ${i + 1}`),
      service: String(v.service_slug ?? job.service_slug),
      color: String(v.vehicle_color ?? v.color ?? '') || 'Color not provided',
      priceCents: typeof v.price_cents === 'number' ? v.price_cents : null,
    }));
  }
  return [{ label: job.vehicle_description ?? formatVehicleClassLabel(job.vehicle_class), service: job.service_slug, color: 'Color not provided', priceCents: job.base_price_cents }];
}

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `tel:+1${digits.length === 10 ? digits : digits}` : `tel:${phone}`;
}

export function TechJobsClient({ jobs }: { jobs: Job[] }) {
  const [startState, startAction, startPending] = useActionState(techStartJobAction, null);
  const [completeState, completeAction, completePending] = useActionState(techCompleteJobAction, null);

  if (jobs.length === 0) {
    return <p className='text-sm text-zinc-500'>No jobs assigned to you yet.</p>;
  }

  return (
    <div className='space-y-4'>
      {startState?.error ? (
        <p className='rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200' role='alert'>
          {startState.error}
        </p>
      ) : null}
      {completeState?.error ? (
        <p className='rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200' role='alert'>
          {completeState.error}
        </p>
      ) : null}
      {jobs.map((job) => {
        const price = job.base_price_cents && job.base_price_cents > 0 ? job.base_price_cents / 100 : null;
        const serviceAddress = job.service_address?.trim() || '';
        const phone = job.guest_phone?.trim() || '';
        const vehicles = vehicleLines(job);
        const isStarted = job.status === 'in_progress' || Boolean(job.timerId) || Boolean(job.timerStartedAt);

        return (
          <article key={job.id} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
            <div className='flex flex-wrap items-start justify-between gap-4'>
              <div className='min-w-0 flex-1'>
                <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>{job.status.replace(/_/g, ' ')}</p>
                <h3 className='mt-1 text-lg font-black uppercase text-white'>{job.service_slug.replace(/-/g, ' ')}</h3>
                <p className='text-sm text-zinc-400'>{new Date(job.scheduled_start).toLocaleString()}</p>
                <p className='mt-2 text-sm text-zinc-300'>Customer: {job.guest_name ?? 'Guest'}</p>
                <p className='text-xs font-bold text-gold-soft'>
                  {vehicles.length} vehicle{vehicles.length === 1 ? '' : 's'}
                </p>
                <div className='mt-2 grid gap-2 sm:grid-cols-2'>
                  {vehicles.map((v, i) => (
                    <div key={`${v.label}-${i}`} className='rounded-lg border border-white/10 bg-black/30 p-2 text-xs'>
                      <p className='font-semibold text-white'>Vehicle {i + 1}: {v.label}</p>
                      <p className='text-zinc-500'>{v.service.replace(/-/g, ' ')} · {v.color}{v.priceCents != null ? ` · $${(v.priceCents / 100).toFixed(2)}` : ''}</p>
                    </div>
                  ))}
                </div>
                {price != null ? (
                  <p className='mt-1 text-xs font-semibold text-emerald-300/90'>Job value · ${price.toFixed(0)}</p>
                ) : null}
                {serviceAddress ? (
                  <p className='mt-2 text-xs text-zinc-400'>{serviceAddress}</p>
                ) : (
                  <p className='mt-2 text-xs text-zinc-600'>No service address on file — contact customer.</p>
                )}
                {job.fieldNotesPreview ? (
                  <p className='mt-2 rounded-lg border border-gold/20 bg-black/40 px-2 py-1.5 text-[11px] text-gold-soft/90'>
                    Field notes: {job.fieldNotesPreview}
                  </p>
                ) : null}
                {job.hasIntake === false ? (
                  <p className='mt-2 text-xs font-semibold text-amber-200'>
                    Intake not on file yet — customer must complete `/intake` after paying before you can close this job.
                  </p>
                ) : null}
                {!job.hasIntake ? (
                  <a
                    href={`/agreement?appointment_id=${encodeURIComponent(job.id)}`}
                    className='mt-2 inline-block rounded-lg border border-amber-500/35 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-200'
                  >
                    Capture Agreement
                  </a>
                ) : null}
              </div>
              <div className='flex flex-col gap-2'>
                {phone ? (
                  <a
                    href={telHref(phone)}
                    className='rounded-lg border border-gold/40 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-gold-soft hover:bg-gold/10'
                  >
                    Call
                  </a>
                ) : null}
                {serviceAddress.length > 8 ? (
                  <a
                    href={mapsUrl(serviceAddress)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='rounded-lg border border-white/20 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-zinc-200 hover:border-gold/40'
                  >
                    Directions
                  </a>
                ) : (
                  <button
                    type='button'
                    disabled
                    className='rounded-lg border border-white/10 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-zinc-600'
                  >
                    No Directions
                  </button>
                )}
                {['assigned', 'confirmed'].includes(job.status) && !isStarted ? (
                  <form action={startAction}>
                    {!job.isFallback ? <input type='hidden' name='appointmentId' value={job.id} /> : null}
                    {job.fallback_booking_id ? <input type='hidden' name='fallbackBookingId' value={job.fallback_booking_id} /> : null}
                    {job.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={job.workflowSessionId} /> : null}
                    <button
                      type='submit'
                      disabled={startPending}
                      className='w-full rounded-lg bg-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-50'
                    >
                      {startPending ? 'Starting…' : 'Start job'}
                    </button>
                  </form>
                ) : null}
                <Link
                  href={workOrderPath(job.isFallback && job.fallback_booking_id ? job.fallback_booking_id : job.id, {
                    source: job.isFallback ? 'fallback' : 'appointment',
                    shell: 'technician',
                  })}
                  className='rounded-lg border border-gold/40 bg-gold/10 px-4 py-2 text-center text-xs font-black uppercase tracking-wider text-gold-soft'
                >
                  Open work order
                </Link>
                {isStarted ? (
                  <form action={completeAction}>
                    {!job.isFallback ? <input type='hidden' name='appointmentId' value={job.id} /> : null}
                    {job.fallback_booking_id ? <input type='hidden' name='fallbackBookingId' value={job.fallback_booking_id} /> : null}
                    {job.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={job.workflowSessionId} /> : null}
                    <button
                      type='submit'
                      disabled={completePending}
                      className='w-full rounded-lg border border-emerald-500/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300 disabled:opacity-50'
                    >
                      {completePending ? 'Saving…' : 'Mark complete'}
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            <TechJobWorkspace job={{ ...job, service_slug: job.service_slug }} hasIntake={job.hasIntake} />
            <p className='mt-3 text-xs text-zinc-600'>
              Starting a job requires a signed liability agreement and at least one before photo. Completing requires after photos and a logged checklist.
            </p>
          </article>
        );
      })}
    </div>
  );
}
