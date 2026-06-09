'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';

export function GlassCard({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={clsx(
        'gb-glass rounded-3xl border border-white/10 p-5 sm:p-6',
        glow && 'shadow-[0_0_40px_rgba(212,175,55,0.12)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PremiumBadge({
  children,
  tone = 'gold',
}: {
  children: ReactNode;
  tone?: 'gold' | 'emerald' | 'amber' | 'rose' | 'zinc';
}) {
  const tones = {
    gold: 'border-gold/40 bg-gold/10 text-gold-soft',
    emerald: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200',
    amber: 'border-amber-500/35 bg-amber-500/10 text-amber-100',
    rose: 'border-rose-500/35 bg-rose-500/10 text-rose-200',
    zinc: 'border-white/15 bg-white/5 text-zinc-300',
  };
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider', tones[tone])}>
      {children}
    </span>
  );
}

export function SectionEyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={clsx('text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft', className)}>{children}</p>;
}

export function CollapsibleSection({
  title,
  subtitle,
  badge,
  defaultOpen = true,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <GlassCard className='overflow-hidden p-0'>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6'
      >
        <div>
          <SectionEyebrow>{title}</SectionEyebrow>
          {subtitle ? <p className='mt-1 text-sm text-zinc-400'>{subtitle}</p> : null}
        </div>
        <div className='flex items-center gap-2'>
          {badge}
          <ChevronDown className={clsx('h-5 w-5 text-gold-soft transition', open && 'rotate-180')} />
        </div>
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className='overflow-hidden'
          >
            <div className='border-t border-white/10 px-5 pb-5 pt-4 sm:px-6 sm:pb-6'>{children}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </GlassCard>
  );
}

export function ProgressTracker({ steps }: { steps: Array<{ label: string; ok: boolean }> }) {
  const done = steps.filter((s) => s.ok).length;
  const pct = steps.length ? Math.round((done / steps.length) * 100) : 0;
  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between gap-3'>
        <p className='text-sm font-bold text-white'>Job progress</p>
        <span className='font-mono text-sm text-gold-soft'>{pct}%</span>
      </div>
      <div className='h-2 overflow-hidden rounded-full bg-white/10'>
        <motion.div
          className='h-full rounded-full bg-gradient-to-r from-gold/60 to-gold'
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <ul className='grid gap-2 sm:grid-cols-2'>
        {steps.map((s) => (
          <li
            key={s.label}
            className={clsx(
              'flex items-center justify-between rounded-2xl border px-4 py-3 text-sm',
              s.ok ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-100' : 'border-white/10 bg-black/30 text-zinc-400',
            )}
          >
            <span>{s.label}</span>
            <span className='text-[10px] font-black uppercase'>{s.ok ? 'Done' : 'Pending'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TimelineRail({
  events,
}: {
  events: Array<{ id: string; title: string; time: string }>;
}) {
  if (!events.length) {
    return <p className='text-sm text-zinc-500'>No activity yet.</p>;
  }
  return (
    <ol className='relative space-y-0 border-l border-gold/25 pl-6'>
      {events.map((e, i) => (
        <li key={e.id} className='relative pb-6 last:pb-0'>
          <span className='absolute -left-[1.35rem] top-1.5 h-3 w-3 rounded-full border-2 border-gold bg-black shadow-[0_0_12px_rgba(212,175,55,0.5)]' />
          <p className='font-semibold text-white'>{e.title}</p>
          <p className='text-xs text-zinc-500'>{e.time}</p>
          {i === 0 ? <span className='mt-1 inline-block text-[10px] font-bold uppercase text-gold-soft'>Latest</span> : null}
        </li>
      ))}
    </ol>
  );
}

export function StickyActionBar({ children }: { children: ReactNode }) {
  return (
    <div className='gb-sticky-actions fixed bottom-0 left-0 right-0 z-40 border-t border-gold/20 bg-black/85 px-4 py-3 backdrop-blur-xl lg:static lg:z-auto lg:rounded-3xl lg:border lg:bg-zinc-950/90'>
      <div className='mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-2'>{children}</div>
    </div>
  );
}

export function IconTile({
  icon,
  label,
  value,
  href,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className='gb-glass flex items-start gap-4 rounded-2xl border border-white/10 p-4 transition hover:border-gold/30 hover:shadow-[0_0_24px_rgba(212,175,55,0.1)]'>
      <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-soft'>{icon}</div>
      <div className='min-w-0'>
        <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>{label}</p>
        <p className='mt-1 truncate text-base font-bold text-white'>{value}</p>
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} className='block focus:outline-none focus:ring-2 focus:ring-gold/50 rounded-2xl'>
        {inner}
      </a>
    );
  }
  return inner;
}
