'use client';

import Link from 'next/link';
import { Activity, Bell, Calendar, ChevronRight, CloudRain, DollarSign, TrendingUp, Users } from 'lucide-react';
import type { ExecutiveBriefingSnapshot } from '@/lib/titan/executive-briefing';
import { BriefingOpportunityCard } from '@/components/titan/briefing-opportunity-card';
import { TitanPowerstonePanel } from '@/components/titan/titan-powerstone-panel';
import { WeatherReadinessWidget } from '@/components/widgets/weather-readiness-widget';
import { TitanHealthPill } from '@/components/titan/titan-page-shell';

function StatChip({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-white/8 bg-black/40 px-3 py-2.5 transition hover:border-gold/25 hover:bg-black/55">
      <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-black tabular-nums text-white">{value}</p>
      {hint ? <p className="mt-0.5 text-[10px] text-zinc-500">{hint}</p> : null}
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
    briefing.weatherRisk ? { label: briefing.weatherRisk, tone: 'text-amber-200' } : null,
    briefing.calendarConflict ? { label: briefing.calendarConflict, tone: 'text-rose-200' } : null,
    briefing.balanceDueLabel !== '$0.00' ? { label: `${briefing.balanceDueLabel} outstanding`, tone: 'text-gold-soft' } : null,
  ].filter(Boolean) as Array<{ label: string; tone: string }>;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Today&apos;s mission</p>
          <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
            {greeting}, {briefing.ownerName}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">{briefing.healthLabel} · Advantage {briefing.operationalAdvantage}/100</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/notifications" className="inline-flex items-center gap-1.5 rounded-xl border border-white/12 px-3 py-2 text-[10px] font-black uppercase text-zinc-200 hover:border-gold/30">
            <Bell className="h-3.5 w-3.5" />
            Alerts
            {briefing.unreadActivity > 0 ? <span className="rounded-full bg-gold px-1.5 text-[9px] text-black">{briefing.unreadActivity}</span> : null}
          </Link>
          <Link href="/admin?overview=1" className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-3 py-2 text-[10px] font-black uppercase text-black hover:brightness-110">
            <Activity className="h-3.5 w-3.5" /> Full dashboard
          </Link>
        </div>
      </header>

      <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <StatChip label="Revenue today" value={briefing.revenueTodayLabel} hint={`Target ${briefing.revenueTargetLabel}`} href="/admin/revenue" />
        <StatChip label="Gap to target" value={briefing.revenueGapLabel} hint="Close with missions below" href="/admin/titan?workspace=growth" />
        <StatChip label="Bookings" value={String(briefing.scheduleCount)} hint={briefing.scheduleLabel} href="/admin/calendar" />
        <StatChip label="Balances" value={briefing.balanceDueLabel} hint="Open jobs" href="/admin?overview=1" />
        <StatChip label="Inbox" value={String(briefing.unreadActivity)} hint="Unread events" href="/admin/notifications" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
              <div className="flex items-center justify-between gap-2">
                <TitanHealthPill tone={briefing.healthTone}>{briefing.healthLabel}</TitanHealthPill>
                <span className="text-[10px] font-black uppercase text-zinc-500">Ops score</span>
              </div>
              <p className="mt-3 text-3xl font-black text-white">
                {briefing.operationalAdvantage}
                <span className="text-base text-zinc-500">/100</span>
              </p>
              <ul className="mt-3 grid gap-1.5">
                {briefing.advantageFactors.map((f) => (
                  <li key={f.label} className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] ${f.ok ? 'border-emerald-500/15 text-emerald-100' : 'border-amber-500/15 text-amber-100'}`}>
                    <span>{f.ok ? '✓' : '○'}</span>
                    <span className="font-semibold">{f.label}</span>
                    {f.detail ? <span className="ml-auto text-[9px] opacity-70">{f.detail}</span> : null}
                  </li>
                ))}
              </ul>
              {briefing.improveAction ? (
                <Link href={briefing.improveAction.href} className="mt-3 flex items-center justify-between rounded-lg border border-gold/20 bg-gold/5 px-3 py-2 text-xs font-bold text-gold-soft hover:bg-gold/10">
                  <span>Improve: {briefing.improveAction.label} (+{briefing.improveAction.points})</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </div>

            <WeatherReadinessWidget variant="admin" autoFetch compact className="!p-4 !rounded-2xl" />
          </div>

          {urgent.length > 0 ? (
            <section className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-rose-200">Urgent problems</p>
              <ul className="mt-2 space-y-1.5">
                {urgent.map((u) => (
                  <li key={u.label} className={`text-xs ${u.tone}`}>• {u.label}</li>
                ))}
              </ul>
            </section>
          ) : null}

          <section>
            <div className="mb-2 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gold-soft" />
              <h2 className="text-xs font-black uppercase tracking-wider text-white">Titan recommendations · Money opportunities</h2>
            </div>
            <div className="space-y-2">
              {briefing.opportunities.length === 0 ? (
                <p className="rounded-xl border border-white/8 bg-black/35 px-4 py-3 text-xs text-zinc-500">No urgent opportunities — focus on today&apos;s schedule.</p>
              ) : (
                briefing.opportunities.map((opp) => <BriefingOpportunityCard key={opp.id} opp={opp} />)
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-black/35 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Activity & analytics</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-zinc-300">
                <DollarSign className="h-4 w-4 text-emerald-300" />
                <span>{briefing.revenueTodayLabel} collected today</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-zinc-300">
                <Calendar className="h-4 w-4 text-gold-soft" />
                <span>{briefing.scheduleLabel}</span>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-zinc-300">
                <Users className="h-4 w-4 text-cyan-300" />
                <span>{briefing.unreadActivity} notifications</span>
              </div>
            </div>
            <Link href="/admin?overview=1" className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase text-gold-soft hover:underline">
              Open charts & full metrics <ChevronRight className="h-3 w-3" />
            </Link>
          </section>
        </div>

        <aside className="space-y-4">
          <TitanPowerstonePanel briefing={briefing} />
          <nav className="rounded-2xl border border-white/8 bg-black/35 p-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Quick links</p>
            <div className="mt-2 grid gap-1">
              {(
                [
                  ['Calendar', '/admin/calendar', Calendar],
                  ['Customers', '/admin/customers', Users],
                  ['Revenue', '/admin/revenue', DollarSign],
                  ['Academy', '/admin/academy', TrendingUp],
                ] as const
              ).map(([label, href, Icon]) => (
                <Link key={label} href={href} className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/5 hover:text-white">
                  <span className="inline-flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-zinc-500" />
                    {label}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                </Link>
              ))}
            </div>
          </nav>
          {briefing.weatherRisk ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
              <CloudRain className="mb-1 h-4 w-4" />
              {briefing.weatherRisk}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
