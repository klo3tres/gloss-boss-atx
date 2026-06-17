'use client';

import { useState } from 'react';
import { Sparkles, MessageSquare } from 'lucide-react';

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
    <section className='mx-auto w-full max-w-2xl gb-premium-card rounded-3xl p-6'>
      <div className="flex items-center gap-2 mb-5">
        <Sparkles className="h-4.5 w-4.5 text-gold animate-pulse" />
        <span className="text-xs font-black uppercase tracking-[0.2em] text-gold-soft">Quick Queries</span>
      </div>
      <div className='flex flex-wrap gap-2'>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type='button'
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className='rounded-full border border-gold/20 bg-gold/5 hover:bg-gold/15 hover:border-gold/45 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-gold-soft transition duration-200'
          >
            {s}
          </button>
        ))}
      </div>
      <form
        className='mt-5 flex flex-col gap-3 sm:flex-row'
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder='Ask anything about outstanding balances, routes, mileage...'
          className='min-w-0 flex-1 rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-gold/40 transition'
        />
        <button
          type='submit'
          disabled={busy}
          className='rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-6 py-3 text-xs font-black uppercase tracking-wider text-black disabled:opacity-40 disabled:pointer-events-none hover:brightness-110 transition duration-200 shadow-md shrink-0'
        >
          {busy ? 'Thinking…' : 'Ask Ops'}
        </button>
      </form>
      {err ? <p className='mt-3 text-xs text-rose-400 font-bold'>{err}</p> : null}
      
      {answer ? (
        <div className='mt-6 rounded-2xl border border-white/5 bg-black/40 p-5'>
          <div className="flex items-center gap-2 mb-3.5 pb-2.5 border-b border-white/5">
            <MessageSquare className="h-4 w-4 text-gold-soft" />
            <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>{answer.title}</p>
          </div>
          <p className='text-sm text-zinc-200 leading-relaxed font-medium'>{answer.summary}</p>
          {answer.bullets.length > 0 ? (
            <ul className='mt-3 space-y-2 text-xs text-zinc-400 border-t border-white/5 pt-3'>
              {answer.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-gold-soft font-bold shrink-0">·</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
