'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { SectionEyebrow, GlassCard, PremiumBadge } from '@/components/ui/premium';

export function TitanPageShell({
  title,
  sentence,
  kpi,
  kpiHint,
  primaryAction,
  secondaryActions,
  children,
  className,
}: {
  title: string;
  sentence: string;
  kpi: ReactNode;
  kpiHint?: string;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={clsx('space-y-6', className)}>
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="titan-page-hero rounded-3xl border border-gold/20 bg-[radial-gradient(ellipse_at_top_left,rgba(212,175,55,0.14),transparent_55%),rgba(0,0,0,0.72)] p-5 backdrop-blur-xl sm:p-8"
      >
        <SectionEyebrow>Titan</SectionEyebrow>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">{sentence}</p>
        <div className="mt-6 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">Primary focus</p>
            <div className="mt-1 text-3xl font-black tabular-nums text-white sm:text-4xl">{kpi}</div>
            {kpiHint ? <p className="mt-1 text-xs text-zinc-500">{kpiHint}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {primaryAction}
            {secondaryActions}
          </div>
        </div>
      </motion.header>
      {children}
    </div>
  );
}

export function TitanSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-white/5" />
      ))}
    </div>
  );
}

export function TitanHealthPill({ tone, children }: { tone: 'healthy' | 'watch' | 'critical'; children: ReactNode }) {
  const tones = {
    healthy: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
    watch: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
    critical: 'border-rose-500/35 bg-rose-500/10 text-rose-200',
  };
  return (
    <PremiumBadge tone={tone === 'healthy' ? 'emerald' : tone === 'watch' ? 'amber' : 'rose'}>
      {children}
    </PremiumBadge>
  );
}

export function TitanOpportunityCard({
  title,
  body,
  confidence,
  confidenceLabel,
  revenueLabel,
  href,
  autoRunLabel,
  onAutoRun,
}: {
  title: string;
  body: string;
  confidence: number;
  confidenceLabel: string;
  revenueLabel?: string;
  href: string;
  autoRunLabel?: string;
  onAutoRun?: () => void;
}) {
  return (
    <GlassCard className="border-gold/15 bg-black/50 p-4 transition hover:border-gold/30 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Recommendation</p>
          <h3 className="mt-1 text-base font-black text-white">{title}</h3>
        </div>
        <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-black text-cyan-200">
          {confidence}% confidence
        </span>
      </div>
      <p className="mt-2 text-sm text-zinc-400">{body}</p>
      <p className="mt-2 text-[11px] text-zinc-500">{confidenceLabel}</p>
      {revenueLabel ? (
        <p className="mt-2 text-sm font-black text-emerald-300">Expected {revenueLabel}</p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={href}
          className="rounded-xl bg-gold px-4 py-2.5 text-[10px] font-black uppercase text-black hover:brightness-110"
        >
          Take action
        </a>
        {autoRunLabel && onAutoRun ? (
          <button
            type="button"
            onClick={onAutoRun}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-[10px] font-black uppercase text-zinc-200 hover:border-gold/30"
          >
            {autoRunLabel}
          </button>
        ) : null}
      </div>
    </GlassCard>
  );
}
