'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MessageCircle, X, Send, ChevronRight } from 'lucide-react';
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
  { label: 'See memberships', href: '/memberships' },
  { label: 'Fleet / business', href: '/fleet' },
  { label: 'Contact Gloss Boss', href: '/#contact' },
  { label: 'Before & after gallery', href: '/gallery' },
  { label: 'First-time discount', action: 'discount' as const },
];

const HIDDEN_PREFIXES = ['/admin', '/tech', '/dashboard', '/login', '/signup', '/customer'];

function emptyLead(): LeadForm {
  return { name: '', email: '', phone: '', vehicle: '', serviceNeeded: '', city: '', preferredDate: '' };
}

export function TitanSiteGuideWidget() {
  const pathname = usePathname();
  const hidden = useMemo(() => HIDDEN_PREFIXES.some((p) => pathname.startsWith(p)), [pathname]);
  const [open, setOpen] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [leadMode, setLeadMode] = useState<'quote' | 'handoff' | null>(null);
  const [lead, setLead] = useState<LeadForm>(emptyLead());
  const [err, setErr] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const pushTitan = (text: string, links?: GuideLink[]) => {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role: 'titan', text, links }]);
  };

  const init = useCallback(async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/public/titan-guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'welcome' }),
      });
      const j = (await res.json()) as { sessionId: string; reply: { message: string; links: GuideLink[] } };
      setSessionId(j.sessionId);
      pushTitan(j.reply.message, j.reply.links);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (open && messages.length === 0) void init();
  }, [open, messages.length, init]);

  useEffect(() => {
    if (open && sessionId) void track('open');
  }, [open, sessionId, track]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, leadMode]);

  const ask = async (question: string) => {
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
      const j = (await res.json()) as {
        reply: { message: string; links: GuideLink[]; suggestLeadCapture?: 'quote' | 'handoff' | null };
        error?: string;
      };
      if (!res.ok) {
        setErr(j.error ?? 'Something went wrong');
        return;
      }
      pushTitan(j.reply.message, j.reply.links);
      if (j.reply.suggestLeadCapture) setLeadMode(j.reply.suggestLeadCapture);
    } finally {
      setBusy(false);
    }
  };

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
        setErr(j.error ?? 'Could not save');
        return;
      }
      pushTitan(j.message ?? 'Thanks — we will be in touch.');
      setLeadMode(null);
      setLead(emptyLead());
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
      pushTitan('Want me to help you get a quote? Share a few details below.');
      return;
    }
    if (item.action === 'discount') {
      void ask('What first-time customer discounts do you offer?');
    }
  };

  if (hidden) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-full border border-emerald-400/40 bg-zinc-950 px-4 py-3 text-sm font-bold text-white shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition hover:border-emerald-300/60 hover:bg-zinc-900"
          aria-label="Ask Titan"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-300">
            <MessageCircle className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Ask Titan</span>
        </button>
      ) : null}

      {open ? (
        <div className="fixed bottom-5 right-5 z-[95] flex h-[min(560px,calc(100vh-2rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-emerald-500/25 bg-zinc-950 shadow-2xl">
          <header className="flex items-center justify-between border-b border-white/10 bg-black/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/40 bg-emerald-500/10 font-black text-emerald-300">
                T
              </span>
              <div>
                <p className="text-sm font-black uppercase tracking-wide text-white">Titan Site Guide</p>
                <p className="text-[10px] text-zinc-500">Premium help · Gloss Boss ATX</p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </header>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user' ? 'bg-emerald-600/90 text-white' : 'border border-white/10 bg-black/50 text-zinc-200'
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

            {leadMode ? (
              <div className="rounded-2xl border border-emerald-500/20 bg-black/60 p-3 space-y-2">
                <p className="text-xs font-bold text-emerald-200">
                  {leadMode === 'handoff' ? 'Request a call from Kyle' : 'Get a quote'}
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
                            ? 'Phone'
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
                    className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600"
                  />
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => submitLead(leadMode === 'handoff')}
                  className="w-full rounded-lg bg-emerald-500 py-2 text-[10px] font-black uppercase text-black disabled:opacity-50"
                >
                  {leadMode === 'handoff' ? 'Have Kyle contact me' : 'Send quote request'}
                </button>
              </div>
            ) : null}

            {err ? <p className="text-xs text-red-300">{err}</p> : null}
          </div>

          <div className="border-t border-white/10 bg-black/70 px-3 py-2">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {QUICK_ACTIONS.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  onClick={() => onQuickAction(a)}
                  className="shrink-0 rounded-full border border-white/10 bg-zinc-900 px-2.5 py-1 text-[9px] font-bold uppercase text-zinc-300 hover:border-emerald-400/30 hover:text-emerald-200"
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
                placeholder="Ask about services, pricing, area..."
                className="min-w-0 flex-1 rounded-xl border border-white/10 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-emerald-400/40 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-xl bg-emerald-500 px-3 py-2.5 text-black disabled:opacity-50"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
            <div className="mt-2 flex justify-center">
              <PoweredByTitan compact />
            </div>
            <button
              type="button"
              className="mt-2 w-full rounded-lg border border-emerald-500/30 py-2 text-[10px] font-black uppercase text-emerald-200 hover:bg-emerald-500/10"
              onClick={() => {
                setLeadMode('handoff');
                pushTitan('Share your contact info and Kyle will reach out personally.');
              }}
            >
              Have Kyle contact me
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function TitanSiteGuideRoot() {
  return <TitanSiteGuideWidget />;
}
