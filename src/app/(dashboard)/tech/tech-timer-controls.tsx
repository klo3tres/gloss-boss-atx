'use client';

import { useEffect, useMemo, useState } from 'react';

export function TechTimerControls({
  appointmentId,
  fallbackBookingId,
  workflowSessionId,
  initialTimerId,
  initialStartedAt,
  compact = false,
}: {
  appointmentId?: string | null;
  fallbackBookingId?: string | null;
  workflowSessionId?: string | null;
  initialTimerId?: string | null;
  initialStartedAt?: string | null;
  compact?: boolean;
}) {
  const [timerId, setTimerId] = useState(initialTimerId ?? '');
  const [startedAt, setStartedAt] = useState(initialStartedAt ?? '');
  const [now, setNow] = useState(() => Date.now());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!timerId || !startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timerId, startedAt]);

  const elapsedLabel = useMemo(() => {
    if (!timerId || !startedAt) return '00:00:00';
    const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
    const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  }, [now, startedAt, timerId]);

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
    const json = (await res.json().catch(() => ({}))) as { id?: string; startedAt?: string; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMessage(json.error ?? 'Timer action failed.');
      return;
    }
    if (action === 'start' && json.id) {
      setTimerId(json.id);
      setStartedAt(json.startedAt ?? new Date().toISOString());
      setNow(Date.now());
    }
    if (action === 'stop') {
      setTimerId('');
      setStartedAt('');
    }
    setMessage(action === 'start' ? 'Timer running.' : 'Timer stopped.');
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compact ? 'text-[10px]' : ''}`}>
      <span className='rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm font-black text-white shadow-inner'>
        {elapsedLabel}
      </span>
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
