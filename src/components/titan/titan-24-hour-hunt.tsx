'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Radar, Target } from 'lucide-react';
import type { HuntCategory, LeadPlaybook } from '@/lib/titan/lead-radar-hunt';
import { RECENCY_GUIDANCE } from '@/lib/titan/lead-radar-hunt';
import { LeadRadarSearchButtons } from '@/components/titan/titan-lead-capture-modal';
import type { LeadCapturePrefill } from '@/components/titan/titan-lead-capture-modal';
import { displayMoney } from '@/lib/display-format';

function money(dollars: number) {
  return displayMoney(Math.round(dollars * 100));
}

function HuntCategoryCard({
  category,
  onOpenCapture,
}: {
  category: HuntCategory;
  onOpenCapture: (prefill: LeadCapturePrefill) => void;
}) {
  const [open, setOpen] = useState(false);

  const startHunt = () => setOpen(true);

  const pasteLead = () => {
    onOpenCapture({
      sourceType: category.id === 'warm_people' ? 'referral' : category.id === 'local_business' ? 'google_places' : 'facebook_group',
      sourceName: category.title,
      notes: `Hunt: ${category.title}`,
      rawText: '',
    });
  };

  const urgencyColor = category.urgency === 'high' ? 'text-rose-300' : category.urgency === 'medium' ? 'text-amber-300' : 'text-zinc-400';

  return (
    <article className="rounded-2xl border border-white/10 bg-black/45 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase text-cyan-300">{category.title}</p>
          <p className="mt-1 text-xs text-zinc-400">{category.description}</p>
        </div>
        <div className="text-right text-[10px] font-black uppercase shrink-0">
          <p className="text-emerald-300">{category.revenueRange}</p>
          <p className="text-zinc-500">Effort: {category.effort}</p>
          <p className={urgencyColor}>Urgency: {category.urgency}</p>
        </div>
      </div>

      {open ? (
        <div className="mt-4 space-y-3 text-xs">
          <div>
            <p className="font-black uppercase text-zinc-500">What to search</p>
            <ul className="mt-1 list-inside list-disc text-zinc-300">{category.whatToSearch.map((q) => <li key={q}>{q}</li>)}</ul>
          </div>
          <div>
            <p className="font-black uppercase text-zinc-500">Where to search</p>
            <ul className="mt-1 list-inside list-disc text-zinc-300">{category.whereToSearch.map((w) => <li key={w}>{w}</li>)}</ul>
          </div>
          <p className="rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-zinc-400">{category.pasteHint}</p>
          <p className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 italic text-cyan-100">{category.suggestedReply}</p>
          <ul className="list-inside list-disc text-zinc-500">{RECENCY_GUIDANCE.map((r) => <li key={r}>{r}</li>)}</ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={startHunt} className="rounded-lg bg-cyan-500 px-3 py-2 text-[10px] font-black uppercase text-black">Start Hunt</button>
        <button type="button" onClick={pasteLead} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-200">Paste Lead / Capture Post</button>
      </div>
    </article>
  );
}

function PlaybookCard({ playbook, onOpenCapture }: { playbook: LeadPlaybook; onOpenCapture: (prefill: LeadCapturePrefill) => void }) {
  return (
    <article className="rounded-xl border border-white/8 bg-black/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-violet-300">{playbook.platform}</p>
          <p className="mt-1 text-sm font-bold text-white">{playbook.title}</p>
          <p className="mt-1 font-mono text-xs text-zinc-400">&ldquo;{playbook.searchQuery}&rdquo;</p>
        </div>
        <p className="shrink-0 font-mono text-sm font-black text-emerald-300">{money(playbook.estimatedRevenueMin)}–{money(playbook.estimatedRevenueMax)}</p>
      </div>
      {playbook.suggestedAction ? <p className="mt-2 text-xs text-zinc-500">{playbook.suggestedAction}</p> : null}
      <LeadRadarSearchButtons platform={playbook.platform} query={playbook.searchQuery} />
      <button
        type="button"
        onClick={() => onOpenCapture({
          sourceType: playbook.platform.toLowerCase().includes('google') ? 'google_places' : playbook.platform.toLowerCase().includes('reddit') ? 'reddit' : playbook.platform.toLowerCase().includes('nextdoor') ? 'nextdoor' : 'facebook_group',
          sourceName: playbook.title,
          rawText: '',
          notes: `Playbook: ${playbook.searchQuery}`,
          estimatedRevenue: (playbook.estimatedRevenueMin + playbook.estimatedRevenueMax) / 2,
        })}
        className="mt-3 rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft"
      >
        Paste Lead / Capture Post
      </button>
    </article>
  );
}

export function Titan24HourHunt({
  categories,
  playbooks,
  playbooksReady,
  onOpenCapture,
}: {
  categories: HuntCategory[];
  playbooks: LeadPlaybook[];
  playbooksReady: boolean;
  onOpenCapture: (prefill: LeadCapturePrefill) => void;
}) {
  return (
    <section className="space-y-6 overflow-x-hidden">
      <header className="rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-black/50 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Target className="h-5 w-5 text-amber-300" />
          <h2 className="text-lg font-black text-white">24-Hour Customer Hunt</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">Search manually → paste real posts → copy reply → convert to Opportunity Board. No scraping or automated DMs.</p>
        <ul className="mt-3 list-inside list-disc text-xs text-zinc-500">{RECENCY_GUIDANCE.map((r) => <li key={r}>{r}</li>)}</ul>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {categories.map((c) => (
          <HuntCategoryCard key={c.id} category={c} onOpenCapture={onOpenCapture} />
        ))}
      </div>

      <div className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Radar className="h-4 w-4 text-violet-300" />
          <h3 className="text-sm font-black uppercase text-white">Search playbooks (buyer intent)</h3>
        </div>
        {!playbooksReady ? (
          <p className="mt-3 text-xs text-amber-100">Apply migrations <code className="text-amber-200">000102</code> and <code className="text-amber-200">000104</code> for buyer-intent playbooks.</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {playbooks.map((p) => (
              <PlaybookCard key={p.id} playbook={p} onOpenCapture={onOpenCapture} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
