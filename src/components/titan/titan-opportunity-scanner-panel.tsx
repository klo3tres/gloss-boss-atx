'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Crosshair, MessageSquare, Radar, Send, Target, Trophy, Zap } from 'lucide-react';
import type { TitanBriefing } from '@/lib/titan-briefing';
import {
  PLATFORM_LABELS,
  TIER_LABELS,
  TYPE_LABELS,
  WATCH_KEYWORDS,
  type OpportunityPlatform,
} from '@/lib/titan/opportunity-scanner';
import { displayMoney } from '@/lib/display-format';
import { TitanEmptyState } from '@/components/titan/titan-ui';
import {
  addOpportunityAction,
  addOpportunityToPipelineAction,
  dismissOpportunityAction,
  markOpportunityContactedAction,
  markOpportunityRepliedAction,
  resolveOpportunityAction,
} from '@/app/(dashboard)/admin/super/titan-opportunity-actions';

function tierClass(tier: string) {
  if (tier === 'whale') return 'border-amber-400/40 bg-amber-500/10 text-amber-200';
  if (tier === 'high_impact') return 'border-red-500/30 bg-red-500/10 text-red-200';
  if (tier === 'medium') return 'border-gold/30 bg-gold/5 text-gold-soft';
  return 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200';
}

function money(cents: number) {
  return displayMoney(cents);
}

