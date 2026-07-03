'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Rocket, Target, Trophy } from 'lucide-react';
import type { LaunchReadinessAggregate } from '@/lib/setup-readiness';

function Bar({ label, pct, tone = 'gold' }: { label: string; pct: number; tone?: 'gold' | 'emerald' | 'amber' }) {
  const color =
    tone === 'emerald' ? 'from-emerald-400 to-emerald-600' : tone === 'amber' ? 'from-amber-300 to-amber-500' : 'from-gold via-gold-soft to-amber-300';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-500">
        <span>{label}</span>
        <span className="font-mono text-white">{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-950 border border-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
        />
      </div>
    </div>
  );
}

export function SetupAggregateProgress({
  aggregate,
}: {
  aggregate: LaunchReadinessAggregate;
}) {
  return (
    <section className="rounded-3xl border border-gold/30 bg-gradient-to-br from-gold/8 via-black to-zinc-950 p-6 shadow-[0_0_40px_rgba(212,175,55,0.12)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gold-soft">Launch command score</p>
          <p className="mt-2 text-4xl font-black text-white">{aggregate.aggregatePct}%</p>
          <p className="mt-1 text-xs text-zinc-400">
            Systems + goals combined — the number your whole team can rally around.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!aggregate.goalsConfigured ? (
            <Link
              href="/admin/goals"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-[10px] font-black uppercase text-black hover:brightness-110"
            >
              <Rocket className="h-3.5 w-3.5" /> Set goals
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-black uppercase text-emerald-300">
              <Target className="h-3.5 w-3.5" /> {aggregate.activeGoalCount} active goals
            </span>
          )}
          <Link href="/admin/launch-readiness" className="rounded-xl border border-white/15 px-4 py-2 text-[10px] font-black uppercase text-zinc-300 hover:border-gold/30">
            Launch checklist
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Bar label="Required systems" pct={aggregate.systemsRequiredPct} />
        <Bar label="Recommended polish" pct={aggregate.systemsOptionalPct} tone="amber" />
        <Bar label="Goals configured" pct={aggregate.goalsConfiguredPct} tone="emerald" />
        <Bar label="Goals progress (team)" pct={aggregate.goalsProgressPct} />
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/5 border border-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${aggregate.aggregatePct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="h-full rounded-full bg-gradient-to-r from-gold via-amber-200 to-emerald-400"
        />
      </div>

      <p className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
        <Trophy className="h-3.5 w-3.5 text-gold-soft" />
        {aggregate.requiredDone}/{aggregate.requiredTotal} required systems · {aggregate.optionalDone}/{aggregate.optionalTotal} polish items
      </p>
    </section>
  );
}
