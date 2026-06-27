'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, ExternalLink, Radar, Target } from 'lucide-react';
import type { HuntCategory, LeadPlaybook } from '@/lib/titan/lead-radar-hunt';
import { buildSearchUrls } from '@/lib/titan/lead-radar-hunt';
import { captureFromPlaybookAction } from '@/app/(dashboard)/admin/titan/lead-radar-actions';
import { displayMoney } from '@/lib/display-format';

function money(dollars: number) {
  return displayMoney(Math.round(dollars * 100));
}

function SearchButtons({ platform, query }: { platform: string; query: string }) {
  const [toast, setToast] = useState<string | null>(null);
  const urls = buildSearchUrls(platform, query);
  const p = platform.toLowerCase();

  const copyQuery = async (label: string) => {
    await navigator.clipboard.writeText(query);
    setToast(`Copied — paste into ${label} group search.`);
    setTimeout(() => setToast(null), 3000);
  };

  const buttons: Array<{ label: string; href?: string; onClick?: () => void }> = [
    { label: 'Search Google', href: urls.google },
  ];

  if (p.includes('facebook')) {
    buttons.push({ label: 'Search Facebook', href: urls.facebook, onClick: () => void copyQuery('Facebook') });
  } else if (p.includes('nextdoor')) {
    buttons.push({ label: 'Search Nextdoor', href: urls.nextdoor, onClick: () => void copyQuery('Nextdoor') });
  } else if (p.includes('reddit')) {
    buttons.push({ label: 'Search Reddit', href: urls.reddit });
  } else {
    buttons.push(
      { label: 'Search Facebook', onClick: () => void copyQuery('Facebook') },
      { label: 'Search Nextdoor', onClick: () => void copyQuery('Nextdoor') },
      { label: 'Search Reddit', href: urls.reddit },
    );
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) =>
          b.href ? (
            <a
              key={b.label}
              href={b.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={b.onClick}
              className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 px-3 py-1.5 text-[10px] font-black uppercase text-cyan-200"
            >
              <ExternalLink className="h-3 w-3" /> {b.label}
            </a>
          ) : (
            <button
              key={b.label}
              type="button"
              onClick={b.onClick}
              className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300"
            >
              <Copy className="h-3 w-3" /> {b.label}
            </button>
          ),
        )}
      </div>
      {toast ? <p className="mt-2 text-[10px] text-emerald-300">{toast}</p> : null}
    </div>
  );
}

function HuntCategoryCard({ category }: { category: HuntCategory }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const startHunt = () => {
    setOpen(true);
    setMsg('Search the queries below, then paste results into Lead Radar or use Capture Result.');
  };

  const captureResult = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await captureFromPlaybookAction({
        sourceType: category.id === 'warm_people' ? 'referral' : category.id === 'local_business' ? 'google_places' : 'facebook_group',
        sourceName: category.title,
        rawText: `[Hunt] ${category.title} — ${category.whatToSearch.slice(0, 2).join(', ')}`,
        estimatedRevenue: 175,
      });
      if (res.error) setMsg(res.error);
      else {
        setMsg('Placeholder captured — paste real post text to replace.');
        router.refresh();
      }
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
            <ul className="mt-1 list-inside list-disc text-zinc-300">
              {category.whatToSearch.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </div>
          <div>
            <p className="font-black uppercase text-zinc-500">Where to search</p>
            <ul className="mt-1 list-inside list-disc text-zinc-300">
              {category.whereToSearch.map((w) => <li key={w}>{w}</li>)}
            </ul>
          </div>
          <p className="rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-zinc-400">{category.pasteHint}</p>
          <p className="rounded-lg border border-cyan-500/15 bg-cyan-500/5 px-3 py-2 italic text-cyan-100">{category.suggestedReply}</p>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={startHunt} className="rounded-lg bg-cyan-500 px-3 py-2 text-[10px] font-black uppercase text-black">
          Start Hunt
        </button>
        <button type="button" disabled={pending} onClick={captureResult} className="rounded-lg border border-emerald-500/30 px-3 py-2 text-[10px] font-black uppercase text-emerald-200 disabled:opacity-50">
          Capture Result
        </button>
        <Link href="/admin/titan/lead-radar?capture=1" className="rounded-lg border border-white/10 px-3 py-2 text-[10px] font-black uppercase text-zinc-400">
          Paste lead
        </Link>
      </div>
      {msg ? <p className="mt-2 text-[10px] text-emerald-300">{msg}</p> : null}
    </article>
  );
}

