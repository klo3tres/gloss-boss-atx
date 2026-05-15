'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import type { BookingAvailabilityConfig } from '@/lib/booking-availability-config';

export function CmsBookingAvailabilityClient({ initial }: { initial: BookingAvailabilityConfig }) {
  const router = useRouter();
  const [allowSaturday, setAllowSaturday] = useState(initial.allowSaturday);
  const [allowSunday, setAllowSunday] = useState(initial.allowSunday);
  const [allowAllOtherDays, setAllowAllOtherDays] = useState(initial.allowAllOtherDays);
  const [fridayHour, setFridayHour] = useState(initial.allowFridayAfterHour);
  const [blackoutDates, setBlackoutDates] = useState((initial.blackoutDates ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  return (
    <form
      className='mt-4 space-y-4'
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          setBusy(true);
          setMsg(null);
          const res = await fetchWithTimeout('/api/admin/booking-availability', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              allowSaturday,
              allowSunday,
              allowAllOtherDays,
              allowFridayAfterHour: fridayHour,
              blackoutDates,
            }),
            credentials: 'same-origin',
            timeoutMs: 30000,
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          setBusy(false);
          if (!res.ok || !data.ok) {
            setMsg({ type: 'err', text: data.error ?? 'Save failed' });
            return;
          }
          setMsg({ type: 'ok', text: 'Booking availability saved.' });
          router.refresh();
        })();
      }}
    >
      <label className='flex items-center gap-2 text-sm text-zinc-300'>
        <input type='checkbox' checked={allowSaturday} onChange={(e) => setAllowSaturday(e.target.checked)} />
        Allow Saturday
      </label>
      <label className='flex items-center gap-2 text-sm text-zinc-300'>
        <input type='checkbox' checked={allowSunday} onChange={(e) => setAllowSunday(e.target.checked)} />
        Allow Sunday
      </label>
      <label className='flex items-center gap-2 text-sm text-zinc-300'>
        <input type='checkbox' checked={allowAllOtherDays} onChange={(e) => setAllowAllOtherDays(e.target.checked)} />
        Allow Mon–Thu and Fri before cutoff (override)
      </label>
      <label className='block text-xs text-zinc-400'>
        Friday — allow bookings after hour (24h, default 17 = 5pm)
        <input
          type='number'
          min={0}
          max={23}
          value={fridayHour}
          onChange={(e) => setFridayHour(Number(e.target.value))}
          className='mt-1 w-24 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400'>
        Blackout dates
        <textarea
          rows={3}
          value={blackoutDates}
          onChange={(e) => setBlackoutDates(e.target.value)}
          placeholder='2026-12-25'
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 font-mono text-xs text-white'
        />
      </label>
      <button
        type='submit'
        disabled={busy}
        className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black disabled:opacity-50'
      >
        {busy ? 'Saving…' : 'Save booking rules'}
      </button>
      {msg?.type === 'ok' ? <p className='text-sm text-emerald-300'>{msg.text}</p> : null}
      {msg?.type === 'err' ? <p className='text-sm text-rose-300'>{msg.text}</p> : null}
    </form>
  );
}
