'use client';

import { useEffect, useState } from 'react';

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '');
}

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 5200);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    setEmailNote(null);
    setToast(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromName: name.trim(),
          fromEmail: email.trim(),
          fromPhone: phone.trim() || undefined,
          subject: subject.trim() || undefined,
          body: body.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean; emailSent?: boolean; emailError?: string | null };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong');
        setStatus('error');
        return;
      }
      if (data.ok !== true) {
        setError((data as { error?: string }).error ?? 'Message was not saved. Please try again or call the shop.');
        setStatus('error');
        return;
      }
      setStatus('ok');
      setToast('Message sent — thank you. We will reply shortly.');
      setEmailNote(
        data.emailSent
          ? 'We also emailed the shop inbox automatically.'
          : 'Add RESEND_API_KEY to your server env to email the shop inbox automatically.',
      );
      setName('');
      setEmail('');
      setPhone('');
      setSubject('');
      setBody('');
    } catch {
      setError('Network error — try again shortly.');
      setStatus('error');
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className='relative mt-6 w-full max-w-md space-y-3 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-bold uppercase tracking-widest text-gold-soft'>Send a message</p>
        <label className='block text-xs text-zinc-400'>
          Name
          <input
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            required
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Email
          <input
            type='email'
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            required
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Phone <span className='text-zinc-600'>(optional, 10 digits)</span>
          <input
            type='tel'
            inputMode='numeric'
            autoComplete='tel-national'
            maxLength={10}
            value={phone}
            onChange={(ev) => setPhone(digitsOnly(ev.target.value).slice(0, 10))}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Subject <span className='text-zinc-600'>(optional)</span>
          <input
            value={subject}
            onChange={(ev) => setSubject(ev.target.value)}
            className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        <label className='block text-xs text-zinc-400'>
          Message
          <textarea
            value={body}
            onChange={(ev) => setBody(ev.target.value)}
            required
            rows={4}
            className='mt-1 w-full resize-y rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
          />
        </label>
        {error ? <p className='text-xs text-red-400'>{error}</p> : null}
        {status === 'ok' && emailNote ? <p className='text-xs text-emerald-400/90'>{emailNote}</p> : null}
        <button
          type='submit'
          disabled={status === 'sending'}
          className='w-full rounded-lg bg-gold py-2.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-50'
        >
          {status === 'sending' ? 'Sending…' : 'Submit'}
        </button>
      </form>

      {toast ? (
        <div
          role='status'
          className='fixed bottom-6 left-1/2 z-[80] w-[min(92vw,24rem)] -translate-x-1/2 rounded-xl border border-emerald-500/50 bg-emerald-950/95 px-4 py-3 text-center text-sm font-semibold text-emerald-100 shadow-[0_0_32px_rgba(16,185,129,0.35)]'
        >
          {toast}
        </div>
      ) : null}
    </>
  );
}
