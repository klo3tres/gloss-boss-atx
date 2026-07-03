'use client';

import { Sparkles } from 'lucide-react';

const PROMPTS = [
  {
    label: 'Which membership fits my vehicle?',
    prompt: 'Which Gloss Boss membership tier (Bronze, Silver, or Gold) fits my vehicle and how often I drive?',
  },
  {
    label: 'Exterior vs full detail?',
    prompt: 'Should I book exterior detail, interior detail, or full detail for my vehicle?',
  },
  {
    label: 'Member savings estimate',
    prompt: 'How much would I save as a Gloss Boss member on a full detail?',
  },
  {
    label: 'Ceramic coating worth it?',
    prompt: 'Is ceramic coating worth it for my vehicle in Austin? What package do you recommend?',
  },
];

export function TitanServicesQuickActions() {
  return (
    <section className="rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/8 via-black to-zinc-950 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-gold-soft" />
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Ask Titan</p>
      </div>
      <p className="mt-2 text-sm text-zinc-400">Tap a question — Titan opens with your prompt ready to send.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {PROMPTS.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              try {
                sessionStorage.setItem('gb_titan_pending_prompt', item.prompt);
              } catch {
                /* ignore */
              }
              window.dispatchEvent(new CustomEvent('gb-open-titan', { detail: { prompt: item.prompt } }));
            }}
            className="rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide text-zinc-200 transition hover:border-gold/35 hover:bg-gold/10 hover:text-gold-soft sm:max-w-[48%]"
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
