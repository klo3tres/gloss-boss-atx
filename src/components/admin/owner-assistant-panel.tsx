'use client';

import { useState } from 'react';

type Answer = { title: string; summary: string; bullets: string[] };

const SUGGESTIONS = ['Who owes money?', 'Jobs this week?', 'Mileage this month?', 'Jarvis performance?'];

export function OwnerAssistantPanel() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const j = (await res.json()) as Answer & { error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Query failed');
        return;
      }
      setAnswer({ title: j.title, summary: j.summary, bullets: j.bullets ?? [] });
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className='mx-auto w-full max-w-2xl rounded-3xl border border-gold/25 bg-zinc-950/90 p-6 shadow-[0_0_40px_rgba(212,175,55,0.08)]'>
      <div className='flex flex-wrap gap-2'>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type='button'
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className='rounded-full border border-gold/30 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft'
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className='mt-4 flex flex-col gap-3 sm:flex-row'
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='Ask anything about ops…'
          className='min-w-0 flex-1 rounded-2xl border border-white/15 bg-black/50 px-4 py-3 text-sm text-white'
        />
        <button
          type='submit'
          disabled={busy}
          className='rounded-2xl bg-gold px-6 py-3 text-xs font-black uppercase text-black disabled:opacity-60'
        >
          {busy ? 'Thinking…' : 'Ask'}
        </button>
      </form>
      {err ? <p className='mt-3 text-sm text-red-300'>{err}</p> : null}
      {answer ? (
        <div className='mt-6 rounded-2xl border border-white/10 bg-black/40 p-5'>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>{answer.title}</p>
          <p className='mt-2 text-sm text-zinc-200'>{answer.summary}</p>
          {answer.bullets.length > 0 ? (
            <ul className='mt-3 space-y-1 text-sm text-zinc-400'>
              {answer.bullets.map((b, i) => (
                <li key={i}>· {b}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
