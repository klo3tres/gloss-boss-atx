'use client';

import { techCompleteJobAction, techStartJobAction } from './tech-actions';
import { TechJobWorkspace } from './tech-job-workspace';

type Job = {
  id: string;
  status: string;
  scheduled_start: string;
  guest_name: string | null;
  service_slug: string;
  vehicle_class: string;
  notes?: string | null;
};

export function TechJobsClient({ jobs }: { jobs: Job[] }) {
  if (jobs.length === 0) {
    return <p className='text-sm text-zinc-500'>No jobs assigned to you yet.</p>;
  }

  return (
    <div className='space-y-4'>
      {jobs.map((job) => (
        <article key={job.id} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div>
              <p className='text-xs uppercase tracking-[0.2em] text-gold-soft'>{job.status}</p>
              <h3 className='mt-1 text-lg font-black uppercase text-white'>{job.service_slug.replace(/-/g, ' ')}</h3>
              <p className='text-sm text-zinc-400'>{new Date(job.scheduled_start).toLocaleString()}</p>
              <p className='mt-2 text-sm text-zinc-300'>Customer: {job.guest_name ?? 'Guest'}</p>
              <p className='text-xs text-zinc-500'>Vehicle class: {job.vehicle_class}</p>
            </div>
            <div className='flex flex-col gap-2'>
              {['assigned', 'confirmed'].includes(job.status) ? (
                <form action={techStartJobAction}>
                  <input type='hidden' name='appointmentId' value={job.id} />
                  <button type='submit' className='rounded-lg bg-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-black'>
                    Start job
                  </button>
                </form>
              ) : null}
              {job.status === 'in_progress' ? (
                <form action={techCompleteJobAction}>
                  <input type='hidden' name='appointmentId' value={job.id} />
                  <button type='submit' className='rounded-lg border border-emerald-500/50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-emerald-300'>
                    Mark complete
                  </button>
                </form>
              ) : null}
            </div>
          </div>
          <TechJobWorkspace job={job} />
          <p className='mt-3 text-xs text-zinc-600'>Completion requires a signed on-site agreement in the database.</p>
        </article>
      ))}
    </div>
  );
}
