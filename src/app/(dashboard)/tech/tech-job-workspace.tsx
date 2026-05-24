'use client';

import { useState, useTransition } from 'react';
import { techSaveChecklistSnapshotAction, techSaveJobNotesAction } from './tech-actions';
import { checklistForServiceSlug } from '@/lib/tech-service-checklist';

type Job = {
  id: string;
  status: string;
  service_slug?: string;
  notes?: string | null;
  fallback_booking_id?: string | null;
  workflowSessionId?: string | null;
  isFallback?: boolean;
};

export function TechJobWorkspace({ job, hasIntake }: { job: Job; hasIntake?: boolean }) {
  const showWorkspace = ['assigned', 'confirmed', 'in_progress'].includes(job.status);
  const checklist = checklistForServiceSlug(job.service_slug ?? '');
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [chkMsg, setChkMsg] = useState<string | null>(null);
  const [noteMsg, setNoteMsg] = useState<string | null>(null);
  const [photoPhase, setPhotoPhase] = useState<'before' | 'after'>('before');
  const [photoCategory, setPhotoCategory] = useState('front');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [photoPending, setPhotoPending] = useState(false);
  const [pendingChk, startChkTransition] = useTransition();

  if (!showWorkspace) return null;

  const saveChecklist = (nextChecked = checked) => {
    const items = checklist.filter((item) => nextChecked[item]);
    startChkTransition(() => {
      void techSaveChecklistSnapshotAction(job.id, JSON.stringify(items)).then(() => {
        setChkMsg(
          items.length === checklist.length
            ? 'Checklist complete and saved.'
            : `Saved ${items.length} of ${checklist.length} checklist item(s).`,
        );
      });
    });
  };

  const uploadPhoto = async (file: File | null | undefined) => {
    if (!file) return;
    setPhotoPending(true);
    setPhotoMsg(null);
    setPhotoPreview(URL.createObjectURL(file));
    const fd = new FormData();
    if (!job.isFallback) fd.set('appointmentId', job.id);
    if (job.fallback_booking_id) fd.set('fallbackBookingId', job.fallback_booking_id);
    if (job.workflowSessionId) {
      fd.set('workflowSessionId', job.workflowSessionId);
      fd.set('techWorkflowSessionId', job.workflowSessionId);
    }
    fd.set('category', photoPhase);
    fd.set('photoCategory', photoCategory);
    fd.set('file', file);
    const res = await fetch('/api/tech/job-media-upload', { method: 'POST', body: fd });
    const json = (await res.json().catch(() => ({}))) as { error?: string; url?: string; ok?: boolean };
    setPhotoPending(false);
    if (!res.ok || json.ok === false) {
      setPhotoMsg(json.error ?? 'Photo upload failed.');
      return;
    }
    if (json.url) setPhotoPreview(json.url);
    setPhotoMsg(`${photoPhase === 'before' ? 'Before' : 'After'} ${photoCategory.replace(/_/g, ' ')} photo uploaded.`);
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
                  onChange={(e) => {
                    const next = { ...checked, [item]: e.target.checked };
                    setChecked(next);
                    saveChecklist(next);
                  }}
                className='rounded border-zinc-600'
              />
              {item}
            </li>
          ))}
        </ul>
        <button
          type='button'
          disabled={pendingChk}
          onClick={() => saveChecklist()}
          className='mt-3 rounded-lg border border-white/20 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-zinc-200 disabled:opacity-40'
        >
          {pendingChk ? 'Saving…' : 'Save Checklist'}
        </button>
        {chkMsg ? <p className='mt-2 text-[10px] text-zinc-500'>{chkMsg}</p> : null}
      </div>

      <form
        action={async (formData) => {
          setNoteMsg(null);
          await techSaveJobNotesAction(formData);
          setNoteMsg('Notes saved to this work order.');
        }}
        className='space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3'
      >
        {!job.isFallback ? <input type='hidden' name='appointmentId' value={job.id} /> : null}
        {job.fallback_booking_id ? <input type='hidden' name='fallbackBookingId' value={job.fallback_booking_id} /> : null}
        {job.workflowSessionId ? <input type='hidden' name='workflowSessionId' value={job.workflowSessionId} /> : null}
        <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Work order notes</p>
        <label className='block text-xs text-zinc-400'>
          Internal notes
          <textarea
            name='internalNotes'
            defaultValue={job.notes ?? ''}
            rows={3}
            placeholder='Internal team notes, special handling, customer context…'
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <div className='grid gap-3 md:grid-cols-2'>
          <label className='block text-xs text-zinc-400'>
            Before notes
            <textarea name='beforeNotes' rows={2} placeholder='Initial condition, pre-existing issues…' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='block text-xs text-zinc-400'>
            After notes
            <textarea name='afterNotes' rows={2} placeholder='Final result, finishing details…' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='block text-xs text-zinc-400'>
            Damage notes
            <textarea name='damageNotes' rows={2} placeholder='Damage observed or no visible damage…' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
          <label className='block text-xs text-zinc-400'>
            Upsell notes
            <textarea name='upsellNotes' rows={2} placeholder='Recommended add-ons or future service…' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          </label>
        </div>
        <label className='block text-xs text-zinc-400'>
          Customer-visible notes
          <textarea name='notes' rows={2} placeholder='Summary safe to show the customer…' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
        </label>
        <label className='flex items-center gap-2 text-xs text-zinc-300'>
          <input type='checkbox' name='customerVisible' className='rounded border-zinc-600' />
          Mark customer-visible summary
        </label>
        <button type='submit' className='rounded-lg border border-gold/40 px-3 py-2 text-xs font-bold uppercase text-gold-soft'>
          Save notes
        </button>
        {noteMsg ? <p className='text-xs text-emerald-300'>{noteMsg}</p> : null}
      </form>

      {job.status === 'in_progress' ? (
        <section className='rounded-2xl border border-gold/20 bg-black/30 p-3'>
          <p className='text-xs font-bold uppercase tracking-wider text-gold-soft'>Work order photos</p>
          <p className='mt-1 text-[10px] text-zinc-500'>Tap a category to take a mobile photo or upload from this device.</p>
          <div className='mt-3 grid gap-2 sm:grid-cols-3'>
            <label className='block text-xs text-zinc-400'>
              Phase
              <select value={photoPhase} onChange={(e) => setPhotoPhase(e.target.value as 'before' | 'after')} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
                <option value='before'>Before</option>
                <option value='after'>After</option>
              </select>
            </label>
            <label className='block text-xs text-zinc-400'>
              Category
              <select value={photoCategory} onChange={(e) => setPhotoCategory(e.target.value)} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
                <option value='front'>Front</option>
                <option value='rear'>Rear</option>
                <option value='driver_side'>Driver side</option>
                <option value='passenger_side'>Passenger side</option>
                <option value='interior'>Interior</option>
                <option value='wheels'>Wheels</option>
                <option value='damage'>Damage</option>
                <option value='other'>Other</option>
              </select>
            </label>
            <label className='flex cursor-pointer items-center justify-center rounded-xl border border-gold/35 bg-gold/10 px-3 py-3 text-center text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/15'>
              {photoPending ? 'Uploading...' : 'Take / Upload Photo'}
              <input
                type='file'
                accept='image/*'
                capture='environment'
                className='sr-only'
                disabled={photoPending}
                onChange={(e) => {
                  void uploadPhoto(e.target.files?.[0]);
                  e.currentTarget.value = '';
                }}
              />
            </label>
          </div>
          {photoPreview ? (
            <div className='mt-3 flex items-center gap-3'>
              <img src={photoPreview} alt='Uploaded work order preview' className='h-20 w-20 rounded-xl border border-white/10 object-cover' />
              <p className='text-xs text-zinc-400'>{photoMsg ?? 'Preview ready.'}</p>
            </div>
          ) : photoMsg ? (
            <p className='mt-2 text-xs text-amber-200'>{photoMsg}</p>
          ) : null}
        </section>
      ) : (
        <p className='rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-zinc-500'>
          Photo uploads unlock after the job is started.
        </p>
      )}
    </div>
  );
}
