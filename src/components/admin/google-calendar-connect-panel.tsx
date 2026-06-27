'use client';

import { useEffect, useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

type Status = {
  configured: boolean;
  connected: boolean;
  email: string | null;
};

export function GoogleCalendarConnectPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => {
    void fetchWithTimeout('/api/admin/google-calendar/status', { credentials: 'same-origin', timeoutMs: 15000 })
      .then((r) => r.json())
      .then((d: Status & { ok?: boolean }) =>
        setStatus({ configured: Boolean(d.configured), connected: Boolean(d.connected), email: d.email ?? null }),
      )
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className='rounded-2xl border border-white/10 bg-black/45 p-5'>
      <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Google Calendar sync</p>
      <p className='mt-2 text-xs text-zinc-400'>
        Titan pushes bookings to your Google Calendar. Create, update, and cancel events from the site automatically.
      </p>
      {!status ? (
        <p className='mt-3 text-xs text-zinc-500'>Loading connection status…</p>
      ) : !status.configured ? (
        <p className='mt-3 text-xs text-amber-200'>
          Add <code className='text-gold-soft'>GOOGLE_CALENDAR_CLIENT_ID</code>,{' '}
          <code className='text-gold-soft'>GOOGLE_CALENDAR_CLIENT_SECRET</code>, and{' '}
          <code className='text-gold-soft'>GOOGLE_CALENDAR_REDIRECT_URI</code> in Vercel, then connect below.
        </p>
      ) : status.connected ? (
        <p className='mt-3 text-xs text-emerald-300'>
          Connected as {status.email ?? 'Google account'}. New bookings sync automatically.
        </p>
      ) : (
        <p className='mt-3 text-xs text-zinc-400'>Not connected — connect to sync Titan bookings to Google Calendar.</p>
      )}
      <div className='mt-4 flex flex-wrap gap-2'>
        <a
          href='/api/admin/google-calendar/connect'
          className='rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black'
        >
          {status?.connected ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
        </a>
        {status?.connected ? (
          <button
            type='button'
            disabled={busy}
            onClick={() => {
              void (async () => {
                setBusy(true);
                setMsg(null);
                const res = await fetchWithTimeout('/api/admin/google-calendar/status', {
                  method: 'DELETE',
                  credentials: 'same-origin',
                  timeoutMs: 15000,
                });
                setBusy(false);
                if (!res.ok) {
                  setMsg('Disconnect failed');
                  return;
                }
                setMsg('Disconnected');
                load();
              })();
            }}
            className='rounded-xl border border-red-500/40 px-4 py-2 text-[10px] font-black uppercase text-red-200 disabled:opacity-50'
          >
            Disconnect
          </button>
        ) : null}
      </div>
      {msg ? <p className='mt-2 text-xs text-zinc-400'>{msg}</p> : null}
    </div>
  );
}
