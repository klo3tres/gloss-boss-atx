'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingUp,
  Users,
  Zap,
  Activity,
  Clock,
  CheckCircle2,
  Target,
} from 'lucide-react';
import type { OwnerDashboardSnapshot } from '@/lib/owner-dashboard-metrics';
import { displayMoney } from '@/lib/display-format';
import { PremiumBadge, SectionEyebrow, GlassCard } from '@/components/ui/premium';
import { AdminEmptyState, AdminMetricDrawer } from '@/components/admin/admin-metric-drawer';

type DrawerKey =
  | 'revenue-today'
  | 'revenue-week'
  | 'revenue-month'
  | 'pending-deposits'
  | 'open-balances'
  | 'active-jobs'
  | 'jobs-today'
  | 'leads'
  | 'recent-payments'
  | 'upcoming'
  | 'tech-activity'
  | 'booking-health'
  | null;

function CommandMetric({
  label,
  value,
  icon: Icon,
  colorClass = 'text-gold-soft',
  onClick,
  hint,
}: {
  label: string;
  value: string | number;
  icon?: typeof DollarSign;
  colorClass?: string;
  onClick?: () => void;
  hint?: string;
}) {
  const inner = (
    <div className='gb-premium-card group relative overflow-hidden rounded-2xl border border-gold/15 bg-gradient-to-br from-black/80 via-zinc-950/90 to-black/70 p-5 text-left transition-all duration-300 hover:border-gold/45 hover:shadow-[0_0_28px_rgba(212,175,55,0.1)]'>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(212,175,55,0.08),transparent_55%)] opacity-0 transition group-hover:opacity-100' />
      <div className='relative flex items-center justify-between'>
        <span className='text-[10px] font-black uppercase tracking-[0.15em] text-zinc-500'>{label}</span>
        {Icon ? <Icon className={`h-4 w-4 ${colorClass} opacity-90`} /> : null}
      </div>
      <p className='relative mt-3 font-mono text-2xl font-black tracking-tight text-white sm:text-3xl'>
        <span className={colorClass}>{value}</span>
      </p>
      {hint ? <p className='relative mt-1 text-[10px] text-zinc-500'>{hint}</p> : null}
      {onClick ? <p className='relative mt-2 text-[10px] font-bold uppercase text-gold-soft/70'>Tap for details →</p> : null}
    </div>
  );
  if (!onClick) return inner;
  return (
    <button type='button' onClick={onClick} className='block w-full text-left'>
      {inner}
    </button>
  );
}

