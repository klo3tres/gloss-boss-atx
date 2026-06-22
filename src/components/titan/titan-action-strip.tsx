'use client';

import Link from 'next/link';
import type { TitanBriefing } from '@/lib/titan-briefing';
import { TitanSetupBanner } from '@/components/titan/titan-ui';
import { displayMoney } from '@/lib/display-format';

function money(cents: number) {
  return displayMoney(cents);
}

export function TitanActionStrip({ briefing }: { briefing: TitanBriefing }) {
  const hunt = briefing.opportunityScanner.dailyHunt;
  const revenueAtRisk = briefing.intelligence.totalLeakCents;
  const top3 = briefing.recommendations.slice(0, 3);

  const cards = [
    {
      label: 'Revenue at risk',
      value: money(revenueAtRisk),
      action: 'Open Revenue Engine',
      href: '/admin/super',
    },
    {
      label: 'Opportunities today',
      value: String(hunt.count),
      action: 'Open Scanner',
      href: '/admin/super',
    },
    {
      label: 'Follow-ups due',
      value: String(briefing.insights.followUpsDue),
      action: 'Send follow-ups',
      href: '/admin/follow-ups',
    },
    {
      label: 'Open estimates',
      value: String(briefing.insights.openEstimates),
      action: 'Close estimates',
      href: '/admin/leads',
    },
    {
      label: 'Widget leads (30d)',
      value: String(briefing.widgetStats.leadsCreated),
      action: 'Test widget',
      href: '/',
    },
    {
      label: 'Open leads',
      value: String(briefing.insights.openLeads),
      action: 'Work pipeline',
      href: '/admin/leads',
    },
  ];

  return (
    <div className="space-y-4">
      <TitanSetupBanner warnings={briefing.setupWarnings} />

      <section className="rounded-3xl border border-gold/25 bg-gradient-to-br from-gold/5 via-zinc-950 to-black p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gold-soft">Titan Command Center™</p>
            <p className="mt-1 text-sm text-zinc-400">What to do right now — every card has an action.</p>
          </div>
          <Link
            href="/admin/titan"
            className="rounded-full border border-gold/30 bg-gold/10 px-4 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20"
          >
            Titan Home →
          </Link>
        </div>

        {top3.length > 0 ? (
          <div className="mt-4 grid gap-2 lg:grid-cols-3">
            {top3.map((a, i) => (
              <Link
                key={a.id}
                href={a.href}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/50 px-4 py-3 transition hover:border-gold/30"
              >
                <div>
                  <p className="text-[10px] font-black text-gold-soft">Top action {i + 1}</p>
                  <p className="text-sm font-bold text-white">{a.title}</p>
                </div>
                <span className="text-[10px] font-black uppercase text-gold-soft">Go →</span>
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-white/8 bg-black/40 p-4">
              <p className="text-[10px] font-black uppercase text-zinc-500">{c.label}</p>
              <p className="mt-1 font-mono text-2xl font-black text-white">{c.value}</p>
              <Link
                href={c.href}
                className="mt-3 inline-flex rounded-lg border border-gold/25 bg-gold/10 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/20"
              >
                {c.action}
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
