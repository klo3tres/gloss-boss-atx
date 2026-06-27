'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  previewWorkOrderScheduleNotifyAction,
  updateWorkOrderScheduleAction,
} from '@/app/(dashboard)/tech/work-order-pricing-actions';
import { useOutboundPreview } from '@/components/admin/outbound-message-provider';
import { buildToneVariants } from '@/lib/outbound-message-tones';

function toLocalInput(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultDurationMinutes(startIso: string, endIso?: string) {
  if (!endIso) return 120;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 120;
  return Math.max(30, Math.round((end - start) / 60_000));
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
  const { openPreview } = useOutboundPreview();
  const [pending, startTransition] = useTransition();
  const [allowConflict, setAllowConflict] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);
  const initialDuration = useMemo(() => defaultDurationMinutes(scheduledStart, scheduledEnd), [scheduledStart, scheduledEnd]);
  const [durationMinutes, setDurationMinutes] = useState(initialDuration);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const saveSchedule = (fd: FormData, notifyBodies?: { email?: string; sms?: string }) => {
    if (notifyBodies?.email) fd.set('customNotifyEmailBody', notifyBodies.email);
    if (notifyBodies?.sms) fd.set('customNotifySmsBody', notifyBodies.sms);
    startTransition(async () => {
      setMsg(null);
      const res = await updateWorkOrderScheduleAction(fd);
      if (res.ok) {
        setMsg({
          tone: 'ok',
          text: res.conflict
            ? 'Saved with override — calendar & availability updated.'
            : 'Schedule updated — Titan block, Google Calendar, and availability synced.',
        });
        router.refresh();
      } else {
        setMsg({ tone: 'err', text: res.error ?? 'Could not update schedule' });
      }
    });
  };

  return (
    <form
      className="gb-glass rounded-2xl border border-gold/20 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData();
        fd.set('appointmentId', appointmentId);
        fd.set('source', 'appointment');
        const when = (e.currentTarget.elements.namedItem('when') as HTMLInputElement).value;
        fd.set('scheduledStart', when);
        fd.set('durationMinutes', String(durationMinutes));
        fd.set('notifyCustomer', notifyCustomer ? 'true' : 'false');
        if (allowConflict) {
          fd.set('allowScheduleConflict', 'true');
          fd.set('overrideReason', (e.currentTarget.elements.namedItem('reason') as HTMLInputElement).value);
        }

        const startChanged = new Date(when).toISOString() !== new Date(scheduledStart).toISOString();
        if (notifyCustomer && startChanged) {
          startTransition(async () => {
            const preview = await previewWorkOrderScheduleNotifyAction({
              appointmentId,
              scheduledStart: when,
            });
            if (preview.error) {
              setMsg({ tone: 'err', text: preview.error });
              return;
            }
            const channel = preview.phone ? 'sms' : 'email';
            const recipient = preview.phone || preview.email || '';
            if (!recipient) {
              saveSchedule(fd);
              return;
            }
            const baseBody = channel === 'sms' ? preview.smsBody! : preview.emailBody!;
            const tones = buildToneVariants(baseBody, { name: preview.guestName });
            openPreview({
              title: 'Notify customer — time change',
              channel,
              recipient,
              body: tones.professional,
              subject: 'Gloss Boss ATX — Appointment time updated',
              toneVariants: tones,
              contextLabel: `Work order · ${preview.guestName}`,
              onSend: async (final) => {
                saveSchedule(fd, channel === 'sms' ? { sms: final.body } : { email: final.body });
                return { ok: true };
              },
            });
          });
          return;
        }
        saveSchedule(fd);
      }}
    >
      <p className="text-xs font-black uppercase tracking-widest text-gold-soft">Job time & duration</p>
      <p className="mt-1 text-xs text-zinc-500">
        Adjust start time or estimated duration. Blocks booking slots and updates Google Calendar when connected.
      </p>
      <label className="mt-3 block text-xs text-zinc-400">
        Appointment start
        <input
          name="when"
          type="datetime-local"
          defaultValue={toLocalInput(scheduledStart)}
          className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
          required
        />
      </label>
      <label className="mt-3 block text-xs text-zinc-400">
        Estimated duration (minutes)
        <input
          name="durationMinutes"
          type="number"
          min={30}
          step={15}
          value={durationMinutes}
          onChange={(e) => setDurationMinutes(Number(e.target.value) || initialDuration)}
          className="mt-1 block w-full max-w-xs rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white"
        />
      </label>
      {scheduledEnd ? <p className="mt-2 text-[11px] text-zinc-600">Previous estimated end: {scheduledEnd}</p> : null}
      <label className="mt-3 flex items-center gap-2 text-xs text-zinc-300">
        <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
        Notify customer if start time changed (preview before send)
      </label>
      <label className="mt-2 flex items-center gap-2 text-xs text-amber-200">
        <input type="checkbox" checked={allowConflict} onChange={(e) => setAllowConflict(e.target.checked)} />
        Override schedule conflict (admin)
      </label>
      {allowConflict ? (
        <input
          name="reason"
          placeholder="Why this slot despite conflict"
          className="mt-2 block w-full rounded-lg border border-amber-500/40 bg-black px-3 py-2 text-sm text-white"
          required
        />
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-50"
      >
        {pending ? 'Saving…' : 'Save schedule'}
      </button>
      {msg ? <p className={`mt-2 text-sm ${msg.tone === 'ok' ? 'text-emerald-300' : 'text-red-300'}`}>{msg.text}</p> : null}
    </form>
  );
}
