'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Brain,
  CloudRain,
  Crosshair,
  DollarSign,
  Radar,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Wrench,
  Zap,
} from 'lucide-react';
import type { TitanBriefing } from '@/lib/titan-briefing';
import { TitanIntelligencePanels } from '@/components/admin/titan-intelligence-panels';
import { TitanGrowthPanels } from '@/components/admin/titan-growth-panels';
import { TitanLogo } from '@/components/titan/titan-brand';
import { TitanActivityTimeline } from '@/components/titan/titan-activity-timeline';
import { TitanRoiPanel } from '@/components/titan/titan-roi-panel';
import { TitanWorkspaceForm } from '@/components/admin/titan-workspace-form';
import { TitanWidgetStatsPanel, TitanTerritoryPanel } from '@/components/titan/titan-public-panels';
import { TitanOpportunityScannerPanel } from '@/components/titan/titan-opportunity-scanner-panel';
import { TitanSetupBanner, TitanMetricTile, TitanSection, TitanEmptyState } from '@/components/titan/titan-ui';
import { TitanActionStrip } from '@/components/titan/titan-action-strip';
import { titanCommandCenterTitle } from '@/lib/titan/branding';
import { formatChicagoDateTime } from '@/lib/chicago-time';
import { displayMoney } from '@/lib/display-format';

