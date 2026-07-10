'use client';

import Link from 'next/link';
import { Activity, Bell, Calendar, ChevronRight, CloudRain, DollarSign, TrendingUp, Users } from 'lucide-react';
import type { ExecutiveBriefingSnapshot } from '@/lib/titan/executive-briefing';
import { BriefingOpportunityCard } from '@/components/titan/briefing-opportunity-card';
import { BriefingCalendarPreview } from '@/components/titan/briefing-calendar-preview';
import { DailyActionPlanPanel, TodaysMoneyMovesPanel } from '@/components/titan/daily-action-plan-panel';
import { TitanPowerstonePanel } from '@/components/titan/titan-powerstone-panel';
import { WeatherReadinessWidget } from '@/components/widgets/weather-readiness-widget';
import { TitanHealthPill } from '@/components/titan/titan-page-shell';

function StatChip({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5 transition hover:border-gold/25 hover:shadow-sm">
      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums text-foreground">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

export function ExecutiveBriefingClient({ briefing }: { briefing: ExecutiveBriefingSnapshot }) {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  const urgent = [
    briefing.weatherRisk ? { label: briefing.weatherRisk, tone: 'text-amber-700 dark:text-amber-200' } : null,
    briefing.calendarConflict ? { label: briefing.calendarConflict, tone: 'text-rose-700 dark:text-rose-200' } : null,
    briefing.balanceDueLabel !== '$0.00' ? { label: `${briefing.balanceDueLabel} outstanding`, tone: 'text-gold-soft' } : null,
  ].filter(Boolean) as Array<{ label: string; tone: string }>;

  return (
    <div className="w-full space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Today&apos;s mission</p>
          <h1 className="mt-1 text-2xl font-black text-foreground sm:text-3xl">
            {greeting}, {briefing.ownerName}
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {briefing.healthLabel} · Ops {briefing.operationalAdvantage}/100
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/notifications"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-[10px] font-black uppercase text-foreground hover:border-gold/30"
          >
            <Bell className="h-3.5 w-3.5" />
            Alerts
            {briefing.unreadActivity > 0 ? (
              <span className="rounded-full bg-gold px-1.5 text-[9px] text-black">{briefing.unreadActivity}</span>
            ) : null}
          </Link>
          <Link
            href="/admin?overview=1"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black hover:brightness-110"
          >
            <Activity className="h-3.5 w-3.5" /> Full dashboard
          </Link>
        </div>
      </header>

      <TodaysMoneyMovesPanel
        revenueTargetLabel={briefing.revenueTargetLabel}
        revenueGapLabel={briefing.revenueGapLabel}
        moves={briefing.dailyActionPlan.fastestMoneyMoves}
      />

      <DailyActionPlanPanel actions={briefing.dailyActionPlan.actions} />

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <StatChip label="Revenue today" value={briefing.revenueTodayLabel} hint={`Target ${briefing.revenueTargetLabel}`} href="/admin/revenue" />
        <StatChip label="Projected today" value={briefing.projectedRevenueTodayLabel} hint="Collected + missions + schedule" href="/admin" />
        <StatChip label="Gap to target" value={briefing.revenueGapLabel} hint="Close with missions below" href="/admin/titan?workspace=growth" />
        <StatChip label="Bookings" value={String(briefing.scheduleCount)} hint={briefing.scheduleLabel} href="/admin/calendar" />
        <StatChip label="Balances" value={briefing.balanceDueLabel} hint="Open jobs" href="/admin?overview=1" />
        <StatChip label="Inbox" value={String(briefing.unreadActivity)} hint="Unread events" href="/admin/notifications" />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]">
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <BriefingCalendarPreview todayJobs={briefing.todayJobs} upcomingJobs={briefing.upcomingJobs} />
            <TitanPowerstonePanel briefing={briefing} />
          </div>

          {urgent.length > 0 ? (
            <section className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-700 dark:text-rose-200">Urgent problems</p>
              <ul className="mt-2 space-y-1.5">
                {urgent.map((u) => (
                  <li key={u.label} className={`text-xs ${u.tone}`}>
                    • {u.label}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gold-soft" />
              <h2 className="text-xs font-black uppercase tracking-wider text-foreground">More context</h2>
            </div>
            <p className="mb-2 text-[10px] text-muted-foreground">Additional opportunities — use Daily Action Plan above for sends.</p>
            <div className="space-y-2">
              {briefing.opportunities.length === 0 ? (
                <p className="rounded-xl border border-border bg-card px-4 py-3 text-xs text-muted-foreground">
                  No urgent opportunities — focus on today&apos;s schedule.
                </p>
              ) : (
                briefing.opportunities.map((opp) => <BriefingOpportunityCard key={opp.id} opp={opp} />)
              )}
            </div>
          </section>

          <details className="rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer list-none text-[10px] font-black uppercase tracking-wider text-muted-foreground">
              Business health · Ops score {briefing.operationalAdvantage}/100
            </summary>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <TitanHealthPill tone={briefing.healthTone}>{briefing.healthLabel}</TitanHealthPill>
              <p className="text-2xl font-black text-foreground">
                {briefing.operationalAdvantage}
                <span className="text-sm text-muted-foreground">/100</span>
              </p>
            </div>
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {briefing.advantageFactors.map((f) => (
                <li
                  key={f.label}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${
                    f.ok
                      ? 'border-emerald-500/20 text-emerald-800 dark:text-emerald-100'
                      : 'border-amber-500/20 text-amber-800 dark:text-amber-100'
                  }`}
                >
                  <span>{f.ok ? '✓' : '○'}</span>
                  <span className="font-semibold">{f.label}</span>
                  {f.detail ? <span className="ml-auto text-[9px] opacity-70">{f.detail}</span> : null}
                </li>
              ))}
            </ul>
            {briefing.improveAction ? (
              <Link
                href={briefing.improveAction.href}
                className="mt-3 flex items-center justify-between rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10"
              >
                <span>
                  Improve: {briefing.improveAction.label} (+{briefing.improveAction.points})
                </span>
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </details>
        </div>

        <aside className="space-y-4">
          <WeatherReadinessWidget variant="admin" autoFetch compact homepageCompact className="!p-3 !rounded-2xl !shadow-none" />
          <nav className="rounded-2xl border border-border bg-card p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Shortcuts</p>
            <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
              {(
                [
                  ['Dispatch', '/admin/dispatch', Calendar],
                  ['Customers', '/admin/customers', Users],
                  ['Revenue', '/admin/revenue', DollarSign],
                  ['Academy', '/admin/academy', TrendingUp],
                ] as const
              ).map(([label, href, Icon]) => (
                <Link
                  key={label}
                  href={href}
                  className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-foreground hover:bg-muted/60"
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    {label}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </nav>
          {briefing.weatherRisk ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-100">
              <CloudRain className="mb-1 h-4 w-4" />
              {briefing.weatherRisk}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
