'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertTriangle, Calendar, DollarSign, TrendingUp, Users, Zap } from 'lucide-react';
import type { OwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { PremiumBadge, SectionEyebrow } from '@/components/ui/premium';

function RevenueHero({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <div className='rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 to-transparent px-5 py-4'>
      <p className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>{label}</p>
      <p className='mt-2 font-mono text-3xl font-black text-gold-soft'>{value}</p>
    </div>
  );
  return href ? (
    <Link href={href} className='block transition hover:opacity-90'>
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function OwnerCommandCenter({ metrics }: { metrics: OwnerDashboardSnapshot }) {
  const quick = [
    { href: '/admin/dispatch', label: 'Dispatch board', icon: Calendar },
    { href: '/admin/revenue', label: 'Revenue detail', icon: TrendingUp },
    { href: '/admin/work-orders', label: 'Work orders', icon: Zap },
    { href: '/admin/team', label: 'Technicians', icon: Users },
    { href: '/admin/notifications', label: 'Notifications', icon: AlertTriangle },
    { href: '/book', label: 'Book appointment', icon: Calendar },
  ];

  return (
    <div className='space-y-8'>
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className='gb-premium-hero rounded-3xl px-6 py-8 sm:px-10'>
        <div className='flex flex-wrap items-center gap-2'>
          <SectionEyebrow>Owner command</SectionEyebrow>
          <PremiumBadge tone='gold'>Live</PremiumBadge>
        </div>
        <h2 className='mt-3 text-3xl font-black text-white sm:text-4xl'>Good to see you, Kyle</h2>
        <p className='mt-2 text-sm text-zinc-400'>Revenue, pipeline, and today&apos;s field work — no filler.</p>

        <div className='mt-8 grid gap-3 sm:grid-cols-3'>
          <RevenueHero label='Today' value={metrics.revenueToday} href='/admin/revenue' />
          <RevenueHero label='This week' value={metrics.revenueWeek} href='/admin/revenue' />
          <RevenueHero label='This month' value={metrics.revenueMonth} href='/admin/revenue' />
        </div>

        <div className='mt-4 grid gap-3 sm:grid-cols-4'>
          <div className='rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Open balances</p>
            <p className='mt-1 font-mono text-xl font-bold text-amber-200'>{metrics.balanceDue}</p>
          </div>
          <div className='rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Pipeline</p>
            <p className='mt-1 font-mono text-xl font-bold text-white'>{metrics.pipelineCount}</p>
          </div>
          <div className='rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Jobs today</p>
            <p className='mt-1 font-mono text-xl font-bold text-emerald-300'>{metrics.jobsToday}</p>
          </div>
          <div className='rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Technicians</p>
            <p className='mt-1 font-mono text-xl font-bold text-white'>{metrics.activeTechCount}</p>
          </div>
        </div>

        {metrics.alerts.length > 0 ? (
          <ul className='mt-6 space-y-2'>
            {metrics.alerts.map((a) => (
              <li key={a} className='flex items-start gap-2 rounded-xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
                <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                {a}
              </li>
            ))}
          </ul>
        ) : null}
      </motion.section>

      <section>
        <SectionEyebrow>Quick actions</SectionEyebrow>
        <div className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {quick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className='flex items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-5 py-4 transition hover:border-gold/40 hover:bg-gold/5'
            >
              <q.icon className='h-6 w-6 text-gold-soft' />
              <span className='text-sm font-black uppercase tracking-wide text-white'>{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className='rounded-3xl border border-gold/20 bg-zinc-950/80 p-6'>
        <div className='flex items-center justify-between gap-3'>
          <SectionEyebrow>Today&apos;s jobs</SectionEyebrow>
          <Link href='/admin/dispatch' className='text-[10px] font-black uppercase text-gold-soft'>
            Full dispatch →
          </Link>
        </div>
        {metrics.todayJobs.length === 0 ? (
          <p className='mt-6 rounded-2xl border border-dashed border-white/15 px-6 py-12 text-center text-sm text-zinc-500'>
            No live jobs on the calendar for today — book or assign from Dispatch.
          </p>
        ) : (
          <ul className='mt-4 space-y-2'>
            {metrics.todayJobs.map((j) => (
              <li key={j.id}>
                <Link
                  href={j.href}
                  className='flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-4 transition hover:border-gold/35'
                >
                  <div>
                    <p className='font-bold text-white'>{j.guestName}</p>
                    <p className='text-xs text-zinc-500'>
                      {j.when} · {j.service}
                    </p>
                  </div>
                  <div className='flex flex-wrap items-center gap-2'>
                    <span className='rounded-full border border-gold/30 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft'>
                      {j.status}
                    </span>
                    <span className='text-xs text-zinc-400'>{j.techName}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