const ASK_SUGGESTIONS = [
  'Which customers have not booked in 90 days?',
  'What services make the most money?',
  'What should I focus on this week?',
  'Show follow-ups due',
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
    <div className="titan-command-center space-y-10 pb-4">
      <TitanActionStrip briefing={briefing} />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#050508] via-black to-zinc-950 p-6 md:p-10">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.12),transparent_50%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(52,211,153,0.06),transparent_45%)]" />
        <div className="relative flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <TitanLogo size="lg" />
            <p className="mt-6 text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">{briefing.betaLabel}</p>
            <h1 className="mt-2 text-2xl font-black uppercase tracking-wide text-white md:text-3xl">
              {titanCommandCenterTitle()}
            </h1>
            <p className="mt-2 text-sm text-emerald-300/90">Operating intelligence for {briefing.workspace.businessName}</p>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400 md:text-base">
              {briefing.greeting}, {name}. Projected month-end{' '}
              <span className="font-mono font-bold text-white">{money(forecast.projectedMonthCents)}</span>
              {insights.revenueTargetCents ? (
                <>
                  {' '}
                  · Goal <span className="font-mono text-gold-soft">{money(insights.revenueTargetCents)}</span>
                </>
              ) : null}
            </p>
            <p className="mt-2 text-[11px] text-zinc-600">Updated {formatChicagoDateTime(briefing.generatedAt)}</p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <TitanMetricTile label="Revenue today" value={money(insights.revenueTodayCents)} hint={`MTD ${money(insights.revenueMonthCents)}`} />
            <TitanMetricTile
              label="Forecast confidence"
              value={`${forecast.confidencePercent}%`}
              hint={`${forecast.daysLeftInMonth} days left`}
            />
          </div>
        </div>
      </section>

      {/* Today */}
      <TitanSection title="Today" subtitle="Priorities ranked by revenue impact" icon={Zap} accent="gold">
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/8 bg-zinc-950/50 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Action queue</p>
            {briefing.recommendations.length === 0 ? (
              <TitanEmptyState
                title="All clear for now"
                detail="No high-priority actions flagged. Check Growth and Revenue sections for opportunities."
              />
            ) : (
              <ul className="mt-4 space-y-2.5">
                {briefing.recommendations.slice(0, 5).map((action, i) => (
                  <li key={action.id}>
                    <Link
                      href={action.href}
                      className={`flex items-start gap-3 rounded-xl border p-3.5 transition hover:brightness-110 ${priorityClass(action.priority)}`}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-black/50 text-[10px] font-black">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold">{action.title}</p>
                        <p className="mt-0.5 text-xs opacity-80">{action.detail}</p>
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 opacity-40" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TitanMetricTile label="Follow-ups due" value={String(insights.followUpsDue)} hint="Due today" href="/admin/follow-ups" />
            <TitanMetricTile label="Open leads" value={String(insights.openLeads)} hint="Pipeline" href="/admin/leads" />
            <TitanMetricTile label="Open estimates" value={String(insights.openEstimates)} hint="Awaiting approval" href="/admin/leads" />
            <TitanMetricTile label="Exceptions" value={String(insights.openExceptions)} hint="Needs attention" href="/admin/exceptions" />
          </div>
        </div>
      </TitanSection>

      {/* Revenue */}
      <TitanSection title="Revenue" subtitle="ROI, forecast, and money pulse" icon={DollarSign} accent="emerald">
        <TitanRoiPanel roi={briefing.roi} />
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/8 bg-zinc-950/40 px-5 py-4">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-emerald-400" />
            <p className="text-xs font-black uppercase text-zinc-400">Month forecast</p>
          </div>
          <div className="flex flex-wrap gap-5 text-sm">
            <span className="text-zinc-500">
              Projected <span className="font-mono font-bold text-emerald-300">{money(forecast.projectedMonthCents)}</span>
            </span>
            {forecast.jobsNeededForGoal != null && forecast.jobsNeededForGoal > 0 ? (
              <span className="text-zinc-500">
                ~<span className="font-mono text-white">{forecast.jobsNeededForGoal}</span> jobs to goal
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => router.refresh()}
              className="text-[10px] font-black uppercase text-gold-soft hover:underline"
            >
              Refresh
            </button>
          </div>
        </div>
      </TitanSection>

      {/* Growth */}
      <TitanSection title="Growth" subtitle="Opportunities, prospects, and outbound plays" icon={TrendingUp} accent="cyan">
        <TitanOpportunityScannerPanel briefing={briefing} />
        <TitanGrowthPanels briefing={briefing} />
      </TitanSection>

      {/* Customers */}
      <TitanSection title="Customers" subtitle="Public widget, territory, and site intelligence" icon={Users} accent="violet">
        <div className="grid gap-5 lg:grid-cols-2">
          <TitanWidgetStatsPanel stats={briefing.widgetStats} />
          <TitanTerritoryPanel territory={briefing.territory} />
        </div>
      </TitanSection>

      {/* Operations */}
      <TitanSection title="Operations" subtitle="Business DNA, weather, and workspace config" icon={Wrench}>
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/8 bg-zinc-950/50 p-5">
            <div className="flex items-center gap-2">
              <CloudRain className="h-4 w-4 text-sky-400" />
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">Weather intelligence</p>
            </div>
            {briefing.weather.configured ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-zinc-300">{briefing.weather.summary ?? 'Conditions look manageable.'}</p>
                {briefing.weather.rainWarning ? (
                  <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                    {briefing.weather.rainWarning}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-600">No rain conflicts flagged for today.</p>
                )}
              </div>
            ) : (
              <TitanEmptyState
                title="Weather not configured"
                detail="Add OPENWEATHER_API_KEY in integrations to flag rain risk on scheduled jobs."
                actionLabel="Open integrations"
                actionHref="/admin/integrations"
              />
            )}
          </section>
          <TitanWorkspaceForm workspace={briefing.workspace} compact />
        </div>
      </TitanSection>

      {/* Intelligence */}
      <TitanSection title="Intelligence" subtitle="Ask Titan, activity feed, and engines" icon={Radar} accent="cyan">
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-3xl border border-white/8 bg-zinc-950/50 p-5">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-gold-soft" />
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Ask Titan</p>
            </div>
            <p className="mt-2 text-sm text-zinc-500">Search customers, revenue, follow-ups, and estimates.</p>
            <div className="mt-3 flex flex-wrap gap-2">
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
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-white/8 bg-zinc-950/50 p-5">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-purple-300" />
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-zinc-400">Titan memory</p>
            </div>
            {briefing.memoryRecent.length === 0 ? (
              <TitanEmptyState
                title="Memory is building"
                detail="Notes, messages, and job events will appear here as your team works."
                actionLabel="View customers"
                actionHref="/admin/customers"
              />
            ) : (
              <ul className="mt-4 max-h-52 space-y-2 overflow-y-auto">
                {briefing.memoryRecent.map((m) => (
                  <li key={m.id} className="rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-xs">
                    <span className="text-zinc-300">{m.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <TitanActivityTimeline events={briefing.activity} />
        <TitanIntelligencePanels briefing={briefing} />
      </TitanSection>
    </div>
  );
}
