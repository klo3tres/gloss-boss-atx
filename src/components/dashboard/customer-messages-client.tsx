'use client';

import { useEffect, useState } from 'react';
import { GlassCard, SectionEyebrow } from '@/components/ui/premium';

type Msg = {
  id: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  adminReply: string | null;
  repliedAt: string | null;
};

function chicago(v: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v));
}

export function CustomerMessagesClient({ customerEmail }: { customerEmail: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch('/api/customer/messages', { cache: 'no-store' });
    const json = (await res.json()) as { messages?: Msg[]; error?: string };
    if (res.ok) setMessages(json.messages ?? []);
    else setError(json.error ?? 'Could not load messages');
  };

  useEffect(() => {
    void load();
  }, []);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await fetch('/api/customer/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: subject.trim() || 'Question', message: body.trim() }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string; note?: string | null };
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? 'Send failed');
      return;
    }
    setBody('');
    setSubject('');
    setOk(
      json.note
        ? `Message saved. ${json.note}. We usually reply within 24–48 hours.`
        : 'Message sent. We usually reply within 24–48 hours.',
    );
    void load();
  };

  return (
    <div className='space-y-6'>
      <GlassCard>
        <SectionEyebrow>Send a message</SectionEyebrow>
        <p className='mt-2 text-sm text-zinc-400'>Messages go to the Gloss Boss team inbox ({customerEmail}). We usually reply within 24–48 hours.</p>
        <form onSubmit={send} className='mt-4 space-y-3'>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder='Subject (optional)' className='gb-input w-full' />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder='Your message' required rows={5} className='gb-input w-full' />
          <button type='submit' disabled={busy} className='rounded-2xl bg-gold px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-50'>
            {busy ? 'Sending…' : 'Send message'}
          </button>
        </form>
        {error ? <p className='mt-3 text-sm text-red-300'>{error}</p> : null}
        {ok ? <p className='mt-3 text-sm text-emerald-300'>{ok}</p> : null}
      </GlassCard>

      <GlassCard>
        <SectionEyebrow>Conversation</SectionEyebrow>
        <ul className='mt-4 space-y-4'>
          {messages.length === 0 ? <li className='text-sm text-zinc-500'>No messages yet.</li> : null}
          {messages.map((m) => (
            <li key={m.id} className='rounded-2xl border border-white/10 bg-black/35 p-4'>
              <p className='text-xs font-bold uppercase text-gold-soft'>{m.subject}</p>
              <p className='mt-1 text-xs text-zinc-500'>{chicago(m.createdAt)} · {m.status}</p>
              <p className='mt-3 whitespace-pre-wrap text-sm text-zinc-200'>{m.body}</p>
              {m.adminReply ? (
                <div className='mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3'>
                  <p className='text-[10px] font-black uppercase text-emerald-300'>Gloss Boss reply{m.repliedAt ? ` · ${chicago(m.repliedAt)}` : ''}</p>
                  <p className='mt-2 whitespace-pre-wrap text-sm text-zinc-100'>{m.adminReply}</p>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </GlassCard>
    </div>
  );
}
