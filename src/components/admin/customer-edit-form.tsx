'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { SMS_CONSENT_COPY } from '@/lib/sms-consent';

export function CustomerEditForm({
  customerId,
  initial,
}: {
  customerId: string;
  initial: {
    full_name: string;
    email: string;
    phone: string;
    address_line1: string;
    address_line2: string;
    city: string;
    state: string;
    postal_code: string;
    sms_consent: boolean;
    sms_status: string;
  };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState(initial);

  return (
    <form
      className='mt-4 grid gap-3 sm:grid-cols-2'
      onSubmit={(e) => {
        e.preventDefault();
        void (async () => {
          setBusy(true);
          setMsg(null);
          const res = await fetchWithTimeout('/api/admin/customers', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: customerId, ...form }),
            credentials: 'same-origin',
            timeoutMs: 20000,
          });
          const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
          setBusy(false);
          if (!res.ok || !data.ok) {
            setMsg({ type: 'err', text: data.error ?? 'Save failed' });
            return;
          }
          setMsg({ type: 'ok', text: 'Customer updated.' });
          router.refresh();
        })();
      }}
    >
      {(['full_name', 'email', 'phone'] as const).map((k) => (
        <label key={k} className='block text-xs text-zinc-400 sm:col-span-1'>
          {k.replace('_', ' ')}
          <input
            value={form[k]}
            onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
      ))}
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        Address line 1
        <input
          value={form.address_line1}
          onChange={(e) => setForm((f) => ({ ...f, address_line1: e.target.value }))}
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        Address line 2
        <input
          value={form.address_line2}
          onChange={(e) => setForm((f) => ({ ...f, address_line2: e.target.value }))}
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400'>
        City
        <input
          value={form.city}
          onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400'>
        State
        <input
          value={form.state}
          onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <label className='block text-xs text-zinc-400 sm:col-span-2'>
        Postal code
        <input
          value={form.postal_code}
          onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))}
          className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
        />
      </label>
      <fieldset className='rounded-xl border border-white/10 bg-black/35 p-4 text-sm sm:col-span-2'>
        <legend className='px-1 text-xs font-black uppercase tracking-wider text-gold-soft'>SMS consent</legend>
        <p className='text-xs leading-relaxed text-zinc-400'>{SMS_CONSENT_COPY}</p>
        <p className='mt-1 text-xs text-zinc-500'>Only turn this on when the customer explicitly asks to receive texts.</p>
        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
          <label className='rounded-lg border border-white/10 px-3 py-3 text-xs font-semibold text-zinc-300'>
            <input
              type='radio'
              name='adminSmsConsent'
              checked={form.sms_consent === true}
              onChange={() => setForm((f) => ({ ...f, sms_consent: true, sms_status: 'opted_in' }))}
              className='mr-2 accent-[var(--gold)]'
            />
            Yes, I agree to receive SMS updates.
          </label>
          <label className='rounded-lg border border-white/10 px-3 py-3 text-xs font-semibold text-zinc-300'>
            <input
              type='radio'
              name='adminSmsConsent'
              checked={form.sms_consent !== true}
              onChange={() => setForm((f) => ({ ...f, sms_consent: false, sms_status: 'opted_out' }))}
              className='mr-2 accent-[var(--gold)]'
            />
            No, do not send me SMS updates.
          </label>
        </div>
        <p className='mt-2 text-xs text-zinc-500'>Current status: {form.sms_status || 'unknown'}</p>
      </fieldset>
      <button
        type='submit'
        disabled={busy}
        className='sm:col-span-2 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black disabled:opacity-40'
      >
        {busy ? 'Saving…' : 'Save customer'}
      </button>
      {msg ? (
        <p className={`sm:col-span-2 text-sm ${msg.type === 'ok' ? 'text-emerald-300' : 'text-rose-300'}`}>{msg.text}</p>
      ) : null}
    </form>
  );
}
