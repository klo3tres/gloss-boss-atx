'use client';

import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import {
  adminCancelAppointmentActionState,
  adminRescheduleAppointmentActionState,
} from '@/app/(dashboard)/admin/appointment-lifecycle-actions';

export function AppointmentScheduleControls({
  appointmentId,
  scheduledStart,
}: {
  appointmentId: string;
  scheduledStart?: string | null;
}) {
  const d = scheduledStart ? new Date(scheduledStart) : null;
  const dateDefault = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
  const timeDefault =
    d && !Number.isNaN(d.getTime())
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '09:00';

  return (
    <section className='rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4'>
      <p className='text-xs font-black uppercase tracking-[0.2em] text-amber-200'>Cancel / reschedule</p>
      <p className='mt-1 text-xs text-zinc-400'>Frees the slot for other bookings. Customer and owner get email when Resend is configured.</p>
      <ToastActionForm action={adminRescheduleAppointmentActionState} className='mt-4 grid gap-2 sm:grid-cols-2'>
        <input type='hidden' name='appointmentId' value={appointmentId} />
        <label className='text-xs text-zinc-400'>
          New date
          <input name='date' type='date' required defaultValue={dateDefault} className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
        </label>
        <label className='text-xs text-zinc-400'>
          New time
          <input name='time' type='time' required defaultValue={timeDefault} className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' />
        </label>
        <label className='text-xs text-zinc-400 sm:col-span-2'>
          Note
          <input name='reason' className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' placeholder='Customer requested new time' />
        </label>
        <SubmitStatusButton pendingText='Saving…' className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black sm:col-span-2'>
          Reschedule & notify
        </SubmitStatusButton>
      </ToastActionForm>
      <ToastActionForm action={adminCancelAppointmentActionState} className='mt-4 border-t border-white/10 pt-4'>
        <input type='hidden' name='appointmentId' value={appointmentId} />
        <label className='block text-xs text-zinc-400'>
          Cancel reason
          <input name='reason' required className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white' placeholder='Customer cancelled' />
        </label>
        <SubmitStatusButton pendingText='Cancelling…' className='mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-black uppercase text-red-200'>
          Cancel appointment
        </SubmitStatusButton>
      </ToastActionForm>
    </section>
  );
}