export function OwnerCommandCenter({ metrics }: { metrics: OwnerDashboardSnapshot }) {
  const [drawer, setDrawer] = useState<DrawerKey>(null);

  const leadsNeedingFollowUp = metrics.leadPipeline.newCount + metrics.leadPipeline.contactedCount;
  const healthInfo =
    metrics.bookingHealth >= 85
      ? { label: 'Optimal', tone: 'emerald' as const }
      : metrics.bookingHealth >= 70
        ? { label: 'Moderate', tone: 'amber' as const }
        : { label: 'Attention', tone: 'rose' as const };

  const drawerMeta: Record<Exclude<DrawerKey, null>, { title: string; subtitle?: string }> = {
    'revenue-today': { title: 'Revenue today', subtitle: 'Succeeded payments collected today (test excluded)' },
    'revenue-week': { title: 'Revenue this week', subtitle: 'Monday–today collected payments' },
    'revenue-month': { title: 'Revenue this month', subtitle: 'Month-to-date collected payments' },
    'pending-deposits': { title: 'Pending deposits', subtitle: 'Jobs awaiting deposit checkout' },
    'open-balances': { title: 'Open balances', subtitle: 'Balance due on live appointments' },
    'active-jobs': { title: 'Active jobs', subtitle: 'In progress right now' },
    'jobs-today': { title: "Today's schedule", subtitle: 'Jobs on the calendar today' },
    leads: { title: 'Leads needing follow-up', subtitle: 'New and quoted leads in pipeline' },
    'recent-payments': { title: 'Recent payments', subtitle: 'Latest payment rows' },
    upcoming: { title: 'Upcoming appointments', subtitle: 'Next scheduled jobs' },
    'tech-activity': { title: 'Technician activity', subtitle: 'Field status right now' },
    'booking-health': { title: 'Booking health', subtitle: 'Confirmed/completed vs total appointments' },
  };

  const quick = [
    { href: '/admin/dispatch', label: 'Dispatch', icon: Calendar },
    { href: '/admin/revenue', label: 'Revenue', icon: TrendingUp },
    { href: '/admin/work-orders', label: 'Work orders', icon: Zap },
    { href: '/admin/leads', label: 'Leads', icon: Target },
    { href: '/admin/receipts', label: 'Receipts', icon: CheckCircle2 },
    { href: '/admin/booking-health', label: 'Booking health', icon: Activity },
  ];

  return (
    <div className='space-y-8'>
      <section className='gb-premium-hero relative overflow-hidden rounded-3xl border border-gold/20 px-6 py-8 sm:px-8'>
        <div className='absolute inset-0 bg-[radial-gradient(circle_at_10%_20%,rgba(212,175,55,0.12),transparent_40%),radial-gradient(circle_at_90%_80%,rgba(212,175,55,0.06),transparent_45%)]' />
        <div className='relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between'>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.28em] text-gold-soft'>Gloss Boss ATX · Owner command center</p>
            <h2 className='mt-2 font-mono text-4xl font-black text-white sm:text-5xl'>{metrics.revenueMonth}</h2>
            <p className='mt-1 text-sm text-zinc-400'>Collected this month · {metrics.paymentMixMonth.paymentCount} payments</p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Link href='/admin/revenue' className='rounded-xl bg-gold px-4 py-2.5 text-xs font-black uppercase text-black'>
              Revenue dashboard
            </Link>
            <Link href='/admin/dispatch' className='rounded-xl border border-white/15 px-4 py-2.5 text-xs font-black uppercase text-zinc-200'>
              Dispatch board
            </Link>
          </div>
        </div>
      </section>

      {metrics.alerts.length > 0 ? (
        <ul className='space-y-2'>
          {metrics.alerts.map((a) => (
            <li key={a} className='flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-xs text-amber-100/90'>
              <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0 text-amber-400' />
              <span>{a}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <section>
        <SectionEyebrow>Live metrics</SectionEyebrow>
        <div className='mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4'>
          <CommandMetric label='Today' value={metrics.revenueToday} icon={DollarSign} colorClass='text-emerald-400' onClick={() => setDrawer('revenue-today')} />
          <CommandMetric label='This week' value={metrics.revenueWeek} icon={TrendingUp} onClick={() => setDrawer('revenue-week')} />
          <CommandMetric label='This month' value={metrics.revenueMonth} icon={Activity} onClick={() => setDrawer('revenue-month')} />
          <CommandMetric label='Pending deposits' value={metrics.pendingDeposits} icon={Clock} colorClass='text-amber-400' onClick={() => setDrawer('pending-deposits')} />
          <CommandMetric label='Open balances' value={metrics.balanceDue} icon={AlertTriangle} colorClass='text-rose-400' onClick={() => setDrawer('open-balances')} />
          <CommandMetric label='Active jobs' value={metrics.activeJobsCount} icon={Zap} colorClass='text-cyan-400' onClick={() => setDrawer('active-jobs')} />
          <CommandMetric label='Jobs today' value={metrics.jobsToday} icon={Calendar} onClick={() => setDrawer('jobs-today')} />
          <CommandMetric label='Leads to follow up' value={leadsNeedingFollowUp} icon={Target} colorClass='text-violet-300' onClick={() => setDrawer('leads')} />
        </div>
      </section>

      <section className='grid grid-cols-1 gap-4 lg:grid-cols-3'>
        <GlassCard className='border-white/10 bg-black/40'>
          <div className='flex items-center justify-between border-b border-white/10 pb-3'>
            <SectionEyebrow>Recent payments</SectionEyebrow>
            <button type='button' onClick={() => setDrawer('recent-payments')} className='text-[10px] font-black uppercase text-gold-soft'>
              View all
            </button>
          </div>
          {metrics.recentPayments.length === 0 ? (
            <AdminEmptyState title='No payments yet' detail='Stripe deposits and field payments appear here after webhook or manual record.' />
          ) : (
            <ul className='mt-3 space-y-2'>
              {metrics.recentPayments.slice(0, 5).map((p) => (
                <li key={p.id} className='flex justify-between gap-2 rounded-xl border border-white/5 px-3 py-2 text-xs'>
                  <span className='truncate text-zinc-300'>{p.customer}</span>
                  <span className='font-mono font-bold text-emerald-400'>{p.amount}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className='border-white/10 bg-black/40'>
          <div className='flex items-center justify-between border-b border-white/10 pb-3'>
            <SectionEyebrow>Upcoming</SectionEyebrow>
            <button type='button' onClick={() => setDrawer('upcoming')} className='text-[10px] font-black uppercase text-gold-soft'>
              View all
            </button>
          </div>
          {metrics.upcomingAppts.length === 0 ? (
            <AdminEmptyState title='No upcoming jobs' detail='Confirmed appointments with future start times show here.' />
          ) : (
            <ul className='mt-3 space-y-2'>
              {metrics.upcomingAppts.slice(0, 5).map((a) => (
                <li key={a.id} className='rounded-xl border border-white/5 px-3 py-2'>
                  <div className='flex justify-between gap-2 text-xs'>
                    <span className='font-bold text-white'>{a.guestName}</span>
                    <span className='text-gold-soft'>{a.time}</span>
                  </div>
                  <p className='mt-0.5 text-[10px] uppercase text-zinc-500'>{a.service}</p>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>

        <GlassCard className='border-white/10 bg-black/40'>
          <div className='flex items-center justify-between border-b border-white/10 pb-3'>
            <SectionEyebrow>Technicians</SectionEyebrow>
            <button type='button' onClick={() => setDrawer('tech-activity')} className='text-[10px] font-black uppercase text-gold-soft'>
              Status
            </button>
          </div>
          {metrics.techActivity.length === 0 ? (
            <AdminEmptyState title='No technicians' detail='Add team members under Admin → Team.' />
          ) : (
            <ul className='mt-3 space-y-2'>
              {metrics.techActivity.slice(0, 5).map((t) => (
                <li key={t.id} className='flex items-center justify-between rounded-xl border border-white/5 px-3 py-2 text-xs'>
                  <span className='text-zinc-200'>{t.name}</span>
                  <span className={t.status === 'active' ? 'text-emerald-400' : 'text-zinc-500'}>{t.status === 'active' ? 'On job' : 'Idle'}</span>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      </section>

      <section className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <GlassCard className='border-white/10 bg-black/40'>
          <div className='flex items-center justify-between border-b border-white/10 pb-3 mb-4'>
            <SectionEyebrow>Booking health</SectionEyebrow>
            <PremiumBadge tone={healthInfo.tone}>{healthInfo.label}</PremiumBadge>
          </div>
          <button type='button' onClick={() => setDrawer('booking-health')} className='w-full text-left'>
            <div className='flex items-center gap-4'>
              <div className='font-mono text-4xl font-black text-gold-soft'>{metrics.bookingHealth}%</div>
              <p className='text-xs text-zinc-400'>Healthy confirmed/completed ratio across live appointments.</p>
            </div>
          </button>
          <Link href='/admin/booking-health' className='mt-4 inline-block text-xs font-black uppercase text-gold-soft underline'>
            Open booking health →
          </Link>
        </GlassCard>

        <GlassCard className='border-white/10 bg-black/40'>
          <SectionEyebrow>Quick actions</SectionEyebrow>
          <div className='mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3'>
            {quick.map((q) => (
              <Link
                key={q.href}
                href={q.href}
                className='flex items-center gap-2 rounded-xl border border-gold/15 bg-black/60 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-white transition hover:border-gold/40'
              >
                <q.icon className='h-4 w-4 shrink-0 text-gold-soft' />
                {q.label}
              </Link>
            ))}
          </div>
        </GlassCard>
      </section>

      <AdminMetricDrawer
        open={drawer != null}
        title={drawer ? drawerMeta[drawer].title : ''}
        subtitle={drawer ? drawerMeta[drawer].subtitle : undefined}
        onClose={() => setDrawer(null)}
      >
        {drawer === 'revenue-today' || drawer === 'revenue-week' || drawer === 'revenue-month' ? (
          <div className='space-y-3'>
            <p className='text-sm text-zinc-300'>
              {drawer === 'revenue-today' && metrics.revenueToday}
              {drawer === 'revenue-week' && metrics.revenueWeek}
              {drawer === 'revenue-month' && metrics.revenueMonth}
            </p>
            <p className='text-xs text-zinc-500'>
              Channel mix this month: Stripe {displayMoney(metrics.paymentMixMonth.stripeCents)} · Cash{' '}
              {displayMoney(metrics.paymentMixMonth.cashCents)}
            </p>
            <Link href='/admin/revenue' className='inline-block text-xs font-black uppercase text-gold-soft underline'>
              Full revenue dashboard →
            </Link>
          </div>
        ) : null}
        {drawer === 'open-balances' || drawer === 'pending-deposits' ? (
          <div className='space-y-3'>
            <p className='text-2xl font-mono font-black text-gold-soft'>
              {drawer === 'open-balances' ? metrics.balanceDue : metrics.pendingDeposits}
            </p>
            <Link href='/admin/work-orders' className='inline-block text-xs font-black uppercase text-gold-soft underline'>
              Open work orders →
            </Link>
          </div>
        ) : null}
        {drawer === 'jobs-today' ? (
          metrics.todayJobs.length === 0 ? (
            <AdminEmptyState title='No jobs today' detail='Bookings scheduled for today appear here with tech assignment.' />
          ) : (
            <ul className='space-y-2'>
              {metrics.todayJobs.map((j) => (
                <li key={j.id}>
                  <Link href={j.href} className='flex justify-between rounded-xl border border-white/10 px-4 py-3 text-sm hover:border-gold/30'>
                    <span className='font-bold text-white'>{j.guestName}</span>
                    <span className='text-zinc-400'>{j.when}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {drawer === 'leads' ? (
          <div className='space-y-3'>
            <p className='text-sm text-zinc-300'>
              {metrics.leadPipeline.newCount} new · {metrics.leadPipeline.contactedCount} quoted · {metrics.leadPipeline.convertedCount} booked
            </p>
            <Link href='/admin/leads' className='inline-block text-xs font-black uppercase text-gold-soft underline'>
              Open leads pipeline →
            </Link>
          </div>
        ) : null}
        {drawer === 'recent-payments' ? (
          metrics.recentPayments.length === 0 ? (
            <AdminEmptyState title='No payments' detail='Payments recorded via Stripe or field entry will list here.' />
          ) : (
            <ul className='space-y-2'>
              {metrics.recentPayments.map((p) => (
                <li key={p.id} className='rounded-xl border border-white/10 px-4 py-3 text-sm'>
                  <div className='flex justify-between'>
                    <span className='text-white'>{p.customer}</span>
                    <span className='font-mono text-emerald-400'>{p.amount}</span>
                  </div>
                  <p className='mt-1 text-xs text-zinc-500'>{p.method} · {p.time}</p>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {drawer === 'upcoming' ? (
          metrics.upcomingAppts.length === 0 ? (
            <AdminEmptyState title='Nothing scheduled' detail='Future confirmed appointments appear here.' />
          ) : (
            <ul className='space-y-2'>
              {metrics.upcomingAppts.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/work-orders/${a.id}?shell=admin`} className='block rounded-xl border border-white/10 px-4 py-3 hover:border-gold/30'>
                    <p className='font-bold text-white'>{a.guestName}</p>
                    <p className='text-xs text-zinc-500'>{a.time} · {a.service} · {a.price}</p>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {drawer === 'tech-activity' ? (
          <ul className='space-y-2'>
            {metrics.techActivity.map((t) => (
              <li key={t.id} className='rounded-xl border border-white/10 px-4 py-3 text-sm'>
                <p className='font-bold text-white'>{t.name}</p>
                <p className='text-xs text-zinc-400'>{t.activeJobName ?? 'Ready for dispatch'}</p>
              </li>
            ))}
          </ul>
        ) : null}
        {drawer === 'active-jobs' ? (
          <div className='space-y-3'>
            <p className='text-3xl font-mono font-black text-cyan-300'>{metrics.activeJobsCount}</p>
            <Link href='/admin/dispatch' className='inline-block text-xs font-black uppercase text-gold-soft underline'>
              Dispatch board →
            </Link>
          </div>
        ) : null}
        {drawer === 'booking-health' ? (
          <div className='space-y-3'>
            <p className='text-4xl font-mono font-black text-gold-soft'>{metrics.bookingHealth}%</p>
            <Link href='/admin/booking-health' className='inline-block text-xs font-black uppercase text-gold-soft underline'>
              Diagnostics →
            </Link>
          </div>
        ) : null}
      </AdminMetricDrawer>
    </div>
  );
}
