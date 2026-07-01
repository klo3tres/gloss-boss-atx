'use client';

import { useRef, useState, useTransition } from 'react';
import {
  adminRescheduleAppointmentAction,
  previewRescheduleAppointmentAction,
} from '@/app/(dashboard)/admin/appointment-lifecycle-actions';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { useToast } from '@/components/ui/toast-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';
import { useRouter } from 'next/navigation';

export function AppointmentScheduleControls({
  appointmentId,
  scheduledStart,
}: {
  appointmentId: string;
  scheduledStart?: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const customEmailRef = useRef<HTMLInputElement>(null);
  const customSmsRef = useRef<HTMLInputElement>(null);

  const d = scheduledStart ? new Date(scheduledStart) : null;
  const dateDefault = d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : '';
  const timeDefault =
    d && !Number.isNaN(d.getTime())
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : '09:00';

  const submitReschedule = (fd: FormData) => {
    startTransition(async () => {
      setMsg(null);
      const res = await adminRescheduleAppointmentAction(fd);
      if (res.error) {
        setMsg(res.error);
        toast.error('Schedule update failed', res.error);
      } else {
        setMsg(res.message ?? 'Rescheduled.');
        if (res.tone === 'warning') toast.warning('Rescheduled', res.message ?? 'Updated with warnings.');
        else toast.success('Rescheduled', res.message ?? 'Appointment rescheduled.');
        router.refresh();
      }
    });
  };

  const previewAndReschedule = () => {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const date = String(fd.get('date') ?? '');
    const time = String(fd.get('time') ?? '');
    startTransition(async () => {
      setMsg(null);
      const preview = await previewRescheduleAppointmentAction({ appointmentId, date, time });
      if (preview.error) {
        setMsg(preview.error);
        return;
      }
      const channel = preview.phone ? 'sms' : 'email';
      const recipient = preview.phone || preview.email || '';
      if (!recipient) {
        setMsg('No customer contact on file — reschedule without notify?');
        submitReschedule(fd);
        return;
      }
      const baseBody = channel === 'sms' ? preview.smsBody! : preview.emailBody!;
      const tones = buildToneVariants(baseBody, { name: preview.guestName });
      openPreview({
        title: channel === 'sms' ? 'Reschedule notice (SMS)' : 'Reschedule notice (email)',
        channel,
        recipient,
        body: tones.professional,
        subject: preview.emailSubject,
        toneVariants: tones,
        contextLabel: `Booking · ${preview.guestName}`,
        onSend: async (final) => {
          if (channel === 'sms') {
            if (customSmsRef.current) customSmsRef.current.value = final.body;
          } else if (customEmailRef.current) {
            customEmailRef.current.value = final.body;
            const sub = form.querySelector<HTMLInputElement>('input[name="customEmailSubject"]');
            if (sub) sub.value = final.subject ?? preview.emailSubject ?? '';
          }
          const out = new FormData(form);
          if (channel === 'sms' && customSmsRef.current) out.set('customSmsBody', customSmsRef.current.value);
          if (channel === 'email' && customEmailRef.current) {
            out.set('customEmailBody', customEmailRef.current.value);
            out.set('customEmailSubject', final.subject ?? preview.emailSubject ?? '');
          }
          await adminRescheduleAppointmentAction(out);
          router.refresh();
          return { ok: true };
        },
      });
    });
  };

  return (
    <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">Cancel / reschedule</p>
      <p className="mt-1 text-xs text-zinc-400">
        Frees the slot for other bookings. Preview customer notice before sending.
      </p>
      <form ref={formRef} className="mt-4 grid gap-2 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <input type="hidden" name="customEmailBody" ref={customEmailRef} defaultValue="" />
        <input type="hidden" name="customSmsBody" ref={customSmsRef} defaultValue="" />
        <input type="hidden" name="customEmailSubject" defaultValue="" />
        <label className="text-xs text-zinc-400">
          New date
          <input
            name="date"
            type="date"
            required
            defaultValue={dateDefault}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400">
          New time
          <input
            name="time"
            type="time"
            required
            defaultValue={timeDefault}
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white"
          />
        </label>
        <label className="text-xs text-zinc-400 sm:col-span-2">
          Note
          <input
            name="reason"
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white"
            placeholder="Customer requested new time"
          />
        </label>
        <button
          type="button"
          disabled={pending}
          onClick={previewAndReschedule}
          className="rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black sm:col-span-2 disabled:opacity-50"
        >
          {pending ? 'Loading…' : 'Preview & reschedule'}
        </button>
      </form>
      {msg ? <p className="mt-2 text-xs text-amber-200">{msg}</p> : null}
      <form
        className="mt-4 border-t border-white/10 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const { adminCancelAppointmentAction } = await import('@/app/(dashboard)/admin/appointment-lifecycle-actions');
            const res = await adminCancelAppointmentAction(fd);
            setMsg(res.error ?? res.message ?? 'Cancelled.');
            if (res.error) toast.error('Cancel failed', res.error);
            else if (res.tone === 'warning') toast.warning('Cancelled', res.message ?? 'Appointment cancelled.');
            else toast.success('Cancelled', res.message ?? 'Appointment cancelled.');
            if (!res.error) router.refresh();
          });
        }}
      >
        <input type="hidden" name="appointmentId" value={appointmentId} />
        <label className="block text-xs text-zinc-400">
          Cancel reason
          <input
            name="reason"
            required
            className="mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-sm text-white"
            placeholder="Customer cancelled"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs font-black uppercase text-red-200 disabled:opacity-50"
        >
          Cancel appointment
        </button>
      </form>
    </section>
  );
}
