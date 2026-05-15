'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  CalendarDays,
  Camera,
  ClipboardCheck,
  FileText,
  Sparkles,
  Target,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { TechFieldTools } from '@/app/(dashboard)/tech/tech-field-tools';
import { TechJobsClient } from '@/app/(dashboard)/tech/tech-jobs-client';
import { techClaimLeadAction } from '@/app/(dashboard)/tech/tech-lead-actions';

export type TechJob = {
  id: string;
  status: string;
  scheduled_start: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  vehicle_description: string | null;
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number | null;
  notes?: string | null;
  hasIntake?: boolean;
  beforePhotoCount?: number;
  afterPhotoCount?: number;
};

export type TechAnalytics = {
  completedCount: number;
  avgJobMinutes: number | null;
  revenueMonthCents: number;
};

export type TechLeadRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  contact_attempts: number;
  notes: string | null;
  created_at: string;
  in_pool: boolean;
};

export type TechPerformanceMetrics = {
  jobsCompleted: number;
  avgCompletionMinutes: number | null;
  longestJobs: { durationMinutes: number; appointmentId: string | null }[];
  revenueTodayFromPayments: number;
  revenueWeekFromPayments: number;
  serviceFrequency: { slug: string; count: number }[];
  topAddOns: { slug: string; count: number }[];
};

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function formatRole(role: string | null | undefined): string {
  const r = (role ?? '').replace(/_/g, ' ');
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Staff';
}

const cardGlow =
  'rounded-2xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-950/95 p-5 shadow-[0_0_40px_rgba(212,166,77,0.08)] transition duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-[0_0_52px_rgba(212,166,77,0.2)]';

const actionBtn =
  'group flex items-center justify-center gap-2 rounded-xl border border-gold/35 bg-black/50 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gold-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-gold/60 hover:bg-gold/10 hover:shadow-[0_0_24px_rgba(212,166,77,0.15)]';

const initialPerform: TechPerformanceMetrics = {
  jobsCompleted: 0,
  avgCompletionMinutes: null,
  longestJobs: [],
  revenueTodayFromPayments: 0,
  revenueWeekFromPayments: 0,
  serviceFrequency: [],
  topAddOns: [],
};

