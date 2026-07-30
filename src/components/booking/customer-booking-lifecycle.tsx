'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

function chicagoDateKey() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return `${year}-${month}-${day}`;
}

export function CustomerBookingLifecycle({
  appointmentId,
  token,
  scheduledStart,
  canReschedule,
  canCancel,
}: {
  appointmentId: string;
  token: string;
  scheduledStart: string;
  canReschedule: boolean;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<'success' | 'warning' | 'error'>('success');
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('09:00');
  const [availableSlots, setAvailableSlots] = useState<Array<{ time: string; label: string }>>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [currentScheduledStart, setCurrentScheduledStart] = useState(scheduledStart);
  const chicagoToday = chicagoDateKey();

  useEffect(() => {
    if (!showReschedule || !newDate) {
      setAvailableSlots([]);
      setSlotsError(null);
      return;
    }
    const controller = new AbortController();
    setSlotsLoading(true);
    setSlotsError(null);
    void fetch(
      `/api/public/appointment-lifecycle?appointmentId=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}&date=${encodeURIComponent(newDate)}`,
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (response) => {
        const json = (await response.json().catch(() => null)) as {
          slots?: Array<{ time: string; label: string }>;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(json?.error ?? 'Availability could not be loaded.');
        const slots = Array.isArray(json?.slots) ? json.slots : [];
        setAvailableSlots(slots);
        setNewTime((current) =>
          slots.some((slot) => slot.time === current) ? current : slots[0]?.time ?? '',
        );
        if (slots.length === 0) setSlotsError('No times fit this service on that date. Choose another date.');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setAvailableSlots([]);
        setNewTime('');
        setSlotsError(error instanceof Error ? error.message : 'Availability could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSlotsLoading(false);
      });
    return () => controller.abort();
  }, [appointmentId, newDate, showReschedule, token]);

  const call = async (body: Record<string, string>) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch('/api/public/appointment-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, token, ...body }),
        signal: controller.signal,
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: string;
        scheduledStart?: string;
        visibilityWarning?: boolean;
        warnings?: string[];
      } | null;
      if (!res.ok) {
        setMsgTone('error');
        setMsg(j?.error ?? 'The appointment could not be updated. Please retry.');
        return;
      }
      setMsgTone(j?.visibilityWarning ? 'error' : j?.warnings?.length ? 'warning' : 'success');
      setMsg(j?.message ?? 'Appointment updated.');
      if (j?.scheduledStart) {
        setCurrentScheduledStart(j.scheduledStart);
        setShowReschedule(false);
        setNewDate('');
      }
      router.refresh();
    } catch (error) {
      setMsgTone('error');
      setMsg(
        error instanceof DOMException && error.name === 'AbortError'
          ? 'The update is taking too long. Please retry; your original time is still shown below until the change is verified.'
          : 'Network error. Please check your connection and retry.',
      );
    } finally {
      window.clearTimeout(timeout);
      setBusy(false);
    }
  };

  const currentTimeLabel = (() => {
    const date = new Date(currentScheduledStart);
    if (Number.isNaN(date.getTime())) return 'Time unavailable';
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  })();

  return (
    <section className='rounded-2xl border border-white/10 bg-black/50 p-5 text-sm'>
      <p className='font-black uppercase tracking-wider text-gold-soft'>Need to change your appointment?</p>
      <p className='mt-2 text-sm font-bold text-white'>Current time: {currentTimeLabel} CT</p>
      <p className='mt-2 text-xs text-zinc-400'>
        {canReschedule || canCancel
          ? 'Cancel frees your slot. Reschedule sends updated confirmation email.'
          : 'Online changes are closed because this appointment has started, finished, or passed. Message Gloss Boss if you still need help.'}
      </p>
      {msg ? (
        <p
          aria-live='polite'
          className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
            msgTone === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : msgTone === 'warning'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-100'
              : 'border-red-500/30 bg-red-500/10 text-red-100'
          }`}
        >
          {msg}
        </p>
      ) : null}
      <div className='mt-4 flex flex-wrap gap-2'>
        {canReschedule ? <button
          type='button'
          disabled={busy}
          onClick={() => setShowReschedule((v) => !v)}
          className='rounded-xl border border-gold/40 px-4 py-2 text-xs font-black uppercase text-gold-soft'
        >
          Reschedule
        </button> : null}
        {canCancel ? <button
          type='button'
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Cancel this appointment?')) return;
            void call({ action: 'cancel', reason: 'Cancelled by customer' });
          }}
          className='rounded-xl border border-red-500/40 px-4 py-2 text-xs font-black uppercase text-red-200'
        >
          Cancel booking
        </button> : null}
      </div>
      {showReschedule && canReschedule ? (
        <div className='mt-4 grid gap-2 sm:grid-cols-2'>
          <label className='text-xs text-zinc-400'>
            New date
            <input type='date' min={chicagoToday} value={newDate} onChange={(e) => setNewDate(e.target.value)} className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-white' />
          </label>
          <label className='text-xs text-zinc-400'>
            Available time
            <select
              value={newTime}
              disabled={slotsLoading || availableSlots.length === 0}
              onChange={(event) => setNewTime(event.target.value)}
              className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-white disabled:opacity-50'
            >
              {slotsLoading ? <option value=''>Loading available times…</option> : null}
              {!slotsLoading && availableSlots.length === 0 ? <option value=''>Select a date</option> : null}
              {availableSlots.map((slot) => (
                <option key={slot.time} value={slot.time}>{slot.label} CT</option>
              ))}
            </select>
          </label>
          <p className='text-[11px] text-zinc-500 sm:col-span-2'>Only times that fit your full service and current Austin availability are shown.</p>
          {slotsError ? (
            <p className='rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100 sm:col-span-2'>
              {slotsError}
            </p>
          ) : null}
          <button
            type='button'
            disabled={busy || slotsLoading || !newDate || !newTime}
            onClick={() => {
              void call({
                action: 'reschedule',
                newDate,
                newTime,
                reason: 'Rescheduled by customer',
              });
            }}
            className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black sm:col-span-2'
          >
            {busy ? 'Saving new time…' : 'Confirm new time'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
