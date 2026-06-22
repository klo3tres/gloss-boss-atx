'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Brain, CloudRain, Search, Sparkles, Target, Zap } from 'lucide-react';
import type { TitanBriefing } from '@/lib/titan-briefing';
import { TitanIntelligencePanels } from '@/components/admin/titan-intelligence-panels';
import { TitanGrowthPanels } from '@/components/admin/titan-growth-panels';
import { TitanLogo } from '@/components/titan/titan-brand';
import { TitanActivityTimeline } from '@/components/titan/titan-activity-timeline';
import { TitanRoiPanel } from '@/components/titan/titan-roi-panel';
import { TitanWorkspaceForm } from '@/components/admin/titan-workspace-form';
import { TitanWidgetStatsPanel, TitanTerritoryPanel } from '@/components/titan/titan-public-panels';
import { titanCommandCenterTitle } from '@/lib/titan/branding';
import { formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';

const ASK_SUGGESTIONS = [
  'Which customers have not booked in 90 days?',
  'Show highest value customers',
  'What services make the most money?',
  'What should I focus on this week?',
  'Who owes money?',
  'Show follow-ups due',
  'Show customers who complained about pet hair',
  'Which customers should I call today?',
];

function money(cents: number) {
  return displayMoney(cents);
}

function priorityClass(p: 'high' | 'medium' | 'low') {
  if (p === 'high') return 'border-red-500/30 bg-red-500/5 text-red-200';
  if (p === 'medium') return 'border-gold/30 bg-gold/5 text-gold-soft';
  return 'border-white/10 bg-black/40 text-zinc-300';
}

export function TitanCommandCenter({ briefing }: { briefing: TitanBriefing }) {
  const router = useRouter();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<{ title: string; summary: string; bullets: string[]; href?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ask = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/titan/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text }),
      });
      const j = (await res.json()) as { title: string; summary: string; bullets: string[]; href?: string; error?: string };
      if (!res.ok) {
        setErr(j.error ?? 'Query failed');
        return;
      }
      setAnswer(j);
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  };

  const { insights, forecast } = briefing;
  const name = briefing.ownerName?.split(' ')[0] ?? 'Owner';

  return (
    <div className="titan-command-center space-y-6">
      {/* Titan header */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-950 via-black to-zinc-900 p-6 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.14),transparent_55%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="max-w-2xl">
            <TitanLogo size="md" />
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.35em] text-zinc-500">{briefing.betaLabel}</p>
            <h2 className="mt-1 text-xl font-black uppercase tracking-wide text-white md:text-2xl">{titanCommandCenterTitle()}</h2>
            <p className="mt-1 text-xs text-zinc-500">{briefing.workspace.businessName} · {briefing.workspace.industry.replace(/_/g, ' ')}</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300 md:text-base">
              {briefing.greeting}, {name}. You are projected to finish this month at{' '}
              <span className="font-mono font-bold text-white">{money(forecast.projectedMonthCents)}</span>
              {insights.revenueTargetCents ? (
                <>
                  {' '}
                  against a goal of <span className="font-mono text-gold-soft">{money(insights.revenueTargetCents)}</span>.
                  {forecast.jobsNeededForGoal != null && forecast.jobsNeededForGoal > 0 ? (
                    <> You need about {forecast.jobsNeededForGoal} more full details.</>
                  ) : null}
                </>
              ) : (
                '. Set a monthly revenue goal in Admin → Goals to unlock gap tracking.'
              )}
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">Updated {formatChicagoDateTime(briefing.generatedAt)}</p>
          </div>
          <div className="rounded-2xl border border-gold/25 bg-black/60 px-5 py-4 text-right">
            <p className="text-[10px] font-black uppercase text-zinc-500">Revenue today</p>
            <p className="font-mono text-3xl font-black text-gold">{money(insights.revenueTodayCents)}</p>
            <p className="mt-1 text-[10px] text-zinc-500">MTD {money(insights.revenueMonthCents)}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <TitanRoiPanel roi={briefing.roi} />
        <TitanActivityTimeline events={briefing.activity} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <TitanWidgetStatsPanel stats={briefing.widgetStats} />
        <TitanTerritoryPanel territory={briefing.territory} />
      </div>

      <TitanWorkspaceForm workspace={briefing.workspace} compact />

      {/* Insights grid */}
      <section>
        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Titan insights</p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Follow-ups due', value: String(insights.followUpsDue), hint: `${insights.followUpsPending} in queue`, href: '/admin/follow-ups' },
            { label: 'Open leads', value: String(insights.openLeads), hint: 'Pipeline active', href: '/admin/leads' },
            { label: 'Open estimates', value: String(insights.openEstimates), hint: 'Awaiting approval', href: '/admin/leads' },
            { label: 'Exceptions', value: String(insights.openExceptions), hint: 'Need attention', href: '/admin/exceptions' },
            { label: 'Rebook candidates', value: String(insights.rebookCandidates), hint: 'Automated queue', href: '/admin/follow-ups' },
            {
              label: 'Est. lost revenue',
              value: money(insights.estimatedLostRevenueCents),
              hint: 'Overdue follow-ups',
              href: '/admin/follow-ups',
            },
            {
              label: 'Top service MTD',
              value: insights.topService ? insights.topService.label : '—',
              hint: insights.topService ? money(insights.topService.revenueCents) : 'No data',
              href: '/admin/revenue',
            },
            {
              label: 'Titan memory',
              value: String(insights.memoryEvents30d),
              hint: 'Interactions (30d)',
              href: '/admin/customers',
            },
          ].map((tile) => (
            <Link
              key={tile.label}
              href={tile.href}
              className="group rounded-2xl border border-white/10 bg-zinc-950/80 p-4 transition hover:border-gold/30"
            >
              <p className="text-[10px] font-black uppercase text-zinc-500">{tile.label}</p>
              <p className="mt-1 truncate text-lg font-black text-white">{tile.value}</p>
              <p className="mt-1 text-[10px] text-zinc-600 group-hover:text-zinc-400">{tile.hint}</p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Morning briefing / recommendations */}
        <section className="rounded-3xl border border-gold/20 bg-black/55 p-6">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-gold" />
            <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Today&apos;s actions</p>
          </div>
          <p className="mt-2 text-sm text-zinc-500">Top priorities ranked by revenue impact — not another dashboard card.</p>
          <ul className="mt-4 space-y-3">
            {briefing.recommendations.map((action, i) => (
              <li key={action.id}>
                <Link
                  href={action.href}
                  className={`flex items-start gap-3 rounded-2xl border p-4 transition hover:brightness-110 ${priorityClass(action.priority)}`}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/50 text-[10px] font-black">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold">{action.title}</p>
                    <p className="mt-1 text-xs opacity-80">{action.detail}</p>
                    {action.impactCents ? (
                      <p className="mt-1 text-[10px] font-mono opacity-70">~{money(action.impactCents)} opportunity</p>
                    ) : null}
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 opacity-50" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Ask Titan */}
        <section className="rounded-3xl border border-white/10 bg-zinc-950 p-6">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-gold-soft" />
            <p className="text-xs font-black uppercase tracking-[0.22em] text-gold-soft">Ask Titan</p>
          </div>
          <p className="mt-2 text-sm text-zinc-500">Search your business memory — customers, money, follow-ups, estimates.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {ASK_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQuestion(s);
                  void ask(s);
                }}
                className="rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-[10px] font-bold text-zinc-400 hover:border-gold/30 hover:text-gold-soft"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            className="mt-4 flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Show customers who spent over $500"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white placeholder-zinc-600 focus:border-gold/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-5 py-3 text-[10px] font-black uppercase text-black disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {busy ? 'Thinking…' : 'Ask'}
            </button>
          </form>
          {err ? <p className="mt-3 text-xs text-red-300">{err}</p> : null}
          {answer ? (
            <div className="mt-4 rounded-2xl border border-white/5 bg-black/50 p-4">
              <p className="text-xs font-black uppercase text-gold-soft">{answer.title}</p>
              <p className="mt-2 text-sm text-zinc-200">{answer.summary}</p>
              {answer.bullets.length > 0 ? (
                <ul className="mt-3 space-y-1.5 border-t border-white/5 pt-3 text-xs text-zinc-400">
                  {answer.bullets.map((b, i) => (
                    <li key={i}>· {b}</li>
                  ))}
                </ul>
              ) : null}
              {answer.href ? (
                <Link href={answer.href} className="mt-3 inline-flex text-[10px] font-black uppercase text-gold-soft hover:underline">
                  Open in admin →
                </Link>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>

      {/* Weather + Memory row */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-3xl border border-white/10 bg-black/45 p-6">
          <div className="flex items-center gap-2">
            <CloudRain className="h-4 w-4 text-sky-400" />
            <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">Weather intelligence</p>
          </div>
          {briefing.weather.configured ? (
            <div className="mt-4 space-y-2">
              <p className="text-sm text-zinc-200">{briefing.weather.summary ?? 'Conditions look manageable.'}</p>
              {briefing.weather.rainWarning ? (
                <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                  {briefing.weather.rainWarning}
                  {briefing.weather.jobsAtRisk > 0 ? ` · Review ${briefing.weather.jobsAtRisk} scheduled job(s).` : ''}
                </p>
              ) : (
                <p className="text-xs text-zinc-500">No rain conflicts flagged for today.</p>
              )}
              <Link href="/admin/exceptions?category=weather" className="text-[10px] font-black uppercase text-gold-soft hover:underline">
                Weather exceptions →
              </Link>
            </div>
          ) : (
            <p className="mt-4 text-xs text-zinc-500">Add OPENWEATHER_API_KEY in integrations to enable dispatch weather warnings.</p>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-black/45 p-6">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-300" />
            <p className="text-xs font-black uppercase tracking-[0.22em] text-zinc-400">Titan memory</p>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Every note, message, notification, and job event — your institutional memory.</p>
          <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto">
            {briefing.memoryRecent.length === 0 ? (
              <li className="text-xs text-zinc-600">No recent interactions logged.</li>
            ) : (
              briefing.memoryRecent.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs">
                  <span className="truncate text-zinc-300">{m.title}</span>
                  <span className="shrink-0 text-[10px] uppercase text-zinc-600">{m.kind}</span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      {/* Forecast strip */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/5 bg-zinc-950 px-6 py-4">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-emerald-400" />
          <p className="text-xs font-black uppercase text-zinc-400">Titan forecast</p>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <span className="text-zinc-400">
            Forecast: <span className="font-mono font-bold text-emerald-300">{money(briefing.forecast.projectedMonthCents)}</span>
          </span>
          <span className="text-zinc-400">
            Confidence: <span className="font-mono text-white">{briefing.forecast.confidencePercent}%</span>
          </span>
          <span className="text-zinc-400">
            Days left: <span className="font-mono text-white">{briefing.forecast.daysLeftInMonth}</span>
          </span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="text-[10px] font-black uppercase text-gold-soft hover:underline"
          >
            Refresh briefing
          </button>
        </div>
      </section>

      <TitanGrowthPanels briefing={briefing} />

      <TitanIntelligencePanels briefing={briefing} />
    </div>
  );
}