function PlaybookCard({ playbook }: { playbook: LeadPlaybook }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const capture = () => {
    setMsg(null);
    startTransition(async () => {
      const res = await captureFromPlaybookAction({
        sourceType: playbook.platform.includes('google') ? 'google_places' : playbook.platform.includes('reddit') ? 'reddit' : playbook.platform.includes('nextdoor') ? 'nextdoor' : 'facebook_group',
        sourceName: playbook.title,
        rawText: `[Playbook] ${playbook.searchQuery} — ${playbook.intentToFind ?? playbook.targetCustomer ?? 'prospect'}`,
        estimatedRevenue: (playbook.estimatedRevenueMin + playbook.estimatedRevenueMax) / 2,
      });
      if (res.error) setMsg(res.error);
      else {
        setMsg('Playbook hunt logged — paste real contact when found.');
        router.refresh();
      }
    });
  };

  return (
    <article className="rounded-xl border border-white/8 bg-black/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase text-violet-300">{playbook.platform}</p>
          <p className="mt-1 text-sm font-bold text-white">{playbook.title}</p>
          <p className="mt-1 font-mono text-xs text-zinc-400">&ldquo;{playbook.searchQuery}&rdquo;</p>
        </div>
        <p className="shrink-0 font-mono text-sm font-black text-emerald-300">
          {money(playbook.estimatedRevenueMin)}–{money(playbook.estimatedRevenueMax)}
        </p>
      </div>
      {playbook.suggestedAction ? <p className="mt-2 text-xs text-zinc-500">{playbook.suggestedAction}</p> : null}
      <SearchButtons platform={playbook.platform} query={playbook.searchQuery} />
      <button type="button" disabled={pending} onClick={capture} className="mt-3 rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft disabled:opacity-50">
        Capture Result
      </button>
      {msg ? <p className="mt-2 text-[10px] text-emerald-300">{msg}</p> : null}
    </article>
  );
}

export function Titan24HourHunt({
  categories,
  playbooks,
  playbooksReady,
}: {
  categories: HuntCategory[];
  playbooks: LeadPlaybook[];
  playbooksReady: boolean;
}) {
  return (
    <section className="space-y-6 overflow-x-hidden">
      <header className="rounded-3xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 to-black/50 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <Target className="h-5 w-5 text-amber-300" />
          <h2 className="text-lg font-black text-white">24-Hour Customer Hunt</h2>
        </div>
        <p className="mt-2 text-sm text-zinc-400">
          Tactical actions to find real customers today. Search manually, paste results, copy replies — no scraping or automated DMs.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {categories.map((c) => (
          <HuntCategoryCard key={c.id} category={c} />
        ))}
      </div>

      <div className="rounded-3xl border border-violet-500/20 bg-violet-500/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Radar className="h-4 w-4 text-violet-300" />
          <h3 className="text-sm font-black uppercase text-white">Search playbooks</h3>
        </div>
        {!playbooksReady ? (
          <p className="mt-3 text-xs text-amber-100">
            Apply migration <code className="text-amber-200">000102_titan_lead_radar_v2.sql</code> to load seeded playbooks.
          </p>
        ) : playbooks.length === 0 ? (
          <p className="mt-3 text-xs text-zinc-500">No playbooks seeded yet.</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {playbooks.map((p) => (
              <PlaybookCard key={p.id} playbook={p} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
