'use client';

import { useState, useTransition } from 'react';
import { techAddJobMediaAction, techSaveChecklistSnapshotAction, techSaveJobNotesAction } from './tech-actions';
import { checklistForServiceSlug } from '@/lib/tech-service-checklist';

type Job = {
  id: string;
  status: string;
  service_slug?: string;
  notes?: string | null;
};

export function TechJobWorkspace({ job, hasIntake }: { job: Job; hasIntake?: boolean }) {
  const showWorkspace = ['assigned', 'confirmed', 'in_progress'].includes(job.status);
  const checklist = checklistForServiceSlug(job.service_slug ?? '');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [chkMsg, setChkMsg] = useState<string | null>(null);
  const [pendingChk, startChkTransition] = useTransition();

  if (!showWorkspace) return null;

  const logChecklist = () => {
    const items = checklist.filter((item) => checked[item]);
    startChkTransition(() => {
      void techSaveChecklistSnapshotAction(job.id, JSON.stringify(items)).then(() => {
        setChkMsg(
          items.length ? `Logged ${items.length} checklist item(s) to the timeline.` : 'Checklist snapshot sent (no items checked).',
        );
      });
    });
  };

  return (
    <div className='mt-4 space-y-4 border-t border-white/10 pt-4'>
      {hasIntake === false ? (
        <p className='rounded-lg border border-amber-500/35 bg-amber-500/10 p-3 text-xs text-amber-100'>
          Intake missing — share the customer&apos;s `/intake` link (appointment id + access token from their confirmation).
        </p>
      ) : null}

      <div>
        <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Service checklist</p>
        <ul className='mt-2 space-y-1'>
          {checklist.map((item) => (
            <li key={item} className='flex items-center gap-2 text-sm text-zinc-300'>
              <input
                type='checkbox'
                checked={Boolean(checked[item])}
                onChange={(e) => setChecked((c) => ({ ...c, [item]: e.target.checked }))}
                className='rounded border-zinc-600'
              />
              {item}
            </li>
          ))}
        </ul>
        <button
          type='button'
          disabled={pendingChk}
          onClick={logChecklist}
          className='mt-3 rounded-lg border border-white/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-200 disabled:opacity-40'
        >
          {pendingChk ? 'Saving…' : 'Log checklist to job timeline'}
        </button>
        {chkMsg ? <p className='mt-2 text-[10px] text-zinc-500'>{chkMsg}</p> : null}
      </div>

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
            <option value='damage'>Damage / concern</option>
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
