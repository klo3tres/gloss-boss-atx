'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Activity, Calendar, ChevronRight, TrendingUp, Users } from 'lucide-react';
import type { ExecutiveBriefingSnapshot } from '@/lib/titan/executive-briefing';
import {
  TitanHealthPill,
  TitanOpportunityCard,
  TitanPageShell,
} from '@/components/titan/titan-page-shell';
import { GlassCard, SectionEyebrow } from '@/components/ui/premium';

export function ExecutiveBriefingClient({ briefing }: { briefing: ExecutiveBriefingSnapshot }) {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <TitanPageShell
      title={`${greeting}, ${briefing.ownerName}`}
      sentence="What needs your attention, what should happen next, and what Titan can handle for you."
      kpi={briefing.revenueTodayLabel}
      kpiHint={`Target ${briefing.revenueTargetLabel} · Need ${briefing.revenueGapLabel} · ${briefing.scheduleLabel}`}
      primaryAction={
        <Link
          href="/admin/notifications"
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-[10px] font-black uppercase text-black hover:brightness-110"
        >
          <Activity className="h-4 w-4" /> View activity
          {briefing.unreadActivity > 0 ? (
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[9px]">{briefing.unreadActivity}</span>
          ) : null}
        </Link>
      }
      secondaryActions={
        <>
          <Link
            href="/admin/calendar"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-3 text-[10px] font-black uppercase text-zinc-200 hover:border-gold/30"
          >
            <Calendar className="h-3.5 w-3.5" /> Calendar
          </Link>
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 px-4 py-3 text-[10px] font-black uppercase text-zinc-200 hover:border-gold/30"
          >
            <Users className="h-3.5 w-3.5" /> Customers
          </Link>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="lg:col-span-2 space-y-4"
        >
          <GlassCard glow className="border-gold/20">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <TitanHealthPill tone={briefing.healthTone}>{briefing.healthLabel}</TitanHealthPill>
                <p className="mt-3 text-sm text-zinc-400">{briefing.scheduleLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Operational Advantage</p>
                <p className="text-4xl font-black tabular-nums text-white">
                  {briefing.operationalAdvantage}
                  <span className="text-lg text-zinc-500">/100</span>
                </p>
                <p className="text-[10px] font-bold text-emerald-300">↑ +{briefing.advantageDelta} potential</p>
              </div>
            </div>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {briefing.advantageFactors.map((f) => (
                <li
                  key={f.label}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
                    f.ok ? 'border-emerald-500/20 text-emerald-100' : 'border-amber-500/20 text-amber-100'
                  }`}
                >
                  <span>{f.ok ? '✓' : '○'}</span>
                  <span className="font-semibold">{f.label}</span>
                  {f.detail ? <span className="ml-auto text-[10px] opacity-70">{f.detail}</span> : null}
                </li>
              ))}
            </ul>
            {briefing.improveAction ? (
              <Link
                href={briefing.improveAction.href}
                className="mt-4 flex items-center justify-between rounded-xl border border-gold/25 bg-gold/5 px-4 py-3 text-sm font-bold text-gold-soft hover:bg-gold/10"
              >
                <span>
                  Improve score: {briefing.improveAction.label}{' '}
                  <span className="text-emerald-300">+{briefing.improveAction.points}</span>
                </span>
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : null}
          </GlassCard>

          {(briefing.weatherRisk || briefing.calendarConflict || briefing.balanceDueLabel !== '$0.00') && (
            <GlassCard>
              <SectionEyebrow>Signals</SectionEyebrow>
              <ul className="mt-3 space-y-2 text-sm text-zinc-300">
                {briefing.weatherRisk ? <li>🌧 {briefing.weatherRisk}</li> : null}
                {briefing.calendarConflict ? <li>📅 {briefing.calendarConflict}</li> : null}
                {briefing.balanceDueLabel !== '$0.00' ? (
                  <li>💳 {briefing.balanceDueLabel} outstanding</li>
                ) : null}
              </ul>
            </GlassCard>
          )}

          <div>
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-gold-soft" />
              <h2 className="text-sm font-black uppercase tracking-wider text-white">Top opportunities</h2>
            </div>
            <div className="space-y-3">
              {briefing.opportunities.length === 0 ? (
                <GlassCard>
                  <p className="text-sm text-zinc-500">No urgent opportunities — focus on today&apos;s schedule.</p>
                </GlassCard>
              ) : (
                briefing.opportunities.map((opp, i) => (
                  <motion.div
                    key={opp.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.05 }}
                  >
                    <TitanOpportunityCard
                      title={opp.title}
                      body={opp.body}
                      confidence={opp.confidence}
                      confidenceLabel={opp.confidenceLabel}
                      revenueLabel={opp.revenueLabel}
                      href={opp.href}
                      autoRunLabel={opp.autoRunLabel}
                    />
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="space-y-4"
        >
          <GlassCard>
            <SectionEyebrow>Quick links</SectionEyebrow>
            <nav className="mt-3 space-y-1">
              {[
                ['Today\'s Business', '/admin'],
                ['Activity', '/admin/notifications'],
                ['Calendar', '/admin/calendar'],
                ['Customers', '/admin/customers'],
                ['Money', '/admin/revenue'],
                ['Growth', '/admin/titan?workspace=growth'],
                ['Full dashboard', '/admin?overview=1'],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-semibold text-zinc-300 hover:bg-white/5 hover:text-white"
                >
                  {label}
                  <ChevronRight className="h-4 w-4 text-zinc-600" />
                </Link>
              ))}
            </nav>
          </GlassCard>
        </motion.aside>
      </div>
    </TitanPageShell>
  );
}
