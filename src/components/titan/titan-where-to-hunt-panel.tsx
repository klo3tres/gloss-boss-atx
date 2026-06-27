'use client';

import type { HuntSource } from '@/lib/titan/lead-radar-hunt';
import { TODAYS_EXACT_HUNT_PLAN } from '@/lib/titan/lead-radar-hunt';
import type { LeadCapturePrefill } from '@/components/titan/titan-lead-capture-modal';

export function TitanWhereToHuntPanel({
  sources,
  onOpenCapture,
}: {
  sources: HuntSource[];
  onOpenCapture: (prefill: LeadCapturePrefill) => void;
}) {
  return (
    <section className="rounded-3xl border border-emerald-500/20 bg-black/55 p-6">
      <h2 className="text-sm font-black uppercase text-white">Where to Hunt Now</h2>
      <p className="mt-1 text-xs text-zinc-500">Prioritized sources for Gloss Boss — start at the top.</p>

      <div className="mt-4 rounded-2xl border border-gold/20 bg-gold/5 p-4">
        <p className="text-[10px] font-black uppercase text-gold-soft">Today&apos;s exact hunt plan</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-zinc-300">
          {TODAYS_EXACT_HUNT_PLAN.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {sources.map((s) => (
          <article key={s.id} className="rounded-xl border border-white/8 bg-black/40 p-4 text-xs">
            <p className="text-sm font-bold text-white">{s.title}</p>
            <p className="mt-1 text-zinc-500">{s.whyItMatters}</p>
            <p className="mt-2"><span className="font-black uppercase text-zinc-600">Search: </span>{s.whatToSearch.join(' · ')}</p>
            <p className="mt-1"><span className="font-black uppercase text-zinc-600">Paste: </span>{s.whatToPaste}</p>
            <p className="mt-1 text-cyan-200">{s.messageAngle}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-black uppercase">
              <span className="text-emerald-300">{s.expectedValue}</span>
              <span className="text-zinc-500">Effort {s.effort}</span>
              <span className={s.urgency === 'high' ? 'text-rose-300' : 'text-amber-300'}>Urgency {s.urgency}</span>
            </div>
            <button
              type="button"
              onClick={() => onOpenCapture({ sourceName: s.title, rawText: '', notes: s.whatToPaste })}
              className="mt-3 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-200"
            >
              Paste Lead / Capture Post
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
