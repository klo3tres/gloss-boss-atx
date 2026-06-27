'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import {
  GOOGLE_CALENDAR_OAUTH_ERROR_MESSAGES,
  type GoogleCalendarOAuthErrorCode,
} from '@/lib/google/google-calendar-oauth-errors';

type Status = {
  configured: boolean;
  connected: boolean;
  email: string | null;
  calendarId?: string | null;
  tokenExpiresAt?: string | null;
  lastPullAt?: string | null;
  lastPushAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
};

function fmt(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export function GoogleCalendarConnectPanel() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const load = () => {
    void fetchWithTimeout('/api/admin/google-calendar/status', { credentials: 'same-origin', timeoutMs: 15000 })
      .then((r) => r.json())
      .then((d: Status & { ok?: boolean }) =>
        setStatus({
          configured: Boolean(d.configured),
          connected: Boolean(d.connected),
          email: d.email ?? null,
          calendarId: d.calendarId ?? null,
          tokenExpiresAt: d.tokenExpiresAt ?? null,
          lastPullAt: d.lastPullAt ?? null,
          lastPushAt: d.lastPushAt ?? null,
          lastSyncAt: d.lastSyncAt ?? null,
          lastError: d.lastError ?? null,
        }),
      )
      .catch(() => setStatus(null));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const errCode = searchParams.get('calendar_error') as GoogleCalendarOAuthErrorCode | null;
    const connected = searchParams.get('gcal') === 'connected';
    if (connected) {
      setBanner({ tone: 'ok', text: 'Google Calendar connected. New bookings will sync to your primary calendar.' });
      load();
    } else if (errCode && GOOGLE_CALENDAR_OAUTH_ERROR_MESSAGES[errCode]) {
      setBanner({ tone: 'err', text: GOOGLE_CALENDAR_OAUTH_ERROR_MESSAGES[errCode] });
    }
  }, [searchParams]);

  return (
    <div className='rounded-2xl border border-white/10 bg-black/45 p-5'>
      <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Google Calendar</p>
      <p className='mt-2 text-xs text-zinc-400'>
        Titan pushes bookings to Google Calendar and can pull external events to block availability.
      </p>

      {banner ? (
        <p
          className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
            banner.tone === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
          }`}
        >
          {banner.text}
        </p>
      ) : null}

      {!status ? (
        <p className='mt-3 text-xs text-zinc-500'>Loading connection status…</p>
      ) : !status.configured ? (
        <p className='mt-3 text-xs text-amber-200'>
          Add <code className='text-gold-soft'>GOOGLE_CALENDAR_CLIENT_ID</code>,{' '}
          <code className='text-gold-soft'>GOOGLE_CALENDAR_CLIENT_SECRET</code>, and{' '}
          <code className='text-gold-soft'>GOOGLE_CALENDAR_REDIRECT_URI</code> in Vercel, then connect below.
        </p>
      ) : status.connected ? (
        <dl className='mt-3 grid gap-1 text-xs sm:grid-cols-2'>
          <div>
            <dt className='text-zinc-500'>Status</dt>
            <dd className='font-semibold text-emerald-300'>Connected</dd>
          </div>
          <div>
            <dt className='text-zinc-500'>Google account</dt>
            <dd className='text-white'>{status.email ?? '—'}</dd>
          </div>
          <div>
            <dt className='text-zinc-500'>Calendar ID</dt>
            <dd className='font-mono text-zinc-300'>{status.calendarId ?? 'primary'}</dd>
          </div>
          <div>
            <dt className='text-zinc-500'>Token expires</dt>
            <dd className='text-zinc-300'>{fmt(status.tokenExpiresAt)}</dd>
          </div>
          <div>
            <dt className='text-zinc-500'>Last push</dt>
            <dd className='text-zinc-300'>{fmt(status.lastPushAt ?? status.lastSyncAt)}</dd>
          </div>
          <div>
            <dt className='text-zinc-500'>Last pull</dt>
            <dd className='text-zinc-300'>{fmt(status.lastPullAt)}</dd>
          </div>
          {status.lastError ? (
            <div className='sm:col-span-2'>
              <dt className='text-zinc-500'>Last error</dt>
              <dd className='text-rose-300'>{status.lastError}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className='mt-3 text-xs text-zinc-400'>Not connected — connect to sync Titan with Google Calendar.</p>
      )}

      <div className='mt-4 flex flex-wrap gap-2'>
        <a
          href='/api/admin/google-calendar/connect'
          className='rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black'
        >
          {status?.connected ? 'Reconnect' : 'Connect Google Calendar'}
        </a>
        {status?.connected ? (
          <>
            <button
              type='button'
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setMsg(null);
                  const res = await fetchWithTimeout('/api/admin/google-calendar/pull', {
                    method: 'POST',
                    credentials: 'same-origin',
                    timeoutMs: 60000,
                  });
                  const data = (await res.json()) as { ok?: boolean; imported?: number; error?: string };
                  setBusy(false);
                  if (!res.ok || !data.ok) {
                    setMsg(data.error ?? 'Pull failed');
                    return;
                  }
                  setMsg(`Imported ${data.imported ?? 0} Google events as booking blocks.`);
                  load();
                })();
              }}
              className='rounded-xl border border-cyan-500/30 px-4 py-2 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50'
            >
              Sync from Google
            </button>
            <button
              type='button'
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
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
                  setBanner(null);
                  load();
                })();
              }}
              className='rounded-xl border border-red-500/40 px-4 py-2 text-[10px] font-black uppercase text-red-200 disabled:opacity-50'
            >
              Disconnect
            </button>
          </>
        ) : null}
      </div>
      {msg ? <p className='mt-2 text-xs text-zinc-400'>{msg}</p> : null}
    </div>
  );
}
