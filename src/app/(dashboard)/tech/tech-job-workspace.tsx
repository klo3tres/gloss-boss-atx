'use client';

import { techAddJobMediaAction, techSaveJobNotesAction } from './tech-actions';

type Job = {
  id: string;
  status: string;
  notes?: string | null;
};

export function TechJobWorkspace({ job }: { job: Job }) {
  const showWorkspace = ['assigned', 'confirmed', 'in_progress'].includes(job.status);

  if (!showWorkspace) return null;

  return (
    <div className='mt-4 space-y-4 border-t border-white/10 pt-4'>
      <form action={techSaveJobNotesAction} className='space-y-2'>
        <input type='hidden' name='appointmentId' value={job.id} />
        <label className='block text-xs text-zinc-400'>
          Job notes
          <textarea
            name='notes'
            defaultValue={job.notes ?? ''}
            rows={3}
            placeholder='Before / during / after notes, checklist, upsell ideas…'
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <button type='submit' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft'>
          Save notes
        </button>
      </form>

      <form action={techAddJobMediaAction} className='grid gap-2 sm:grid-cols-[1fr_2fr_auto]'>
        <input type='hidden' name='appointmentId' value={job.id} />
        <label className='block text-xs text-zinc-400'>
          Photo type
          <select name='category' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
            <option value='before'>Before</option>
            <option value='inspection'>During / inspection</option>
            <option value='after'>After</option>
            <option value='other'>Other</option>
          </select>
        </label>
        <label className='block text-xs text-zinc-400 sm:col-span-1'>
          Image URL
          <input
            name='fileUrl'
            type='url'
            placeholder='https://…'
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <button
          type='submit'
          className='self-end rounded-lg border border-white/20 px-3 py-2 text-xs font-bold uppercase text-white'
        >
          Add photo
        </button>
      </form>
      <p className='text-[10px] text-zinc-600'>Paste a hosted image URL (storage upload can be added when bucket is configured).</p>
    </div>
  );
}
