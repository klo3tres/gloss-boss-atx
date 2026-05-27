'use client';

import { useState } from 'react';

export function CustomerBookingLifecycle({
  appointmentId,
  token,
}: {
  appointmentId: string;
  token: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('09:00');

  const call = async (body: Record<string, string>) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/public/appointment-lifecycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appointmentId, token, ...body }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setMsg(j.error ?? 'Request failed');
        return;
      }
      setMsg(j.message ?? 'Done.');
    } catch {
      setMsg('Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className='rounded-2xl border border-white/10 bg-black/50 p-5 text-sm'>
      <p className='font-black uppercase tracking-wider text-gold-soft'>Need to change your appointment?</p>
      <p className='mt-2 text-xs text-zinc-400'>Cancel frees your slot. Reschedule sends updated confirmation email.</p>
      {msg ? <p className='mt-3 text-xs text-emerald-200'>{msg}</p> : null}
      <div className='mt-4 flex flex-wrap gap-2'>
        <button
          type='button'
          disabled={busy}
          onClick={() => setShowReschedule((v) => !v)}
          className='rounded-xl border border-gold/40 px-4 py-2 text-xs font-black uppercase text-gold-soft'
        >
          Reschedule
        </button>
        <button
          type='button'
          disabled={busy}
          onClick={() => {
            if (!window.confirm('Cancel this appointment?')) return;
            void call({ action: 'cancel', reason: 'Cancelled by customer' });
          }}
          className='rounded-xl border border-red-500/40 px-4 py-2 text-xs font-black uppercase text-red-200'
        >
          Cancel booking
        </button>
      </div>
      {showReschedule ? (
        <div className='mt-4 grid gap-2 sm:grid-cols-2'>
          <label className='text-xs text-zinc-400'>
            New date
            <input type='date' value={newDate} onChange={(e) => setNewDate(e.target.value)} className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-white' />
          </label>
          <label className='text-xs text-zinc-400'>
            New time
            <input type='time' value={newTime} onChange={(e) => setNewTime(e.target.value)} className='mt-1 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-white' />
          </label>
          <button
            type='button'
            disabled={busy || !newDate}
            onClick={() => {
              const iso = new Date(`${newDate}T${newTime}`).toISOString();
              void call({ action: 'reschedule', newScheduledStart: iso, reason: 'Rescheduled by customer' });
            }}
            className='rounded-xl bg-gold px-4 py-2 text-xs font-black uppercase text-black sm:col-span-2'
          >
            Confirm new time
          </button>
        </div>
      ) : null}
    </section>
  );
}
