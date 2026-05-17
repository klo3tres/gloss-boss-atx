'use client';

import { useState } from 'react';

export function TechTimerControls({
  appointmentId,
  fallbackBookingId,
  workflowSessionId,
  initialTimerId,
}: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  workflowSessionId?: string | null;
  initialTimerId?: string | null;
}) {
  const [timerId, setTimerId] = useState(initialTimerId ?? '');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (action: 'start' | 'stop') => {
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/tech/job-timer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        timerId,
        appointmentId: appointmentId || undefined,
        fallbackBookingId: fallbackBookingId || undefined,
        workflowSessionId: workflowSessionId || undefined,
        label: 'Active work order timer',
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? 'Timer action failed.');
      return;
    }
    if (action === 'start' && json.id) setTimerId(json.id);
    if (action === 'stop') setTimerId('');
    setMessage(action === 'start' ? 'Timer running.' : 'Timer stopped.');
  };

  return (
    <div className='flex flex-wrap items-center gap-2'>
      {timerId ? (
        <button type='button' disabled={busy} onClick={() => void send('stop')} className='rounded-lg border border-amber-500/35 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-200 disabled:opacity-50'>
          Stop Timer
        </button>
      ) : (
        <button type='button' disabled={busy} onClick={() => void send('start')} className='rounded-lg border border-emerald-500/35 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-200 disabled:opacity-50'>
          Start / Resume Timer
        </button>
      )}
      {message ? <span className='text-[10px] text-zinc-400'>{message}</span> : null}
    </div>
  );
}