export function TechPremiumShell({
  techName,
  roleLabel,
  jobs,
  revenueTodayCents,
  revenueWeekCents,
  analytics,
  assignedLeads = [],
  poolLeads = [],
  performance = initialPerform,
  goalLabel,
  goalTargetCents,
}: {
  techName: string;
  roleLabel: string | null;
  jobs: TechJob[];
  revenueTodayCents: number;
  revenueWeekCents: number;
  analytics: TechAnalytics;
  assignedLeads?: TechLeadRow[];
  poolLeads?: TechLeadRow[];
  performance?: TechPerformanceMetrics;
  goalLabel: string | null;
  goalTargetCents: number | null;
}) {
  const todayJobs = jobs.filter((j) => isToday(j.scheduled_start));
  const activeJob = jobs.find((j) => j.status === 'in_progress');
  const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const initial = (techName || '?').charAt(0).toUpperCase();
  const goalPct =
    goalTargetCents != null && goalTargetCents > 0 ? Math.min(100, Math.round((revenueWeekCents / goalTargetCents) * 100)) : 0;

  return (
    <div className='relative min-h-screen overflow-hidden pb-24'>
      <div
        className='pointer-events-none absolute inset-0 flex items-start justify-center pt-10 opacity-[0.035]'
        aria-hidden
      >
        <span className='text-[9rem] font-black uppercase tracking-[0.2em] text-white sm:text-[12rem]'>Gloss Boss</span>
      </div>
      <div className='pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-[100px]' aria-hidden />
      <div className='pointer-events-none absolute -left-32 top-1/3 h-64 w-64 rounded-full bg-amber-500/5 blur-[90px]' aria-hidden />

      <header className='relative mb-10 flex flex-col gap-6 border-b border-white/10 pb-8 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex items-start gap-4'>
          <div className='relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/30 to-black text-xl font-black text-gold-soft shadow-[0_0_28px_rgba(212,166,77,0.4)]'>
            {initial}
            <Sparkles className='absolute -right-1 -top-1 h-4 w-4 text-amber-300' aria-hidden />
          </div>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.35em] text-gold-soft'>Gloss Boss ATX · Field</p>
            <h1 className='mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl'>Welcome back, {techName}</h1>
            <p className='mt-1 text-sm text-zinc-400'>
              {todayStr}
              <span className='mx-2 text-zinc-600'>·</span>
              {formatRole(roleLabel)}
            </p>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gold-soft'>
            Command center
          </span>
        </div>
      </header>

      <section className={`${cardGlow} relative mb-10 overflow-hidden`}>
        <div className='pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_top,rgba(212,166,77,0.14),transparent_55%)]' />
        <p className='relative text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Live dispatch metrics</p>
        <div className='relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'
          >
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <CalendarDays className='h-3.5 w-3.5 text-gold-soft' aria-hidden />
              Jobs today
            </p>
            <p className='mt-2 text-2xl font-black text-white'>{todayJobs.length}</p>
          </motion.div>
          <div className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <TrendingUp className='h-3.5 w-3.5 text-emerald-400' aria-hidden />
              Revenue (jobs)
            </p>
            <p className='mt-2 text-lg font-black text-white'>
              ${(revenueTodayCents / 100).toFixed(0)} <span className='text-xs font-normal text-zinc-500'>today</span>
            </p>
            <p className='text-sm text-gold-soft'>
              ${(revenueWeekCents / 100).toFixed(0)} <span className='text-xs font-normal text-zinc-500'>7d booked</span>
            </p>
          </div>
          <div className='rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3'>
            <p className='text-[10px] font-bold uppercase tracking-wider text-emerald-400/90'>Stripe (completed)</p>
            <p className='mt-2 text-lg font-black text-white'>
              ${(performance.revenueTodayFromPayments / 100).toFixed(0)}{' '}
              <span className='text-xs font-normal text-zinc-500'>today</span>
            </p>
            <p className='text-sm text-emerald-200/90'>
              ${(performance.revenueWeekFromPayments / 100).toFixed(0)} <span className='text-xs font-normal text-zinc-500'>week</span>
            </p>
          </div>
          <div className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <Timer className='h-3.5 w-3.5 text-zinc-400' aria-hidden />
              Avg completion
            </p>
            <p className='mt-2 text-lg font-black text-white'>
              {performance.avgCompletionMinutes != null ? `${performance.avgCompletionMinutes} min` : '—'}
            </p>
            <p className='mt-1 text-[10px] text-zinc-600'>
              Timers (30d sample) · {analytics.completedCount} jobs w/ revenue in last 30d · all-time completed rows:{' '}
              {performance.jobsCompleted}
            </p>
          </div>
          <div className='rounded-xl border border-gold/30 bg-black/50 px-4 py-3'>
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <Target className='h-3.5 w-3.5 text-gold-soft' aria-hidden />
              {goalLabel ?? 'Weekly goal'}
            </p>
            <div className='mt-2 h-2.5 overflow-hidden rounded-full bg-zinc-800'>
              <motion.div
                className='h-full rounded-full bg-gradient-to-r from-gold/80 to-amber-400'
                initial={{ width: 0 }}
                animate={{ width: `${goalPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <p className='mt-2 text-xs text-zinc-400'>
              {goalTargetCents != null ? (
                <>
                  {goalPct}% of ${(goalTargetCents / 100).toFixed(0)} target (7d job revenue vs goal)
                </>
              ) : (
                'No goal row in business_goals — admin can seed tech_revenue_week.'
              )}
            </p>
          </div>
        </div>
      </section>

      <h2 className='mb-3 text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Assigned jobs</h2>
      <TechJobsClient jobs={jobs} />

      <section className='mt-10'>
        <p className='mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Assigned leads</p>
        {assignedLeads.length === 0 ? (
          <p className='text-sm text-zinc-500'>No leads directly assigned — check the open pool below.</p>
        ) : (
          <ul className='grid gap-3 sm:grid-cols-2'>
            {assignedLeads.map((l) => (
              <li
                key={l.id}
                className='rounded-2xl border border-white/10 bg-zinc-950/90 p-4 text-sm text-zinc-300 shadow-[0_0_24px_rgba(212,166,77,0.06)]'
              >
                <p className='font-bold text-white'>{l.name}</p>
                <p className='text-[10px] uppercase tracking-wider text-zinc-500'>{l.status} · {l.contact_attempts} attempts</p>
                {l.phone ? <p className='mt-1 text-xs'>{l.phone}</p> : null}
                {l.notes ? <p className='mt-2 line-clamp-2 text-xs text-zinc-500'>{l.notes}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='mt-8'>
        <p className='mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Quick actions</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <Link href='/tech/workflow' className={actionBtn}>
            <ClipboardCheck className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            Walk-in workflow
          </Link>
          <Link href='/tech#field-invoice' className={actionBtn}>
            <Zap className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            Field invoice
          </Link>
          <Link href='/admin/leads' className={actionBtn}>
            <FileText className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            Leads (admin)
          </Link>
          <Link href='/tech/resources' className={actionBtn}>
            <Sparkles className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            SOPs & docs
          </Link>
        </div>
      </section>

      <section className='mt-10'>
        <p className='mb-3 text-xs font-black uppercase tracking-[0.2em] text-emerald-300'>Open lead pool</p>
        {poolLeads.length === 0 ? (
          <p className='text-sm text-zinc-500'>Pool is empty — admins mark leads &quot;in pool&quot; from CRM.</p>
        ) : (
          <ul className='space-y-3'>
            {poolLeads.map((l) => (
              <li
                key={l.id}
                className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3'
              >
                <div>
                  <p className='font-semibold text-white'>{l.name}</p>
                  <p className='text-xs text-zinc-500'>{l.status}</p>
                  {l.phone ? <p className='text-xs text-zinc-400'>{l.phone}</p> : null}
                </div>
                <form action={techClaimLeadAction}>
                  <input type='hidden' name='leadId' value={l.id} />
                  <button
                    type='submit'
                    className='rounded-lg bg-emerald-500/90 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-black hover:brightness-110'
                  >
                    Claim lead
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {activeJob ? (
        <section className={`${cardGlow} mt-10 border-emerald-500/25 shadow-[0_0_36px_rgba(16,185,129,0.12)]`}>
          <p className='text-xs font-black uppercase tracking-[0.25em] text-emerald-400'>Active job</p>
          <div className='mt-4 grid gap-4 md:grid-cols-2'>
            <div>
              <p className='text-lg font-bold text-white'>{activeJob.guest_name ?? 'Guest'}</p>
              <p className='text-sm text-zinc-400'>{activeJob.vehicle_description ?? 'Vehicle TBD'}</p>
              <p className='mt-2 text-sm font-semibold text-gold-soft'>{activeJob.service_slug.replace(/-/g, ' ')}</p>
              <p className='mt-1 text-xs uppercase tracking-wider text-zinc-500'>{activeJob.status.replace(/_/g, ' ')}</p>
            </div>
            <ul className='space-y-2 text-xs text-zinc-300'>
              <li className='flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2'>
                <span className='flex items-center gap-2 text-zinc-400'>
                  <Timer className='h-3.5 w-3.5' aria-hidden /> Live timer
                </span>
                <span className='text-zinc-500'>Use field tools</span>
              </li>
              <li className='flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2'>
                <span className='flex items-center gap-2 text-zinc-400'>
                  <ClipboardCheck className='h-3.5 w-3.5' aria-hidden /> Intake
                </span>
                <span className={activeJob.hasIntake ? 'text-emerald-400' : 'text-amber-300'}>
                  {activeJob.hasIntake ? 'On file' : 'Needed'}
                </span>
              </li>
              <li className='flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2'>
                <span className='flex items-center gap-2 text-zinc-400'>
                  <Camera className='h-3.5 w-3.5' aria-hidden /> Before photos
                </span>
                <span className='text-white'>{activeJob.beforePhotoCount ?? 0}</span>
              </li>
              <li className='flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2'>
                <span className='flex items-center gap-2 text-zinc-400'>
                  <Camera className='h-3.5 w-3.5' aria-hidden /> After photos
                </span>
                <span className='text-white'>{activeJob.afterPhotoCount ?? 0}</span>
              </li>
            </ul>
          </div>
        </section>
      ) : null}

      <section className={`${cardGlow} mt-10`}>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Performance & analytics</p>
        <p className='mt-1 text-[11px] text-zinc-500'>From your completed jobs, timers, and Stripe payments (no mock data).</p>
        <div className='mt-4 grid gap-6 lg:grid-cols-2'>
          <div>
            <p className='text-[10px] font-bold uppercase text-zinc-500'>Longest timer sessions</p>
            {performance.longestJobs.length === 0 ? (
              <p className='mt-2 text-sm text-zinc-600'>No stopped timers yet.</p>
            ) : (
              <ul className='mt-2 space-y-1 text-sm text-zinc-300'>
                {performance.longestJobs.map((j, i) => (
                  <li key={i} className='flex justify-between border-b border-white/5 py-1'>
                    <span>{j.durationMinutes} min</span>
                    <span className='font-mono text-xs text-zinc-500'>{j.appointmentId?.slice(0, 8) ?? '—'}…</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className='text-[10px] font-bold uppercase text-zinc-500'>Service frequency (completed)</p>
            {performance.serviceFrequency.length === 0 ? (
              <p className='mt-2 text-sm text-zinc-600'>Complete jobs to see frequency.</p>
            ) : (
              <ul className='mt-2 space-y-1 text-sm'>
                {performance.serviceFrequency.map((s) => (
                  <li key={s.slug} className='flex justify-between text-zinc-300'>
                    <span>{s.slug.replace(/-/g, ' ')}</span>
                    <span className='text-gold-soft'>{s.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className='lg:col-span-2'>
            <p className='text-[10px] font-bold uppercase text-zinc-500'>Top add-ons (completed jobs)</p>
            {performance.topAddOns.length === 0 ? (
              <p className='mt-2 text-sm text-zinc-600'>No add-on slugs recorded on completed jobs.</p>
            ) : (
              <ul className='mt-2 flex flex-wrap gap-2'>
                {performance.topAddOns.map((a) => (
                  <li
                    key={a.slug}
                    className='rounded-full border border-gold/25 bg-black/40 px-3 py-1 text-xs text-gold-soft'
                  >
                    {a.slug} ×{a.count}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div id='schedule-today' className='mt-10 scroll-mt-28'>
        {todayJobs.length > 0 ? (
          <section className={cardGlow}>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-emerald-300'>Today&apos;s schedule</p>
            <ul className='mt-4 space-y-2'>
              {todayJobs.map((j) => (
                <li
                  key={j.id}
                  className='flex flex-wrap justify-between gap-2 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-zinc-200'
                >
                  <span className='font-semibold text-white'>
                    {new Date(j.scheduled_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <span>
                    {j.guest_name ?? 'Guest'} · {j.service_slug.replace(/-/g, ' ')}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className='mb-4 text-sm text-zinc-500'>No jobs scheduled for today.</p>
        )}
      </div>

      <div id='field-invoice' className='mt-10 scroll-mt-28'>
        <TechFieldTools linkAppointmentId={activeJob?.id ?? null} />
      </div>
    </div>
  );
}
