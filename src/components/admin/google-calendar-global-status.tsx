'use client';

import { useEffect, useState } from 'react';
import { CalendarSync, ChevronDown, X } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';

type Status = {
  connected?: boolean;
  connectionStatus?: string;
  statusMessage?: string | null;
  email?: string | null;
  tokenExpiresAt?: string | null;
  refreshTokenPresent?: boolean;
  lastSyncAt?: string | null;
  debug?: { redirectUriExpected?: string };
};

export function GoogleCalendarGlobalStatus() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState(false);

  const load = () => {
    void fetch('/api/admin/google-calendar/status', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => setStatus(json))
      .catch(() => setStatus(null));
  };

  useEffect(load, []);
  const needsReconnect = status?.connectionStatus === 'needs_reconnect' || status?.connectionStatus === 'error' || status?.connectionStatus === 'disconnected';
  const reconnected = searchParams.get('gcal') === 'connected';
  const syncedCount = searchParams.get('gcal_synced');

  return (
    <>
      <button
        type='button'
        onClick={() => setOpen(true)}
        className={`relative inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-xs font-black uppercase ${
          needsReconnect ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-white/10 text-zinc-300'
        }`}
      >
        <CalendarSync className='h-4 w-4' />
        <span className='hidden xl:inline'>Calendar</span>
        {needsReconnect ? <span className='h-2 w-2 rounded-full bg-amber-400' /> : null}
      </button>
      {reconnected ? (
        <div className='fixed bottom-4 left-1/2 z-[240] -translate-x-1/2 rounded-xl border border-emerald-500/30 bg-zinc-950 px-4 py-3 text-sm text-emerald-200 shadow-xl'>
          Google Calendar reconnected successfully.{syncedCount ? ` ${syncedCount} appointment${syncedCount === '1' ? '' : 's'} synchronized.` : ''}
        </div>
      ) : null}
      {open ? (
        <div className='fixed inset-0 z-[230] flex items-center justify-center bg-black/80 p-4 backdrop-blur-md' onClick={() => setOpen(false)}>
          <section className='w-full max-w-lg rounded-3xl border border-gold/25 bg-zinc-950 p-6 shadow-2xl' onClick={(event) => event.stopPropagation()}>
            <div className='flex items-start justify-between gap-4'>
              <div>
                <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Integration status</p>
                <h2 className='mt-1 text-xl font-black text-white'>Google Calendar</h2>
              </div>
              <button type='button' onClick={() => setOpen(false)} className='rounded-xl border border-white/10 p-2 text-zinc-400'><X className='h-5 w-5' /></button>
            </div>
            <div className={`mt-5 rounded-2xl border p-4 ${needsReconnect ? 'border-amber-500/30 bg-amber-500/10' : 'border-emerald-500/30 bg-emerald-500/10'}`}>
              <p className={`font-black ${needsReconnect ? 'text-amber-100' : 'text-emerald-100'}`}>
                {needsReconnect ? 'Google Calendar needs reconnection' : 'Google Calendar is connected'}
              </p>
              <p className='mt-2 text-sm leading-relaxed text-zinc-300'>
                Internal Gloss Boss appointments remain active and authoritative. Reconnecting only restores Google event synchronization.
              </p>
            </div>
            {needsReconnect ? (
              <a
                href={`/api/admin/google-calendar/connect?return_to=${encodeURIComponent(pathname)}`}
                className='mt-5 inline-flex min-h-11 items-center rounded-xl bg-gold px-5 text-xs font-black uppercase text-black'
              >
                Reconnect Google Calendar
              </a>
            ) : null}
            <button type='button' onClick={() => setDetails((value) => !value)} className='mt-5 flex min-h-11 items-center gap-2 text-xs font-black uppercase text-zinc-400'>
              <ChevronDown className={`h-4 w-4 transition ${details ? 'rotate-180' : ''}`} /> Diagnostic details
            </button>
            {details ? (
              <dl className='space-y-2 rounded-xl border border-white/10 bg-black/40 p-4 text-xs'>
                <div className='flex justify-between gap-4'><dt className='text-zinc-500'>Account</dt><dd className='text-right text-zinc-300'>{status?.email || 'Not available'}</dd></div>
                <div className='flex justify-between gap-4'><dt className='text-zinc-500'>Status</dt><dd className='text-right capitalize text-zinc-300'>{(status?.connectionStatus || 'checking').replace(/_/g, ' ')}</dd></div>
                <div className='flex justify-between gap-4'><dt className='text-zinc-500'>Refresh token</dt><dd className='text-right text-zinc-300'>{status?.refreshTokenPresent ? 'Present' : 'Missing'}</dd></div>
                <div className='flex justify-between gap-4'><dt className='text-zinc-500'>Last sync</dt><dd className='text-right text-zinc-300'>{status?.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : 'Never'}</dd></div>
                {status?.statusMessage ? <div className='border-t border-white/10 pt-2 text-amber-200'>{status.statusMessage}</div> : null}
              </dl>
            ) : null}
            <button type='button' onClick={() => setOpen(false)} className='mt-5 min-h-11 rounded-xl border border-white/15 px-5 text-xs font-black uppercase text-zinc-300'>Cancel</button>
          </section>
        </div>
      ) : null}
    </>
  );
}
