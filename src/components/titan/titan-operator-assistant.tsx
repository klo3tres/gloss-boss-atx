'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Send, Sparkles, X } from 'lucide-react';
import { PoweredByTitan } from '@/components/titan/titan-brand';
import type { TitanAnswerAction } from '@/lib/titan-queries';

const OPERATOR_PROMPTS = [
  'Who should I call today?',
  'Where is money leaking?',
  'What opportunities did Titan find?',
  'What follow-ups can I send?',
  'What estimates are open?',
  'What is broken in setup?',
];

type OperatorAnswer = {
  title: string;
  summary: string;
  bullets: string[];
  href?: string;
  actions?: TitanAnswerAction[];
  error?: string;
};

export function TitanOperatorAssistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<OperatorAnswer | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/titan/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const j = (await res.json()) as OperatorAnswer;
      if (!res.ok) {
        setErr(j.error ?? 'Titan could not answer — check Titan Settings for system health.');
        return;
      }
      setAnswer(j);
    } catch {
      setErr('Network error — Titan is still available via Titan Home.');
    } finally {
      setBusy(false);
    }
  };

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  return (
    <div className="titan-operator-panel flex max-h-[min(640px,calc(100dvh-1.5rem))] w-[min(440px,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-2xl border border-gold/30 bg-zinc-950/98 shadow-[0_24px_80px_rgba(0,0,0,0.7)] backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black via-zinc-950 to-amber-950/20 px-4 py-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 font-black text-gold-soft">
            T
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-white">
              Titan Operator
              <Sparkles className="h-3.5 w-3.5 text-gold-soft" />
            </p>
            <p className="text-[10px] text-zinc-500">Business assistant for your team</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <p className="text-xs text-zinc-500">Ask about money, leads, follow-ups, opportunities, and setup.</p>
        <div className="flex flex-wrap gap-1.5">
          {OPERATOR_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setQuestion(p);
                void ask(p);
              }}
              className="rounded-full border border-white/10 bg-black/50 px-2.5 py-1 text-[9px] font-bold uppercase text-zinc-400 hover:border-gold/30 hover:text-gold-soft"
            >
              {p}
            </button>
          ))}
        </div>

        {answer ? (
          <div className="rounded-2xl border border-gold/20 bg-black/50 p-4">
            <p className="text-xs font-black uppercase text-gold-soft">{answer.title}</p>
            <p className="mt-2 text-sm text-zinc-200">{answer.summary}</p>
            {answer.bullets.length > 0 ? (
              <ul className="mt-3 space-y-1 border-t border-white/5 pt-3 text-xs text-zinc-400">
                {answer.bullets.map((b, i) => (
                  <li key={i}>· {b}</li>
                ))}
              </ul>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {answer.href ? (
                <Link
                  href={answer.href}
                  className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft"
                >
                  Open →
                </Link>
              ) : null}
              {answer.actions?.map((a) =>
                a.copyText ? (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => void copyText(a.copyText!, a.label)}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300"
                  >
                    {copied === a.label ? 'Copied' : a.label}
                  </button>
                ) : a.href ? (
                  <Link
                    key={a.label}
                    href={a.href}
                    className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/30"
                  >
                    {a.label}
                  </Link>
                ) : null,
              )}
            </div>
          </div>
        ) : null}
        {err ? <p className="text-xs text-red-300">{err}</p> : null}
      </div>

      <div className="border-t border-white/10 bg-black/80 px-3 py-3">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask Titan anything about the business…"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-gold/40 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-gold px-3 py-2.5 text-black disabled:opacity-50"
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-bold uppercase">
          <Link href="/admin/titan" className="text-gold-soft hover:underline">
            Titan Home
          </Link>
          <Link href="/admin/super" className="text-zinc-500 hover:text-zinc-300">
            Command Center
          </Link>
          <Link href="/admin/titan/settings" className="text-zinc-500 hover:text-zinc-300">
            Settings
          </Link>
        </div>
        <div className="mt-2 flex justify-center">
          <PoweredByTitan compact />
        </div>
      </div>
    </div>
  );
}
