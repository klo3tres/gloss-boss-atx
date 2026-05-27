'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertTriangle, Calendar, TrendingUp, Users, Zap } from 'lucide-react';
import type { OwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { displayMoney } from '@/lib/display-format';
import { PremiumBadge, SectionEyebrow } from '@/components/ui/premium';

function MixBar({ label, cents, total }: { label: string; cents: number; total: number }) {
  const pct = total > 0 ? Math.round((cents / total) * 100) : 0;
  return (
    <div className='mt-3'>
      <div className='flex justify-between text-[10px] font-black uppercase text-zinc-500'>
        <span>{label}</span>
        <span className='text-gold-soft'>{pct}%</span>
      </div>
      <div className='mt-1 h-2 overflow-hidden rounded-full bg-white/10'>
        <div
          className='h-full rounded-full bg-gradient-to-r from-gold/80 to-gold-soft'
          style={{ width: pct > 0 ? `${Math.max(pct, 1)}%` : '0%' }}
        />
      </div>
    </div>
  );
}

function RevenueHero({ label, value, href }: { label: string; value: string; href?: string }) {
  const inner = (
    <div className='gb-stat-card gb-glow-hover rounded-2xl border border-gold/25 bg-gradient-to-br from-gold/10 to-transparent px-5 py-4'>
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
      <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className='gb-invoice-card gb-premium-hero rounded-3xl px-6 py-8 sm:px-10'>
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
          <div className='gb-stat-card gb-glow-hover rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Open balances</p>
            <p className='mt-1 font-mono text-xl font-bold text-amber-200'>{metrics.balanceDue}</p>
          </div>
          <div className='gb-stat-card gb-glow-hover rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Pipeline</p>
            <p className='mt-1 font-mono text-xl font-bold text-white'>{metrics.pipelineCount}</p>
          </div>
          <div className='gb-stat-card gb-glow-hover rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='text-[10px] font-black uppercase text-zinc-500'>Jobs today</p>
            <p className='mt-1 font-mono text-xl font-bold text-emerald-300'>{metrics.jobsToday}</p>
          </div>
          <div className='gb-stat-card gb-glow-hover rounded-2xl border border-white/10 bg-black/40 px-4 py-3'>
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

      <section className='gb-invoice-card gb-glow-hover rounded-3xl border border-gold/20 p-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <SectionEyebrow>Payments mix · month to date</SectionEyebrow>
          <Link href='/admin/revenue' className='text-[10px] font-black uppercase text-gold-soft'>
            Revenue detail →
          </Link>
        </div>
        {metrics.paymentMixMonth.paymentCount === 0 ? (
          <p className='mt-4 text-sm text-zinc-500'>No succeeded payments in the current month window yet — totals appear here automatically.</p>
        ) : (
          <div className='mt-4'>
            <p className='font-mono text-lg text-white'>{displayMoney(metrics.paymentMixMonth.grossCents)} collected</p>
            <p className='text-xs text-zinc-500'>{metrics.paymentMixMonth.paymentCount} payment(s) · share by channel</p>
            <MixBar label='Stripe / card' cents={metrics.paymentMixMonth.stripeCents} total={metrics.paymentMixMonth.grossCents} />
            <MixBar label='Cash' cents={metrics.paymentMixMonth.cashCents} total={metrics.paymentMixMonth.grossCents} />
            <MixBar label='Zelle / Venmo' cents={metrics.paymentMixMonth.zelleCents} total={metrics.paymentMixMonth.grossCents} />
            <MixBar label='Other' cents={metrics.paymentMixMonth.otherCents} total={metrics.paymentMixMonth.grossCents} />
          </div>
        )}
      </section>

      <section className='gb-dashboard-grid'>
        <Link href='/admin/booking-health' className='gb-stat-card gb-glow-hover block rounded-2xl border border-gold/20 p-4'>
          <p className='text-[10px] font-black uppercase text-zinc-500'>Operations</p>
          <p className='mt-2 text-sm font-black text-white'>Booking health</p>
        </Link>
        <Link href='/admin/system-status' className='gb-stat-card gb-glow-hover block rounded-2xl border border-gold/20 p-4'>
          <p className='text-[10px] font-black uppercase text-zinc-500'>System</p>
          <p className='mt-2 text-sm font-black text-white'>Status & integrations</p>
        </Link>
        <Link href='/admin/messages' className='gb-stat-card gb-glow-hover block rounded-2xl border border-gold/20 p-4'>
          <p className='text-[10px] font-black uppercase text-zinc-500'>Inbox</p>
          <p className='mt-2 text-sm font-black text-white'>Message center</p>
        </Link>
      </section>

      <section>
        <SectionEyebrow>Quick actions</SectionEyebrow>
        <div className='mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {quick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className='gb-glow-hover flex items-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-5 py-4 transition hover:border-gold/40 hover:bg-gold/5'
            >
              <q.icon className='h-6 w-6 text-gold-soft' />
              <span className='text-sm font-black uppercase tracking-wide text-white'>{q.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className='gb-invoice-card rounded-3xl border border-gold/20 bg-zinc-950/80 p-6'>
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
