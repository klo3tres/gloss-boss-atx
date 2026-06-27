'use client';

import { useEffect, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export type TitanPageGuideConfig = {
  title: string;
  purpose: string;
  howToUse: string;
  firstAction: string;
  successLooksLike: string;
  storageKey: string;
};

export function TitanPageGuide({ config }: { config: TitanPageGuideConfig }) {
  const [open, setOpen] = useState(false);
  const dismissedKey = `titan_guide_dismissed_${config.storageKey}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setOpen(!window.localStorage.getItem(dismissedKey));
  }, [dismissedKey]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-[10px] font-black uppercase text-zinc-400 hover:text-gold-soft"
      >
        <HelpCircle className="h-3.5 w-3.5" /> Show guide
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-gold/20 bg-gradient-to-br from-black/70 to-zinc-950/80 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">What is this?</p>
          <h3 className="mt-1 text-lg font-black text-white">{config.title}</h3>
        </div>
        <button
          type="button"
          aria-label="Dismiss guide"
          onClick={() => {
            window.localStorage.setItem(dismissedKey, '1');
            setOpen(false);
          }}
          className="rounded-lg border border-white/10 p-2 text-zinc-500 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="font-black uppercase text-zinc-500">Purpose</dt>
          <dd className="mt-1 text-zinc-300">{config.purpose}</dd>
        </div>
        <div>
          <dt className="font-black uppercase text-zinc-500">How to use</dt>
          <dd className="mt-1 text-zinc-300">{config.howToUse}</dd>
        </div>
        <div>
          <dt className="font-black uppercase text-zinc-500">First action</dt>
          <dd className="mt-1 text-emerald-200">{config.firstAction}</dd>
        </div>
        <div>
          <dt className="font-black uppercase text-zinc-500">Success looks like</dt>
          <dd className="mt-1 text-zinc-300">{config.successLooksLike}</dd>
        </div>
      </dl>
    </div>
  );
}

export const TITAN_GUIDES = {
  home: {
    title: 'Titan Revenue Operator',
    purpose: 'Your daily money mission — what to do today to book jobs and recover revenue.',
    howToUse: 'Start with the 24-hour booking goal, then complete the top missions in order.',
    firstAction: 'Complete the highest-confidence mission with one tap.',
    successLooksLike: 'A booked detail or qualified lead logged before end of day.',
    storageKey: 'titan_home',
  },
  leadRadar: {
    title: 'Lead Radar',
    purpose: 'Mission control for finding buyer-intent leads on social and in your market.',
    howToUse: 'Use playbooks, paste posts, and log captures — not random searching.',
    firstAction: 'Run “Where to Hunt Now” and capture one post.',
    successLooksLike: 'New warm lead in Opportunity Board with next follow-up set.',
    storageKey: 'lead_radar',
  },
  opportunities: {
    title: 'Opportunity Board',
    purpose: 'Pipeline of warm leads, recoveries, and revenue you can close this week.',
    howToUse: 'Work top opportunities by estimated revenue. Text, call, or schedule follow-up.',
    firstAction: 'Send SMS or copy script on the highest-value open opportunity.',
    successLooksLike: 'Status moved to contacted, booked, or follow-up scheduled.',
    storageKey: 'opportunities',
  },
  inventory: {
    title: 'Inventory Operator',
    purpose: 'Track supplies before jobs stall — chemicals, towels, gloves, fuel.',
    howToUse: 'Update on-hand counts after jobs. Watch low-stock alerts.',
    firstAction: 'Set reorder thresholds on your top 3 supplies.',
    successLooksLike: 'No surprise stockouts before weekend bookings.',
    storageKey: 'inventory',
  },
  territory: {
    title: 'Territory Tracker',
    purpose: 'Door-to-door and neighborhood outreach from your phone.',
    howToUse: 'Add houses, mark outcomes, respect no-soliciting/DNR flags.',
    firstAction: 'Pick an unvisited neighborhood and knock 10 doors.',
    successLooksLike: 'Interested leads converted to opportunities.',
    storageKey: 'territory',
  },
  setup: {
    title: 'Setup Center',
    purpose: 'Launch readiness — connect payments, comms, calendar, and brand before scaling.',
    howToUse: 'Complete required systems first. Use test buttons to verify delivery.',
    firstAction: 'Set owner profile and brand settings.',
    successLooksLike: '100% required systems green with successful test notification.',
    storageKey: 'setup_center',
  },
  websiteIntelligence: {
    title: 'Website Intelligence',
    purpose: 'See GA, Clarity, Search Console, and Google Reviews status in one trust center.',
    howToUse: 'Check integration cards, fix gaps, sync reviews, and follow Titan recommendations.',
    firstAction: 'Confirm GA Realtime hits, mark Search Console verified, publish three reviews.',
    successLooksLike: 'Owner knows exactly what is live, what needs API keys, and what to do next.',
    storageKey: 'website_intelligence',
  },
} as const satisfies Record<string, TitanPageGuideConfig>;
