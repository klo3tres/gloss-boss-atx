'use client';

import { useState } from 'react';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [emailNote, setEmailNote] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('sending');
    setError(null);
    setEmailNote(null);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromName: name.trim(),
          fromEmail: email.trim(),
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
      setStatus('ok');
      setEmailNote(
        data.emailSent
          ? 'Thanks — we saved your message and emailed glossbossatx1@gmail.com.'
          : 'Thanks — we saved your message. Add RESEND_API_KEY to .env.local to email the shop automatically.'
      );
      setName('');
      setEmail('');
      setSubject('');
      setBody('');
    } catch {
      setError('Network error — try again shortly.');
      setStatus('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className='mt-6 w-full max-w-md space-y-3 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
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
      {status === 'ok' && emailNote ? <p className='text-xs text-emerald-400'>{emailNote}</p> : null}
      <button
        type='submit'
        disabled={status === 'sending'}
        className='w-full rounded-lg bg-gold py-2.5 text-xs font-bold uppercase tracking-widest text-black disabled:opacity-50'
      >
        {status === 'sending' ? 'Sending…' : 'Submit'}
      </button>
    </form>
  );
}