export function TitanOpportunityScannerPanel({ briefing }: { briefing: TitanBriefing }) {
  const router = useRouter();
  const scanner = briefing.opportunityScanner;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [platform, setPlatform] = useState<OpportunityPlatform>('facebook_group');
  const [sourceLabel, setSourceLabel] = useState('');
  const [commentsCount, setCommentsCount] = useState('0');
  const [minutesAgo, setMinutesAgo] = useState('20');

  const run = async (id: string, fn: () => Promise<{ error?: string }>) => {
    setBusyId(id);
    setErr(null);
    const res = await fn();
    setBusyId(null);
    if (res.error) {
      setErr(res.error);
      return;
    }
    router.refresh();
  };

  const submitOpportunity = async () => {
    if (!title.trim()) {
      setErr('Paste the post headline or first line.');
      return;
    }
    const mins = Number(minutesAgo) || 0;
    const postedAt = new Date(Date.now() - mins * 60000).toISOString();
    setBusyId('new');
    setErr(null);
    const res = await addOpportunityAction({
      title: title.trim(),
      body: body.trim() || undefined,
      sourcePlatform: platform,
      sourceLabel: sourceLabel.trim() || undefined,
      commentsCount: Number(commentsCount) || 0,
      postedAt,
    });
    setBusyId(null);
    if (res.error) {
      setErr(res.error);
      return;
    }
    setTitle('');
    setBody('');
    setSourceLabel('');
    setShowForm(false);
    router.refresh();
  };

  if (!scanner.tablesReady) {
    return (
      <section className="rounded-3xl border border-amber-500/25 bg-black/55 p-6">
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-300">Titan Opportunity Scanner™</p>
        <p className="mt-2 text-xs text-amber-200">
          Apply Supabase migration <span className="font-mono">000092</span> to unlock Revenue Radar — opportunity feed, scoring, Daily Hunt, and First Responder.
        </p>
      </section>
    );
  }

  const hunt = scanner.dailyHunt;
  const first = scanner.firstResponder;

  return (
    <section className="rounded-3xl border border-cyan-500/25 bg-black/55 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-cyan-300" />
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300">Titan Opportunity Scanner™</p>
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            Revenue Radar — log public buying signals you find. No scraping private groups; you paste, Titan scores and tracks.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-[10px] font-black uppercase text-cyan-200 hover:bg-cyan-500/20"
        >
          {showForm ? 'Cancel' : 'Log opportunity'}
        </button>
      </div>

      {/* Daily Hunt */}
      <div className="mt-5 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
        <div className="flex items-center gap-2">
          <Crosshair className="h-4 w-4 text-cyan-200" />
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">Today&apos;s Hunt</p>
        </div>
        <div className="mt-3 flex flex-wrap gap-6">
          <div>
            <p className="text-[10px] font-black uppercase text-zinc-500">Opportunities</p>
            <p className="font-mono text-3xl font-black text-white">{hunt.count}</p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase text-zinc-500">Potential revenue</p>
            <p className="font-mono text-3xl font-black text-emerald-300">{money(hunt.potentialCents)}</p>
          </div>
        </div>
        {Object.keys(hunt.byType).length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-400">
            {Object.entries(hunt.byType).map(([type, n]) => (
              <li key={type} className="rounded-full border border-white/10 bg-black/40 px-3 py-1">
                {n} {TYPE_LABELS[type as keyof typeof TYPE_LABELS] ?? type}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-xs text-zinc-600">Log your first public post to start the hunt.</p>
        )}
      </div>

      {/* First Responder */}
      {first ? (
        <div className="mt-4 rounded-2xl border border-red-500/35 bg-red-500/10 p-5">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-red-300" />
            <p className="text-xs font-black uppercase text-red-200">Titan First Responder™ · {first.headline}</p>
          </div>
          <p className="mt-2 text-sm font-bold text-white">{first.opportunity.title}</p>
          <p className="mt-1 text-xs text-red-200/80">{first.reason}</p>
          <p className="mt-2 text-xs text-zinc-400">
            Potential value: <span className="font-mono font-bold text-emerald-300">{money(first.opportunity.valueCents)}</span>
            {' · '}
            Score <span className="font-mono text-white">{first.opportunity.score}</span>
          </p>
          {first.opportunity.suggestedReply ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/50 p-3">
              <p className="text-[10px] font-black uppercase text-zinc-500">Suggested reply</p>
              <p className="mt-1 text-xs text-zinc-300">{first.opportunity.suggestedReply}</p>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyId === first.opportunity.id}
              onClick={() =>
                void run(first.opportunity.id, () => markOpportunityRepliedAction(first.opportunity.id))
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-2 text-[10px] font-black uppercase text-red-100 disabled:opacity-50"
            >
              <Send className="h-3 w-3" />
              Mark replied
            </button>
            <button
              type="button"
              disabled={busyId === first.opportunity.id}
              onClick={() =>
                void run(first.opportunity.id, () => addOpportunityToPipelineAction(first.opportunity.id))
              }
              className="rounded-lg border border-white/15 px-3 py-2 text-[10px] font-black uppercase text-zinc-300 disabled:opacity-50"
            >
              Add lead
            </button>
          </div>
        </div>
      ) : null}

      {showForm ? (
        <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/40 p-4">
          <p className="text-[10px] font-black uppercase text-zinc-500">Paste a public post you found</p>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='e.g. "Can anyone recommend a mobile detailer in Round Rock?"'
            className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Full post text (optional)"
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm text-white"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-zinc-500">
              Platform
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as OpportunityPlatform)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-sm text-white"
              >
                {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-zinc-500">
              Group / source label
              <input
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="Round Rock Neighbors"
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Comments on post
              <input
                value={commentsCount}
                onChange={(e) => setCommentsCount(e.target.value)}
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
            <label className="text-xs text-zinc-500">
              Posted how many minutes ago?
              <input
                value={minutesAgo}
                onChange={(e) => setMinutesAgo(e.target.value)}
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black px-2 py-2 text-sm text-white"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={busyId === 'new'}
            onClick={() => void submitOpportunity()}
            className="rounded-xl bg-cyan-500/20 px-4 py-2 text-[10px] font-black uppercase text-cyan-100 disabled:opacity-50"
          >
            Score &amp; save
          </button>
        </div>
      ) : null}

      {err ? <p className="mt-3 text-xs text-red-300">{err}</p> : null}

      {/* Watch keywords */}
      <p className="mt-4 text-[10px] font-black uppercase text-zinc-600">Watch keywords</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {WATCH_KEYWORDS.slice(0, 8).map((kw) => (
          <span key={kw} className="rounded-full border border-white/5 bg-black/30 px-2 py-0.5 text-[10px] text-zinc-500">
            {kw}
          </span>
        ))}
      </div>

      {/* Feed */}
      <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Opportunity feed</p>
      <ul className="mt-3 space-y-3">
        {scanner.feed.length === 0 ? (
          <li>
            <TitanEmptyState
              title="No opportunities found yet"
              detail="Log one manually when you spot a public buying signal, or run Places discovery for B2B prospects."
            />
          </li>
        ) : (
          scanner.feed.map((o) => (
            <li key={o.id} className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${tierClass(o.tier)}`}>
                      {TIER_LABELS[o.tier]}
                    </span>
                    <span className="text-[10px] uppercase text-zinc-600">{PLATFORM_LABELS[o.sourcePlatform]}</span>
                    {o.sourceLabel ? <span className="text-[10px] text-zinc-600">· {o.sourceLabel}</span> : null}
                  </div>
                  <p className="mt-2 text-sm font-bold text-white">{o.title}</p>
                  {o.body ? <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{o.body}</p> : null}
                  <p className="mt-2 text-[10px] text-zinc-600">
                    {o.minutesAgo != null ? `${o.minutesAgo} min ago` : 'Recently'}
                    {' · '}
                    {o.commentsCount} comments · {o.engagementLevel} engagement
                    {o.keywordMatched ? ` · matched "${o.keywordMatched}"` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase text-zinc-500">Opportunity score</p>
                  <p className="font-mono text-2xl font-black text-cyan-300">{o.score}</p>
                  <p className="mt-1 text-[10px] text-emerald-400">{money(o.valueCents)} potential</p>
                  <p className="text-[10px] text-zinc-600">{o.closeLikelihoodPercent}% close likelihood</p>
                </div>
              </div>

              {o.suggestedReply ? (
                <div className="mt-3 rounded-lg border border-white/5 bg-black/30 p-3">
                  <p className="flex items-center gap-1 text-[10px] font-black uppercase text-zinc-500">
                    <MessageSquare className="h-3 w-3" /> Suggested outreach
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">{o.suggestedDm ?? o.suggestedReply}</p>
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => void run(o.id, () => markOpportunityRepliedAction(o.id))}
                  className="rounded-lg border border-cyan-500/25 px-2.5 py-1.5 text-[10px] font-black uppercase text-cyan-200 disabled:opacity-50"
                >
                  Reply
                </button>
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => void run(o.id, () => markOpportunityContactedAction(o.id))}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-zinc-400 disabled:opacity-50"
                >
                  Message
                </button>
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => void run(o.id, () => addOpportunityToPipelineAction(o.id))}
                  className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[10px] font-black uppercase text-zinc-400 disabled:opacity-50"
                >
                  Add lead
                </button>
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => void run(o.id, () => dismissOpportunityAction(o.id))}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase text-zinc-600 disabled:opacity-50"
                >
                  Dismiss
                </button>
                {o.leadId ? (
                  <Link href="/admin/leads" className="rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase text-gold-soft">
                    View lead →
                  </Link>
                ) : null}
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => void run(o.id, () => resolveOpportunityAction(o.id, 'won'))}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase text-emerald-500 disabled:opacity-50"
                >
                  Won
                </button>
                <button
                  type="button"
                  disabled={busyId === o.id}
                  onClick={() => void run(o.id, () => resolveOpportunityAction(o.id, 'lost', 'No response'))}
                  className="rounded-lg px-2.5 py-1.5 text-[10px] font-black uppercase text-red-400 disabled:opacity-50"
                >
                  Lost
                </button>
              </div>
            </li>
          ))
        )}
      </ul>

      {/* Won/Lost learning */}
      {scanner.learning.won + scanner.learning.lost > 0 ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-gold" />
            <p className="text-[10px] font-black uppercase text-zinc-500">Won / lost learning</p>
          </div>
          <p className="mt-2 text-xs text-zinc-400">
            Win rate {scanner.learning.winRatePercent}% ({scanner.learning.won} won · {scanner.learning.lost} lost)
            {scanner.learning.topWinType ? ` · Best type: ${TYPE_LABELS[scanner.learning.topWinType]}` : ''}
            {scanner.learning.topLostReason ? ` · Top loss reason: ${scanner.learning.topLostReason}` : ''}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-zinc-600">
          <Target className="mr-1 inline h-3 w-3" />
          Mark opportunities won or lost to train Titan&apos;s scoring over time.
        </p>
      )}
    </section>
  );
}
