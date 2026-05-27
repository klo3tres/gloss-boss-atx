'use client';

import { useState } from 'react';

export function FleetInquiryForm() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/public/fleet-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: fd.get('companyName'),
          contactName: fd.get('contactName'),
          email: fd.get('email'),
          phone: fd.get('phone'),
          fleetSize: fd.get('fleetSize'),
          message: fd.get('message'),
        }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setMsg({ tone: 'err', text: j.error ?? 'Could not send inquiry.' });
        return;
      }
      setMsg({ tone: 'ok', text: j.message ?? 'Inquiry sent — check your email for confirmation.' });
      e.currentTarget.reset();
    } catch {
      setMsg({ tone: 'err', text: 'Network error — try again.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className='mt-6 grid gap-3 sm:grid-cols-2'>
      <label className='text-xs text-zinc-400'>
        Company
        <input name='companyName' required className='mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white' />
      </label>
      <label className='text-xs text-zinc-400'>
        Contact name
        <input name='contactName' required className='mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white' />
      </label>
      <label className='text-xs text-zinc-400'>
        Email
        <input name='email' type='email' required className='mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white' />
      </label>
      <label className='text-xs text-zinc-400'>
        Phone
        <input name='phone' type='tel' className='mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white' />
      </label>
      <label className='text-xs text-zinc-400 sm:col-span-2'>
        Fleet size
        <select name='fleetSize' className='mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white'>
          <option value='1-5'>1–5 vehicles</option>
          <option value='6-15'>6–15 vehicles</option>
          <option value='15+'>15+ vehicles</option>
        </select>
      </label>
      <label className='text-xs text-zinc-400 sm:col-span-2'>
        Notes
        <textarea name='message' rows={3} className='mt-1 w-full rounded-lg border border-white/15 bg-black/50 px-3 py-2 text-sm text-white' placeholder='Locations, frequency, services needed…' />
      </label>
      <button
        type='submit'
        disabled={busy}
        className='rounded-lg bg-gold px-5 py-3 text-sm font-bold uppercase tracking-wider text-black disabled:opacity-60 sm:col-span-2'
      >
        {busy ? 'Sending…' : 'Submit fleet inquiry'}
      </button>
      {msg ? (
        <p
          className={`sm:col-span-2 rounded-lg border px-3 py-2 text-sm ${msg.tone === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100' : 'border-red-500/30 bg-red-500/10 text-red-100'}`}
          role='status'
        >
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
