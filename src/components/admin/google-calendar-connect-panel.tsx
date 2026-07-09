'use client';



import { useEffect, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { fetchWithTimeout } from '@/lib/fetch-with-timeout';

import {

  GOOGLE_CALENDAR_OAUTH_ERROR_MESSAGES,

  type GoogleCalendarOAuthErrorCode,

} from '@/lib/google/google-calendar-oauth-errors';

import {

  googleCalendarStatusLabel,

  humanizeGoogleSyncError,

  type GoogleCalendarConnectionStatus,

} from '@/lib/google/google-calendar-status';



type Status = {

  configured: boolean;

  connected: boolean;

  connectionStatus: GoogleCalendarConnectionStatus;

  connectionStatusLabel: string;

  statusMessage?: string | null;

  email: string | null;

  calendarId?: string | null;

  tokenExpiresAt?: string | null;

  refreshTokenPresent?: boolean;

  lastPullAt?: string | null;

  lastPushAt?: string | null;

  lastSyncAt?: string | null;

  lastError?: string | null;

  debug?: {
    clientIdPresent: boolean;
    redirectUriExpected: string;
    appUrl: string;
  };

};



function fmt(iso?: string | null) {

  if (!iso) return '—';

  const d = new Date(iso);

  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();

}



function nextSyncLabel(lastPullAt?: string | null) {

  if (!lastPullAt) return 'On next admin visit (every ~10 min)';

  const next = new Date(lastPullAt).getTime() + 10 * 60 * 1000;

  if (Number.isNaN(next)) return '—';

  return new Date(next).toLocaleString();

}



function statusTone(status: GoogleCalendarConnectionStatus): string {

  switch (status) {

    case 'connected':

      return 'text-emerald-600 dark:text-emerald-300';

    case 'syncing':

      return 'text-cyan-600 dark:text-cyan-300';

    case 'needs_reconnect':

      return 'text-amber-600 dark:text-amber-300';

    case 'error':

      return 'text-rose-600 dark:text-rose-300';

    default:

      return 'text-muted-foreground';

  }

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

          connectionStatus: d.connectionStatus ?? (d.connected ? 'connected' : 'disconnected'),

          connectionStatusLabel: d.connectionStatusLabel ?? googleCalendarStatusLabel(d.connectionStatus ?? 'disconnected'),

          statusMessage: d.statusMessage ?? null,

          email: d.email ?? null,

          calendarId: d.calendarId ?? null,

          tokenExpiresAt: d.tokenExpiresAt ?? null,

          refreshTokenPresent: d.refreshTokenPresent,

          lastPullAt: d.lastPullAt ?? null,

          lastPushAt: d.lastPushAt ?? null,

          lastSyncAt: d.lastSyncAt ?? null,

          lastError: d.lastError ?? null,

          debug: d.debug,

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



  const needsReconnect =

    status?.connectionStatus === 'needs_reconnect' || status?.connectionStatus === 'error';

  const showHealthyDetails = status?.connectionStatus === 'connected' || status?.connectionStatus === 'syncing';

  const hasRow =

    status &&

    status.connectionStatus !== 'disconnected' &&

    status.connectionStatus !== 'unconfigured';



  return (

    <div className='rounded-2xl border border-border bg-card p-5 text-card-foreground'>

      <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Google Calendar</p>

      <p className='mt-2 text-xs text-muted-foreground'>

        Use the same Google account that owns your Gloss Boss calendar. Titan pushes bookings to Google Calendar and can pull external events to block availability.

      </p>

      <div className='mt-3 rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-relaxed text-muted-foreground space-y-1.5'>
        <p>
          Your OAuth client must be in the Google Cloud project whose Client ID is saved in Vercel as{' '}
          <code className='text-gold-soft'>GOOGLE_CALENDAR_CLIENT_ID</code>.
        </p>
        <p>
          Authorized redirect URI must exactly be:{' '}
          <code className='break-all text-gold-soft'>https://www.glossbossatx.com/api/admin/google-calendar/callback</code>
        </p>
        <p>Google OAuth redirect URIs must match exactly — this is required by Google OAuth.</p>
      </div>



      {banner ? (

        <p

          className={`mt-3 rounded-xl border px-3 py-2 text-xs ${

            banner.tone === 'ok'

              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'

              : 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200'

          }`}

        >

          {banner.text}

        </p>

      ) : null}



      {!status ? (

        <p className='mt-3 text-xs text-muted-foreground'>Loading connection status…</p>

      ) : !status.configured ? (

        <p className='mt-3 text-xs text-amber-700 dark:text-amber-200'>

          Add <code className='text-gold-soft'>GOOGLE_CALENDAR_CLIENT_ID</code>,{' '}

          <code className='text-gold-soft'>GOOGLE_CALENDAR_CLIENT_SECRET</code>, and{' '}

          <code className='text-gold-soft'>GOOGLE_CALENDAR_REDIRECT_URI</code> in Vercel, then connect below.

        </p>

      ) : (

        <dl className='mt-3 grid gap-1 text-xs sm:grid-cols-2'>

          <div>

            <dt className='text-muted-foreground'>Status</dt>

            <dd className={`font-semibold ${statusTone(status.connectionStatus)}`}>{status.connectionStatusLabel}</dd>

          </div>

          {hasRow ? (

            <div>

              <dt className='text-muted-foreground'>Google account</dt>

              <dd className='text-foreground'>{status.email ?? '—'}</dd>

            </div>

          ) : null}

          {showHealthyDetails ? (

            <>

              <div>

                <dt className='text-muted-foreground'>Calendar ID</dt>

                <dd className='font-mono text-muted-foreground'>{status.calendarId ?? 'primary'}</dd>

              </div>

              <div>

                <dt className='text-muted-foreground'>Token expires</dt>

                <dd className='text-muted-foreground'>{fmt(status.tokenExpiresAt)}</dd>

              </div>

              <div>

                <dt className='text-muted-foreground'>Last sync</dt>

                <dd className='text-muted-foreground'>{fmt(status.lastPullAt ?? status.lastSyncAt)}</dd>

              </div>

              <div>

                <dt className='text-muted-foreground'>Next sync</dt>

                <dd className='text-muted-foreground'>{nextSyncLabel(status.lastPullAt ?? status.lastSyncAt)}</dd>

              </div>

            </>

          ) : null}

          {needsReconnect ? (

            <div className='sm:col-span-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100'>

              {status.statusMessage ?? humanizeGoogleSyncError(status.lastError)}

              {!status.refreshTokenPresent ? (

                <span className='mt-1 block text-[11px] opacity-90'>Refresh token missing — reconnect to restore sync.</span>

              ) : null}

            </div>

          ) : null}

          {status.connectionStatus === 'error' && status.lastError ? (

            <div className='sm:col-span-2'>

              <dt className='text-muted-foreground'>Last error</dt>

              <dd className='text-rose-600 dark:text-rose-300'>{humanizeGoogleSyncError(status.lastError)}</dd>

            </div>

          ) : null}

        </dl>

      )}



      <div className='mt-4 flex flex-wrap gap-2'>

        <a

          href='/api/admin/google-calendar/connect'

          className='rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black'

        >

          {needsReconnect || !status?.connected ? 'Reconnect Google Calendar' : 'Reconnect'}

        </a>

        {showHealthyDetails ? (

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

                    load();

                    return;

                  }

                  setMsg(`Imported ${data.imported ?? 0} Google events as booking blocks.`);

                  load();

                })();

              }}

              className='rounded-xl border border-cyan-500/30 px-4 py-2 text-[10px] font-black uppercase text-cyan-700 dark:text-cyan-200 disabled:opacity-50'

            >

              Sync from Google

            </button>

            <button

              type='button'

              disabled={busy}

              onClick={() => {

                if (!window.confirm('Disconnect Google Calendar? You will need to reconnect to sync again.')) return;

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

              className='rounded-xl border border-red-500/40 px-4 py-2 text-[10px] font-black uppercase text-red-700 dark:text-red-200 disabled:opacity-50'

            >

              Disconnect

            </button>

          </>

        ) : null}

      </div>

      {msg ? <p className='mt-2 text-xs text-muted-foreground'>{msg}</p> : null}

      {status?.debug ? (
        <dl className='mt-4 grid gap-1 rounded-xl border border-dashed border-border bg-muted/20 p-3 text-[10px] sm:grid-cols-3'>
          <div>
            <dt className='text-muted-foreground'>Client ID in Vercel</dt>
            <dd className='font-mono font-semibold text-foreground'>{status.debug.clientIdPresent ? 'Yes' : 'No'}</dd>
          </div>
          <div className='sm:col-span-2'>
            <dt className='text-muted-foreground'>Redirect URI expected</dt>
            <dd className='break-all font-mono text-foreground'>{status.debug.redirectUriExpected}</dd>
          </div>
          <div className='sm:col-span-3'>
            <dt className='text-muted-foreground'>App URL</dt>
            <dd className='font-mono text-foreground'>{status.debug.appUrl}</dd>
          </div>
        </dl>
      ) : null}

    </div>

  );

}


