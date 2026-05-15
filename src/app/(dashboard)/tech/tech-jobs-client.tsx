'use client';

import { techCompleteJobAction, techStartJobAction } from './tech-actions';
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
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number | null;
  notes?: string | null;
};

function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

function telHref(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits ? `tel:+1${digits.length === 10 ? digits : digits}` : `tel:${phone}`;
}

export function TechJobsClient({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return <p className='text-sm text-zinc-500'>No jobs assigned to you yet.</p>;
  }

  return (
    <div className='space-y-4'>
      {jobs.map((job) => {
        const price = job.base_price_cents && job.base_price_cents > 0 ? job.base_price_cents / 100 : null;
        const locationHint = job.notes?.trim() || job.vehicle_description?.trim() || '';
        const phone = job.guest_phone?.trim() || '';

        return (
          <article key={job.id} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
            <div className='flex flex-wrap items-start justify-between gap-4'>
              <div className='min-w-0 flex-1'>
                <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>{job.status.replace(/_/g, ' ')}</p>
                <h3 className='mt-1 text-lg font-black uppercase text-white'>{job.service_slug.replace(/-/g, ' ')}</h3>
                <p className='text-sm text-zinc-400'>{new Date(job.scheduled_start).toLocaleString()}</p>
                <p className='mt-2 text-sm text-zinc-300'>Customer: {job.guest_name ?? 'Guest'}</p>
                <p className='text-xs text-zinc-500'>Vehicle: {formatVehicleClassLabel(job.vehicle_class)}</p>
                {price != null ? (
                  <p className='mt-1 text-xs font-semibold text-emerald-300/90'>Job value · ${price.toFixed(0)}</p>
                ) : null}
                {locationHint ? <p className='mt-2 text-xs text-zinc-400'>{locationHint}</p> : null}
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
                {locationHint.length > 8 ? (
                  <a
                    href={mapsUrl(locationHint)}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='rounded-lg border border-white/20 px-4 py-2 text-center text-xs font-bold uppercase tracking-wider text-zinc-200 hover:border-gold/40'
                  >
                    Directions
                  </a>
                ) : null}
                {['assigned', 'confirmed'].includes(job.status) ? (
                  <form action={techStartJobAction}>
                    <input type='hidden' name='appointmentId' value={job.id} />
                    <button type='submit' className='w-full rounded-lg bg-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-black'>
                      Start job
                    </button>
                  </form>
                ) : null}
                {job.status === 'in_progress' ? (
                  <form action={techCompleteJobAction}>
                    <input type='hidden' name='appointmentId' value={job.id} />
                    <button
                      type='submit'
                      className='w-full rounded-lg border border-emerald-500/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300'
                    >
                      Mark complete
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
            <TechJobWorkspace job={{ ...job, service_slug: job.service_slug }} />
            <p className='mt-3 text-xs text-zinc-600'>On-site liability acknowledgment must be on file before completion.</p>
          </article>
        );
      })}
    </div>
  );
}
