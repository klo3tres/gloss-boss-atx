'use client';

import Link from 'next/link';
import type { TitanBriefing } from '@/lib/titan-briefing';
import type { TitanSystemHealth } from '@/lib/titan/system-health';
import { TitanLogo } from '@/components/titan/titan-brand';
import { TitanSystemHealthPanel } from '@/components/titan/titan-system-health-panel';
import { TitanSetupBanner, TitanMetricTile } from '@/components/titan/titan-ui';
import { displayMoney } from '@/lib/display-format';

function money(cents: number) {
  return displayMoney(cents);
}

const MODULE_LINKS = [
  { href: '/admin/super', label: 'Command Center', desc: 'Full operating briefing' },
  { href: '/admin/super', label: 'Opportunities', desc: 'Revenue Radar & Daily Hunt' },
  { href: '/admin/super', label: 'Revenue Engine', desc: 'Leaks, forecast, ROI' },
  { href: '/admin/super', label: 'Lead Radar', desc: 'B2B prospect discovery' },
  { href: '/', label: 'Site Guide widget', desc: 'Test public Ask Titan' },
  { href: '/admin/titan/settings', label: 'Settings', desc: 'DNA, toggles, health' },
  { href: '/admin/customers', label: 'Memory', desc: 'Customer timeline' },
  { href: '/admin/super', label: 'Timeline', desc: 'Titan activity feed' },
];

export function TitanHomeClient({
  briefing,
  health,
}: {
  briefing: TitanBriefing;
  health: TitanSystemHealth;
}) {
  const top3 = briefing.recommendations.slice(0, 3);
  const hunt = briefing.opportunityScanner.dailyHunt;
  const revenueAtRisk = briefing.intelligence.totalLeakCents;

  return (
    <div className="space-y-8">
      <TitanSetupBanner warnings={briefing.setupWarnings} />

      <section className="relative overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-[#050508] via-black to-emerald-950/20 p-8">
        <TitanLogo size="lg" />
        <h1 className="mt-6 text-3xl font-black uppercase tracking-wide text-white">Titan</h1>
        <p className="mt-2 text-sm text-emerald-300">Your always-on business assistant · {briefing.workspace.businessName}</p>
        <p className="mt-4 max-w-2xl text-sm text-zinc-400">
          {briefing.greeting}. Revenue today {money(briefing.insights.revenueTodayCents)} ·{' '}
          {health.overall === 'healthy' ? 'systems healthy' : `status: ${health.overall}`}
        </p>
      </section>

      <section>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft">Today&apos;s command briefing</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {top3.length === 0 ? (
            <p className="text-sm text-zinc-500 lg:col-span-3">No urgent actions — open Command Center for full view.</p>
          ) : (
            top3.map((a, i) => (
              <Link
                key={a.id}
                href={a.href}
                className="rounded-2xl border border-gold/20 bg-black/50 p-4 transition hover:border-gold/40"
              >
                <p className="text-[10px] font-black text-gold-soft">Action {i + 1}</p>
                <p className="mt-2 text-sm font-bold text-white">{a.title}</p>
                <p className="mt-1 text-xs text-zinc-500">{a.detail}</p>
                {a.impactCents ? (
                  <p className="mt-2 text-[10px] font-mono text-emerald-400">~{money(a.impactCents)}</p>
                ) : null}
              </Link>
            ))
          )}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TitanMetricTile
          label="Revenue at risk"
          value={money(revenueAtRisk)}
          hint="From leak scan"
          href="/admin/super"
        />
        <TitanMetricTile
          label="Opportunities today"
          value={String(hunt.count)}
          hint={money(hunt.potentialCents) + ' potential'}
          href="/admin/super"
        />
        <TitanMetricTile
          label="Follow-ups due"
          value={String(briefing.insights.followUpsDue)}
          hint="Action required"
          href="/admin/follow-ups"
        />
        <TitanMetricTile
          label="Open estimates"
          value={String(briefing.insights.openEstimates)}
          hint="Close pipeline"
          href="/admin/leads"
        />
      </div>

      <TitanSystemHealthPanel health={health} />

      <section>
        <p className="text-[10px] font-black uppercase tracking-[0.28em] text-zinc-400">Titan modules</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {MODULE_LINKS.map((m) => (
            <Link
              key={m.label}
              href={m.href}
              className="rounded-xl border border-white/8 bg-zinc-950/60 p-4 transition hover:border-emerald-500/30"
            >
              <p className="text-sm font-bold text-white">{m.label}</p>
              <p className="mt-1 text-[10px] text-zinc-500">{m.desc}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
