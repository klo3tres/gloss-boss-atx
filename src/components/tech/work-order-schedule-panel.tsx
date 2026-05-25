'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateWorkOrderScheduleAction } from '@/app/(dashboard)/tech/work-order-pricing-actions';

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function WorkOrderSchedulePanel({
  appointmentId,
  scheduledStart,
  scheduledEnd,
}: {
  appointmentId: string;
  scheduledStart: string;
  scheduledEnd?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [allowConflict, setAllowConflict] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  return (
    <form
      className='gb-glass rounded-2xl border border-gold/20 p-4'
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('appointmentId', appointmentId);
        fd.set('source', 'appointment');
        fd.set('scheduledStart', (e.currentTarget.elements.namedItem('when') as HTMLInputElement).value);
        if (allowConflict) {
          fd.set('allowScheduleConflict', 'true');
          fd.set('overrideReason', (e.currentTarget.elements.namedItem('reason') as HTMLInputElement).value);
        }
        startTransition(async () => {
          setMsg(null);
          const res = await updateWorkOrderScheduleAction(fd);
          if (res.ok) {
            setMsg({
              tone: 'ok',
              text: res.conflict ? 'Saved with schedule override (conflict acknowledged).' : 'Schedule updated.',
            });
            router.refresh();
          } else {
            setMsg({ tone: 'err', text: res.error ?? 'Could not update schedule' });
          }
        });
      }}
    >
      <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Reschedule</p>
      {scheduledEnd ? <p className='mt-1 text-xs text-zinc-500'>Estimated end: {scheduledEnd}</p> : null}
      <label className='mt-3 block text-xs text-zinc-400'>
        Appointment start
        <input
          name='when'
          type='datetime-local'
          defaultValue={toLocalInput(scheduledStart)}
          className='mt-1 block w-full max-w-xs rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          required
        />
      </label>
      <label className='mt-3 flex items-center gap-2 text-xs text-amber-200'>
        <input type='checkbox' checked={allowConflict} onChange={(e) => setAllowConflict(e.target.checked)} />
        Override schedule conflict (admin)
      </label>
      {allowConflict ? (
        <input
          name='reason'
          placeholder='Why this slot despite conflict'
          className='mt-2 block w-full rounded-lg border border-amber-500/40 bg-black px-3 py-2 text-sm text-white'
          required
        />
      ) : null}
      <button
        type='submit'
        disabled={pending}
        className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50'
      >
        {pending ? 'Saving…' : 'Update schedule'}
      </button>
      {msg ? <p className={`mt-2 text-sm ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p> : null}
    </form>
  );
}
