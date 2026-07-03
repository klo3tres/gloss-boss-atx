'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, Send, ChevronRight, Sparkles } from 'lucide-react';
import { PoweredByTitan } from '@/components/titan/titan-brand';

type GuideLink = { label: string; href: string };

type ChatMessage = {
  id: string;
  role: 'titan' | 'user';
  text: string;
  links?: GuideLink[];
};

type LeadForm = {
  name: string;
  email: string;
  phone: string;
  vehicle: string;
  serviceNeeded: string;
  city: string;
  preferredDate: string;
};

const QUICK_ACTIONS = [
  { label: 'Get a quote', action: 'quote' as const },
  { label: 'View services', href: '/services' },
  { label: 'Book a detail', href: '/book' },
  { label: 'Memberships', href: '/memberships' },
  { label: 'Fleet services', href: '/fleet' },
  { label: 'Contact Kyle', action: 'kyle' as const },
];

const FALLBACK_MESSAGE =
  'Titan is having trouble right now. Leave your name and phone and Kyle will follow up.';

function emptyLead(): LeadForm {
  return { name: '', email: '', phone: '', vehicle: '', serviceNeeded: '', city: '', preferredDate: '' };
}

export function TitanPublicAssistant({
  open,
  onClose,
  initialPrompt = null,
  onInitialPromptConsumed,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string | null;
  onInitialPromptConsumed?: () => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [leadMode, setLeadMode] = useState<'quote' | 'handoff' | null>(null);
  const [lead, setLead] = useState<LeadForm>(emptyLead());
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialPromptSent = useRef(false);

  const track = useCallback(
    async (eventType: string, extra?: { questionKey?: string; metadata?: Record<string, unknown> }) => {
      if (!sessionId) return;
      await fetch('/api/public/titan-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'track', sessionId, eventType, ...extra }),
      }).catch(() => null);
    },
    [sessionId],
  );

  const pushTitan = useCallback((text: string, links?: GuideLink[]) => {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'titan', text, links }]);
  }, []);

  const showApiFallback = useCallback(() => {
    pushTitan(FALLBACK_MESSAGE);
    setLeadMode('handoff');
    setErr(null);
  }, [pushTitan]);

  const init = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/public/titan-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'welcome' }),
      });
      if (!res.ok) {
        showApiFallback();
        return;
      }
      const j = (await res.json()) as { sessionId: string; reply: { message: string; links: GuideLink[] } };
      setSessionId(j.sessionId);
      pushTitan(j.reply.message, j.reply.links);
    } catch {
      showApiFallback();
    } finally {
      setBusy(false);
    }
  }, [pushTitan, showApiFallback]);

  useEffect(() => {
    if (open && messages.length === 0) void init();
  }, [open, messages.length, init]);

  useEffect(() => {
    if (open && sessionId) void track('open');
  }, [open, sessionId, track]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, leadMode]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setErr(null);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'user', text: q }]);
      setInput('');
      setBusy(true);
      try {
        const res = await fetch('/api/public/titan-guide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ask', question: q, sessionId }),
        });
        if (!res.ok) {
          showApiFallback();
          return;
        }
        const j = (await res.json()) as {
          reply: { message: string; links: GuideLink[]; suggestLeadCapture?: 'quote' | 'handoff' | null };
          error?: string;
        };
        pushTitan(j.reply.message, j.reply.links);
        if (j.reply.suggestLeadCapture) setLeadMode(j.reply.suggestLeadCapture);
      } catch {
        showApiFallback();
      } finally {
        setBusy(false);
      }
    },
    [busy, sessionId, showApiFallback, pushTitan],
  );

  useEffect(() => {
    if (!open) {
      initialPromptSent.current = false;
      return;
    }
    const prompt = initialPrompt?.trim();
    if (!prompt || !sessionId || initialPromptSent.current || messages.length === 0) return;
    initialPromptSent.current = true;
    void ask(prompt);
    onInitialPromptConsumed?.();
  }, [open, initialPrompt, sessionId, messages.length, ask, onInitialPromptConsumed]);

  const submitLead = async (highPriority: boolean) => {
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/public/titan-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'lead',
          sessionId,
          lead: { ...lead, highPriority },
        }),
      });
      const j = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Could not save — email glossbossatx1@gmail.com or call Kyle directly.');
        return;
      }
      pushTitan(j.message ?? 'Thanks — we will be in touch.');
      setLeadMode(null);
      setLead(emptyLead());
    } catch {
      setErr('Network error — try again or contact Kyle directly.');
    } finally {
      setBusy(false);
    }
  };

  const onQuickAction = (item: (typeof QUICK_ACTIONS)[number]) => {
    if ('href' in item && item.href) {
      void track('action_click', { metadata: { href: item.href } });
      if (item.href === '/book') void track('booking_click');
      window.location.href = item.href;
      return;
    }
    if (item.action === 'quote') {
      setLeadMode('quote');
      pushTitan('Share a few details and the Gloss Boss team will send an accurate quote.');
      return;
    }
    if (item.action === 'kyle') {
      setLeadMode('handoff');
      pushTitan('Kyle handles fleet, complex jobs, and VIP requests personally. Drop your info below.');
    }
  };

  if (!open) return null;

  return (
    <div
      className="titan-site-guide-panel flex max-h-[min(640px,calc(100dvh-1.5rem))] w-[min(420px,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-2xl border border-emerald-500/30 bg-zinc-950/98 shadow-[0_24px_80px_rgba(0,0,0,0.65)] backdrop-blur-xl"
      role="dialog"
      aria-label="Ask Titan"
    >
          <header className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black via-zinc-950 to-emerald-950/30 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/10 font-black text-emerald-300 shadow-[0_0_20px_rgba(52,211,153,0.12)]">
                T
              </span>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-black uppercase tracking-wide text-white">
                  Ask Titan
                  <Sparkles className="h-3.5 w-3.5 text-emerald-300" />
                </p>
                <p className="text-[10px] text-zinc-500">Gloss Boss ATX · instant answers</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-white/5 hover:text-white"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                      : 'border border-white/10 bg-black/55 text-zinc-100'
                  }`}
                >
                  {m.text}
                  {m.links?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.links.map((l) => (
                        <Link
                          key={l.href}
                          href={l.href}
                          onClick={() => {
                            if (l.href === '/book') void track('booking_click');
                            void track('action_click', { metadata: { href: l.href } });
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold uppercase text-emerald-200 hover:bg-emerald-500/20"
                        >
                          {l.label}
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {busy && messages.length > 0 ? (
              <p className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-600">Titan is thinking…</p>
            ) : null}

            {leadMode ? (
              <div className="space-y-2 rounded-2xl border border-emerald-500/25 bg-black/60 p-3">
                <p className="text-xs font-bold text-emerald-200">
                  {leadMode === 'handoff' ? 'Contact Kyle' : 'Get a quote'}
                </p>
                {(['name', 'email', 'phone', 'vehicle', 'serviceNeeded', 'city', 'preferredDate'] as const).map((field) => (
                  <input
                    key={field}
                    placeholder={
                      field === 'name'
                        ? 'Name *'
                        : field === 'email'
                          ? 'Email'
                          : field === 'phone'
                            ? 'Phone *'
                            : field === 'vehicle'
                              ? 'Vehicle type'
                              : field === 'serviceNeeded'
                                ? 'Service needed'
                                : field === 'city'
                                  ? 'City'
                                  : 'Preferred date'
                    }
                    value={lead[field]}
                    onChange={(e) => setLead({ ...lead, [field]: e.target.value })}
                    className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 focus:border-emerald-400/40 focus:outline-none"
                  />
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submitLead(leadMode === 'handoff')}
                  className="w-full rounded-lg bg-emerald-500 py-2.5 text-[10px] font-black uppercase text-black transition hover:bg-emerald-400 disabled:opacity-50"
                >
                  {leadMode === 'handoff' ? 'Request Kyle callback' : 'Send quote request'}
                </button>
              </div>
            ) : null}

            {err ? <p className="text-xs text-red-300">{err}</p> : null}
          </div>

          <div className="border-t border-white/10 bg-black/80 px-3 py-3">
            <div className="mb-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => onQuickAction(a)}
                  className="rounded-lg border border-white/10 bg-zinc-900/80 px-2 py-2 text-[9px] font-bold uppercase leading-tight text-zinc-300 transition hover:border-emerald-400/35 hover:text-emerald-200"
                >
                  {a.label}
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void ask(input);
              }}
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about services, pricing, area…"
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-400/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-500 px-3 py-2.5 text-black transition hover:bg-emerald-400 disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-3 flex justify-center border-t border-white/5 pt-2">
              <PoweredByTitan compact />
            </div>
          </div>
    </div>
  );
}
