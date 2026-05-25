'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Calendar, DollarSign, Truck, Users, Wrench } from 'lucide-react';
import { GlassCard, IconTile, PremiumBadge, SectionEyebrow } from '@/components/ui/premium';

export function AdminOperationsHub({
  appointmentCount,
  fallbackCount,
  pendingFallbackCount,
  activeCount,
}: {
  appointmentCount: number;
  fallbackCount: number;
  pendingFallbackCount: number;
  activeCount: number;
}) {
  const quick = [
    { href: '/admin/dispatch', label: 'Dispatch', desc: 'Assign & route' },
    { href: '/admin/revenue', label: 'Revenue', desc: 'Cash & goals' },
    { href: '/admin/work-orders', label: 'Work orders', desc: 'Field jobs' },
    { href: '/admin/team', label: 'Technicians', desc: 'Crew roster' },
    { href: '/admin/messages', label: 'Messages', desc: 'SMS & email' },
    { href: '/book', label: 'Book job', desc: 'New appointment' },
  ];

  return (
    <div className='space-y-8'>
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className='gb-premium-hero rounded-3xl px-6 py-8 sm:px-10'
      >
        <SectionEyebrow>Operations command</SectionEyebrow>
        <h2 className='mt-2 text-2xl font-black text-white sm:text-3xl'>Today at a glance</h2>
        <p className='mt-2 max-w-xl text-sm text-zinc-400'>
          Luxury CRM view — appointments, revenue, technicians, and field work orders in one place.
        </p>
        <div className='mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <IconTile icon={<Calendar className='h-5 w-5' />} label='Appointments loaded' value={String(appointmentCount)} />
          <IconTile icon={<Truck className='h-5 w-5' />} label='Active / in progress' value={String(activeCount)} />
          <IconTile icon={<Users className='h-5 w-5' />} label='Fallback rows' value={String(fallbackCount)} />
          <IconTile icon={<DollarSign className='h-5 w-5' />} label='Needs review' value={String(pendingFallbackCount)} href='/admin/dispatch' />
        </div>
        {pendingFallbackCount > 0 ? (
          <p className='mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100'>
            {pendingFallbackCount} booking fallback(s) need conversion — open Dispatch to resolve.
          </p>
        ) : null}
      </motion.section>

      <section>
        <div className='mb-4 flex items-center justify-between gap-3'>
          <SectionEyebrow>Quick actions</SectionEyebrow>
          <PremiumBadge tone='gold'>Owner mode</PremiumBadge>
        </div>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
          {quick.map((q) => (
            <Link
              key={q.href}
              href={q.href}
              className='gb-glass group flex items-center justify-between rounded-2xl border border-white/10 px-5 py-4 transition hover:border-gold/40 hover:shadow-[0_0_28px_rgba(212,175,55,0.12)]'
            >
              <div>
                <p className='text-sm font-black uppercase tracking-wider text-white'>{q.label}</p>
                <p className='mt-1 text-xs text-zinc-500'>{q.desc}</p>
              </div>
              <Wrench className='h-5 w-5 text-gold-soft opacity-60 transition group-hover:opacity-100' />
            </Link>
          ))}
        </div>
      </section>

      <GlassCard glow>
        <SectionEyebrow>Live schedule</SectionEyebrow>
        <p className='mt-2 text-sm text-zinc-400'>Detailed appointment table below — use filters in Dispatch for day view.</p>
      </GlassCard>
    </div>
  );
}
