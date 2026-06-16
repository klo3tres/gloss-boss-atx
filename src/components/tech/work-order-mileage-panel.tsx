'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { addJobMileageLogActionState } from '@/app/(dashboard)/admin/operations/operations-actions';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { getBusinessHomeBaseAddress } from '@/lib/business-location';

export function WorkOrderMileagePanel({
  appointmentId,
  workOrderPath,
}: {
  appointmentId?: string;
  workOrderPath: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className='gb-premium-card mt-4 rounded-2xl border border-white/10 p-4'>
      <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Mileage</p>
      <p className='mt-1 text-xs text-zinc-500'>
        Log round-trip or manual miles for this job. Home base: {getBusinessHomeBaseAddress()}. Set{' '}
        <code className='text-zinc-400'>BUSINESS_HOME_BASE_ADDRESS</code> in env for exact routing. Automatic distance from maps requires{' '}
        <code className='text-zinc-400'>GOOGLE_MAPS_API_KEY</code>.
      </p>
      {msg ? <p className='mt-2 text-xs text-emerald-200'>{msg}</p> : null}
      <ToastActionForm
        className='mt-3 grid gap-2 sm:grid-cols-3'
        action={async (prev, fd) => {
          const r = await addJobMileageLogActionState(prev, fd);
          setMsg(r.ok ? r.message ?? 'Logged' : r.error ?? 'Failed');
          if (r.ok) router.refresh();
          return r;
        }}
      >
        {appointmentId ? <input type='hidden' name='appointmentId' value={appointmentId} /> : null}
        <input type='hidden' name='workOrderPath' value={workOrderPath} />
        <label className='text-xs text-zinc-400 sm:col-span-1'>
          Miles
          <input name='miles' type='number' step='0.1' min='0.1' className='gb-input mt-1 w-full' required placeholder='Round trip' />
        </label>
        <label className='text-xs text-zinc-400 sm:col-span-2'>
          Notes
          <input name='note' className='gb-input mt-1 w-full' placeholder='Base → customer → base' />
        </label>
        <div className='sm:col-span-3'>
          <SubmitStatusButton pendingText='Saving…' className='rounded-xl border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-black uppercase text-gold-soft'>
            Log mileage
          </SubmitStatusButton>
        </div>
      </ToastActionForm>
    </section>
  );
}
