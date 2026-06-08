'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  MapPin,
  Gauge,
  Fuel,
  PackageOpen,
  UserPlus,
  Navigation,
  ChevronRight
} from 'lucide-react';
import { TechFieldTools } from '@/app/(dashboard)/tech/tech-field-tools';
import { TechJobsClient } from '@/app/(dashboard)/tech/tech-jobs-client';
import { TechTimerControls } from '@/app/(dashboard)/tech/tech-timer-controls';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { techArchiveTestWorkOrderAction, techRecordCashPaymentAction } from '@/app/(dashboard)/tech/tech-actions';
import { techClearStaleJobsFormAction } from '@/app/(dashboard)/tech/tech-actions';
import { NotificationSendForm } from '@/components/tech/notification-send-form';
import { 
  techArchiveOwnLeadAction, 
  techClaimLeadAction, 
  techUpdateLeadNotesAction, 
  techUpdateLeadStatusAction,
  techCreateFieldLeadAction,
  techSubmitSupplyRequestAction,
  techLogMileageAction
} from '@/app/(dashboard)/tech/tech-lead-actions';

export type TechJob = {
  id: string;
  status: string;
  scheduled_start: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  vehicle_description: string | null;
  booking_vehicles?: Array<Record<string, unknown>>;
  service_address?: string | null;
  service_slug: string;
  vehicle_class: string;
  base_price_cents: number | null;
  notes?: string | null;
  fieldNotesPreview?: string | null;
  hasIntake?: boolean;
  beforePhotoCount?: number;
  afterPhotoCount?: number;
  beforePhotos?: { url: string; category: string; uploadedAt: string | null }[];
  afterPhotos?: { url: string; category: string; uploadedAt: string | null }[];
  payment_status?: string | null;
  balance_due_cents?: number | null;
  fallback_booking_id?: string | null;
  workflowSessionId?: string | null;
  timerId?: string | null;
  timerStartedAt?: string | null;
  isFallback?: boolean;
};

function vehicleLines(job: Pick<TechJob, 'booking_vehicles' | 'vehicle_description' | 'service_slug' | 'vehicle_class' | 'base_price_cents'>) {
  if (Array.isArray(job.booking_vehicles) && job.booking_vehicles.length > 0) {
    return job.booking_vehicles.map((v, i) => ({
      label: String(v.vehicle_description ?? v.description ?? `Vehicle ${i + 1}`),
      service: String(v.service_slug ?? job.service_slug ?? ''),
      vehicleClass: String(v.vehicle_class ?? job.vehicle_class ?? ''),
      color: String(v.vehicle_color ?? v.color ?? '') || 'Color not provided',
      priceCents: typeof v.price_cents === 'number' ? v.price_cents : null,
    }));
  }
  return [
    {
      label: job.vehicle_description ?? 'Vehicle TBD',
      service: job.service_slug,
      vehicleClass: job.vehicle_class,
      color: 'Color not provided',
      priceCents: job.base_price_cents,
    },
  ];
}

function directionsHref(address?: string | null) {
  return address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '';
}

import { workOrderPath } from '@/lib/work-order-links';
import { isRealTimerId, isStaleTimerStart } from '@/lib/tech-job-filters';

function workOrderHref(job: TechJob) {
  const id = job.isFallback && job.fallback_booking_id ? job.fallback_booking_id : job.id;
  return workOrderPath(id, { source: job.isFallback ? 'fallback' : 'appointment', shell: 'technician' });
}

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

function LiveTimer({ startedAt }: { startedAt?: string | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!startedAt) return <span className='text-zinc-500'>Timer started</span>;
  const elapsed = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return (
    <span className='font-mono text-emerald-300'>
      {h > 0 ? `${h}:` : ''}
      {String(m).padStart(h > 0 ? 2 : 1, '0')}:{String(s).padStart(2, '0')}
    </span>
  );
}

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
  justStarted = false,
  activeDebug,
  completedTodayCount = 0,
  isSuperAdmin = false,
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
  justStarted?: boolean;
  activeDebug?: { userId: string | null; checked: string[]; adminRead: boolean } | null;
  completedTodayCount?: number;
  isSuperAdmin?: boolean;
}) {
  const todayJobs = jobs.filter((j) => isToday(j.scheduled_start));
  const assignedJobs = jobs.filter((j) => ['assigned', 'confirmed'].includes(j.status));
  const activeJob = jobs.find(
    (j) =>
      j.status === 'in_progress' ||
      (isRealTimerId(j.timerId) && j.timerStartedAt && !isStaleTimerStart(j.timerStartedAt)),
  );
  const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  const initial = (techName || '?').charAt(0).toUpperCase();
  const goalPct =
    goalTargetCents != null && goalTargetCents > 0 ? Math.min(100, Math.round((revenueWeekCents / goalTargetCents) * 100)) : 0;

  const [opsTab, setOpsTab] = useState<'routes' | 'mileage' | 'supplies' | 'leads'>('routes');
  const [mileageMsg, setMileageMsg] = useState<string | null>(null);
  const [supplyMsg, setSupplyMsg] = useState<string | null>(null);
  const [leadMsg, setLeadMsg] = useState<string | null>(null);
  const [mileageBusy, setMileageBusy] = useState(false);
  const [supplyBusy, setSupplyBusy] = useState(false);
  const [leadBusy, setLeadBusy] = useState(false);

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

      {isSuperAdmin ? (
        <form
          action={techClearStaleJobsFormAction}
          className='mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3'
        >
          <p className='text-xs text-red-100'>
            <strong className='font-black uppercase'>Super admin:</strong> Archive stale timers, test fallbacks, and orphan sessions older than 24h.
          </p>
          <button type='submit' className='rounded-xl border border-red-400/50 bg-red-500/20 px-4 py-2 text-[10px] font-black uppercase text-red-100'>
            Archive stale / test jobs
          </button>
        </form>
      ) : null}

      {justStarted && activeJob ? (
        <div className='mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100 shadow-[0_0_30px_rgba(16,185,129,0.12)]'>
          Job started. Your active work order is ready below.
        </div>
      ) : null}

      {justStarted && !activeJob ? (
        <div className='mb-6 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm text-amber-100 shadow-[0_0_30px_rgba(245,158,11,0.12)]'>
          <p className='font-black uppercase tracking-wider'>Job started, but no active work order was found.</p>
          <p className='mt-1 text-xs text-amber-100/80'>The start action succeeded, but the dashboard could not find an open timer, in-progress appointment/fallback, or active workflow session for this technician.</p>
          <dl className='mt-3 grid gap-1 rounded-xl border border-amber-500/20 bg-black/30 p-3 font-mono text-[11px] text-amber-50/80'>
            <div>userId: {activeDebug?.userId ?? 'unknown'}</div>
            <div>admin read: {activeDebug?.adminRead ? 'yes' : 'no'}</div>
            {(activeDebug?.checked ?? ['no debug rows collected']).map((line) => (
              <div key={line}>{line}</div>
            ))}
          </dl>
        </div>
      ) : null}

      <section className={`${cardGlow} relative mb-10 overflow-hidden`}>
        <div className='pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_top,rgba(212,166,77,0.14),transparent_55%)]' />
        <p className='relative text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Live dispatch metrics</p>
        <div className='relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className='rounded-xl border border-gold/15 bg-black/60 px-4 py-3.5 shadow-lg backdrop-blur-sm hover:border-gold/30 transition duration-300'
          >
            <p className='flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-400'>
              <CalendarDays className='h-3.5 w-3.5 text-gold-soft' aria-hidden />
              Jobs today
            </p>
            <p className='mt-2.5 text-3xl font-black text-white'>{todayJobs.length}</p>
          </motion.div>
          <div className='rounded-xl border border-gold/15 bg-black/60 px-4 py-3.5 shadow-lg backdrop-blur-sm hover:border-gold/30 transition duration-300'>
            <p className='flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-400'>
              <TrendingUp className='h-3.5 w-3.5 text-emerald-400' aria-hidden />
              Revenue (jobs)
            </p>
            <p className='mt-2.5 text-lg font-black text-white'>
              ${(revenueTodayCents / 100).toFixed(0)} <span className='text-xs font-normal text-zinc-500'>today</span>
            </p>
            <p className='text-sm font-bold text-gold-soft mt-0.5'>
              ${(revenueWeekCents / 100).toFixed(0)} <span className='text-xs font-normal text-zinc-500'>7d booked</span>
            </p>
          </div>
          <div className='rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 py-3.5 shadow-lg backdrop-blur-sm hover:border-emerald-500/40 transition duration-300'>
            <p className='text-[10px] font-black uppercase tracking-wider text-emerald-400/90'>Stripe (completed)</p>
            <p className='mt-2.5 text-lg font-black text-white'>
              ${(performance.revenueTodayFromPayments / 100).toFixed(0)}{' '}
              <span className='text-xs font-normal text-zinc-500'>today</span>
            </p>
            <p className='text-sm font-bold text-emerald-200/95 mt-0.5'>
              ${(performance.revenueWeekFromPayments / 100).toFixed(0)} <span className='text-xs font-normal text-zinc-500'>week</span>
            </p>
          </div>
          <div className='rounded-xl border border-gold/15 bg-black/60 px-4 py-3.5 shadow-lg backdrop-blur-sm hover:border-gold/30 transition duration-300'>
            <p className='flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-400'>
              <Timer className='h-3.5 w-3.5 text-zinc-400' aria-hidden />
              Avg completion
            </p>
            <p className='mt-2.5 text-lg font-black text-white'>
              {performance.avgCompletionMinutes != null ? `${performance.avgCompletionMinutes} min` : '—'}
            </p>
            <p className='mt-1 text-[9px] text-zinc-500 leading-tight'>
              Timers (30d) · {analytics.completedCount} active jobs · {performance.jobsCompleted} total
            </p>
          </div>
          <div className='rounded-xl border border-gold/30 bg-black/70 px-4 py-3.5 shadow-lg backdrop-blur-sm hover:border-gold/45 transition duration-300'>
            <p className='flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-zinc-400'>
              <Target className='h-3.5 w-3.5 text-gold-soft' aria-hidden />
              {goalLabel ?? 'Weekly goal'}
            </p>
            <div className='mt-2 h-2 overflow-hidden rounded-full bg-zinc-900'>
              <motion.div
                className='h-full rounded-full bg-gradient-to-r from-gold via-gold-soft to-amber-400'
                initial={{ width: 0 }}
                animate={{ width: `${goalPct}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
            <p className='mt-2 text-[10px] text-zinc-400 leading-tight'>
              {goalTargetCents != null ? (
                <>
                  {goalPct}% of ${(goalTargetCents / 100).toFixed(0)} target (7d vs goal)
                </>
              ) : (
                'Goal row is pending in database'
              )}
            </p>
          </div>
        </div>
      </section>

      {activeJob ? (
        <section className='mb-10 rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-black to-zinc-950 p-5 shadow-[0_0_36px_rgba(16,185,129,0.12)]'>
          <div className='flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
            <div>
              <p className='text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300'>Live Work Order</p>
              <h2 className='mt-1 text-xl font-black uppercase tracking-tight text-white'>
                {activeJob.guest_name ?? 'Walk-in customer'} · {activeJob.vehicle_description ?? 'Vehicle TBD'}
              </h2>
              <p className='mt-1 text-sm text-zinc-400'>
                {activeJob.service_slug.replace(/-/g, ' ')} · before {activeJob.beforePhotoCount ?? 0} · after {activeJob.afterPhotoCount ?? 0}
              </p>
              <p className='mt-1 text-xs text-zinc-500'>
                {activeJob.guest_phone ? <a href={`tel:${activeJob.guest_phone}`} className='text-gold-soft underline underline-offset-4'>{activeJob.guest_phone}</a> : 'No phone on file'} ·{' '}
                {activeJob.base_price_cents != null ? `$${(activeJob.base_price_cents / 100).toFixed(2)} quote` : 'Quote pending'} ·{' '}
                {activeJob.payment_status ?? 'payment pending'}
              </p>
              <p className='mt-1 text-xs text-zinc-500'>
                Directions:{' '}
                {activeJob.service_address ? (
                  <a
                    href={directionsHref(activeJob.service_address)}
                    target='_blank'
                    rel='noreferrer'
                    className='text-gold-soft underline underline-offset-4'
                  >
                    {activeJob.service_address}
                  </a>
                ) : (
                  <span className='text-zinc-600'>No service address on file — contact customer.</span>
                )}
              </p>
            </div>
            <div className='flex flex-wrap items-center gap-3'>
              <div className='rounded-xl border border-emerald-500/25 bg-black/40 px-4 py-2 text-sm'>
                <span className='mr-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-300'>Timer running</span>
                <LiveTimer startedAt={activeJob.timerStartedAt} />
              </div>
              <TechTimerControls
                appointmentId={activeJob.isFallback ? null : activeJob.id}
                fallbackBookingId={activeJob.fallback_booking_id ?? null}
                workflowSessionId={activeJob.workflowSessionId ?? null}
                initialTimerId={activeJob.timerId ?? null}
              />
              <Link href={workOrderHref(activeJob)} className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>
                Open Work Order
              </Link>
            </div>
          </div>
          <div className='mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4'>
            <div className='rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300'>Agreement: <span className={activeJob.hasIntake ? 'text-emerald-300' : 'text-amber-300'}>{activeJob.hasIntake ? 'signed/on file' : 'needs review'}</span></div>
            <div className='rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300'>Notes: <span className={activeJob.fieldNotesPreview ? 'text-emerald-300' : 'text-zinc-500'}>{activeJob.fieldNotesPreview ? 'saved' : 'ready'}</span></div>
            <div className='rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300'>Started: <span className='text-white'>{activeJob.timerStartedAt ? new Date(activeJob.timerStartedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'just now'}</span></div>
            <div className='rounded-xl border border-white/10 bg-black/35 p-3 text-xs text-zinc-300'>Status: <span className='text-emerald-300'>{activeJob.isFallback ? 'fallback in progress' : activeJob.status.replace(/_/g, ' ')}</span></div>
          </div>
          <div className='mt-4 grid gap-4 lg:grid-cols-2'>
            <div className='rounded-2xl border border-white/10 bg-black/30 p-3'>
              <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Before Photos</p>
              {activeJob.beforePhotos?.length ? (
                <div className='mt-3 grid grid-cols-4 gap-2'>
                  {activeJob.beforePhotos.map((photo) => (
                    <div key={`${photo.url}-${photo.category}`} className='space-y-1'>
                      <img src={photo.url} alt={`${photo.category} before`} className='aspect-square rounded-lg border border-white/10 object-cover' />
                      <p className='truncate text-[9px] uppercase text-zinc-400'>{photo.category.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='mt-2 space-y-2'>
                  <p className='text-xs text-amber-200'>Before photo missing. The work order can stay open because this job is already started.</p>
                  <Link href={workOrderHref(activeJob)} className='inline-flex rounded-lg border border-gold/35 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-gold-soft'>
                    Upload before photo now
                  </Link>
                </div>
              )}
            </div>
            <div className='rounded-2xl border border-white/10 bg-black/30 p-3'>
              <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>After Photos</p>
              {activeJob.afterPhotos?.length ? (
                <div className='mt-3 grid grid-cols-4 gap-2'>
                  {activeJob.afterPhotos.map((photo) => (
                    <div key={`${photo.url}-${photo.category}`} className='space-y-1'>
                      <img src={photo.url} alt={`${photo.category} after`} className='aspect-square rounded-lg border border-white/10 object-cover' />
                      <p className='truncate text-[9px] uppercase text-zinc-400'>{photo.category.replace(/_/g, ' ')}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className='mt-2 text-xs text-zinc-500'>Use Upload After Photos when the job is ready for closeout.</p>
              )}
            </div>
          </div>
          <div className='mt-4 flex flex-wrap gap-2'>
            <Link href={workOrderHref(activeJob)} className='rounded-lg border border-gold/40 px-4 py-2 text-xs font-black uppercase tracking-wider text-gold-soft'>Open Work Order</Link>
            <Link href={workOrderHref(activeJob)} className='rounded-lg border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-200'>Upload After Photos</Link>
            <Link href={workOrderHref(activeJob)} className='rounded-lg border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-zinc-200'>Save Notes</Link>
            <div className='flex w-full flex-col gap-2 sm:w-auto'>
              {(['last_touches', 'payment_link', 'review_request'] as const).map((kind) => (
                <div key={`top-${kind}`} className='flex flex-col gap-0.5'>
                  <NotificationSendForm
                    kind={kind}
                    appointmentId={!activeJob.isFallback ? activeJob.id : undefined}
                    fallbackBookingId={activeJob.fallback_booking_id ?? undefined}
                    buttonClassName='rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white hover:brightness-110 disabled:opacity-60'
                  >
                    {kind === 'last_touches' ? 'Last Touches' : kind === 'payment_link' ? 'Send Pay Now Link' : 'Send Review Request'}
                  </NotificationSendForm>
                  <p className='text-[10px] text-zinc-500'>
                    {kind === 'last_touches'
                      ? 'SMS/email customer that service is wrapping up.'
                      : kind === 'payment_link'
                        ? 'Stripe balance link — logs to notification outbox.'
                        : 'Google review link after job (SMS if configured).'}
                  </p>
                </div>
              ))}
            </div>
            <form action={techRecordCashPaymentAction} className='flex flex-wrap gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/5 p-2'>
              {!activeJob.isFallback ? <input type='hidden' name='appointmentId' value={activeJob.id} /> : null}
              {activeJob.fallback_booking_id ? <input type='hidden' name='fallbackBookingId' value={activeJob.fallback_booking_id} /> : null}
              <input name='amountReceived' inputMode='decimal' placeholder='Cash $' className='w-20 rounded border border-emerald-400/20 bg-black px-2 py-1 text-[10px] text-white' />
              <input name='changeGiven' inputMode='decimal' placeholder='Change' className='w-20 rounded border border-emerald-400/20 bg-black px-2 py-1 text-[10px] text-white' />
              <button type='submit' className='rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-wider text-emerald-200 hover:bg-emerald-500/15'>
                Paid Cash
              </button>
            </form>
            <Link href={workOrderHref(activeJob)} className='rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase tracking-wider text-black'>Complete Job</Link>
            <form action={techArchiveTestWorkOrderAction} className='flex flex-wrap items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1'>
              {!activeJob.isFallback ? <input type='hidden' name='appointmentId' value={activeJob.id} /> : null}
              {activeJob.fallback_booking_id ? <input type='hidden' name='fallbackBookingId' value={activeJob.fallback_booking_id} /> : null}
              <ConfirmSubmitButton message='Archive this test job?' className='rounded bg-red-500/20 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-red-200'>
                Archive Test Job
              </ConfirmSubmitButton>
            </form>
          </div>
        </section>
      ) : null}

      <section className='mb-10'>
        <h2 className='mb-3 text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Today ({todayJobs.length})</h2>
        {todayJobs.length === 0 ? (
          <p className='text-sm text-zinc-500'>No jobs scheduled for today.</p>
        ) : (
          <ul className='space-y-3'>
            {todayJobs.map((j) => (
              <li key={j.id} className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
                <div>
                  <p className='font-bold text-white'>{j.guest_name ?? 'Customer'}</p>
                  <p className='text-xs text-zinc-500'>{new Date(j.scheduled_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · {j.service_slug.replace(/-/g, ' ')}</p>
                </div>
                <Link href={workOrderHref(j)} className='rounded-lg bg-gold px-4 py-2 text-[10px] font-black uppercase text-black'>
                  Open
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className='mb-10'>
        <h2 className='mb-3 text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Assigned jobs ({assignedJobs.length})</h2>
        <TechJobsClient jobs={assignedJobs.length ? assignedJobs : jobs} />
      </section>

      <section className={`${cardGlow} mb-10`}>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Completed today</p>
        <p className='mt-2 text-3xl font-black text-white'>{completedTodayCount}</p>
        <p className='mt-1 text-xs text-zinc-500'>Finished jobs assigned to you since midnight.</p>
      </section>

      <section className={`${cardGlow} mb-10`}>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Performance (30 days)</p>
        <p className='mt-2 text-sm text-zinc-400'>
          Avg {performance.avgCompletionMinutes != null ? `${performance.avgCompletionMinutes} min` : '—'} · {performance.jobsCompleted} completed · Stripe week $
          {(performance.revenueWeekFromPayments / 100).toFixed(0)}
        </p>
      </section>

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
                <p className='text-[10px] uppercase tracking-wider text-zinc-500'>
                  {l.status} · {l.contact_attempts} attempts
                </p>
                {l.phone ? <p className='mt-1 text-xs'>{l.phone}</p> : null}
                {l.notes ? <p className='mt-2 line-clamp-2 text-xs text-zinc-500'>{l.notes}</p> : null}
                <form className='mt-3' action={techUpdateLeadStatusAction}>
                  <input type='hidden' name='leadId' value={l.id} />
                  <label className='text-[10px] text-zinc-500'>
                    Update status
                    <select
                      name='status'
                      defaultValue={
                        l.status === 'contacted' || l.status === 'quoted' || l.status === 'no_response' || l.status === 'lost'
                          ? l.status
                          : 'contacted'
                      }
                      className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white'
                    >
                      <option value='contacted'>Contacted</option>
                      <option value='quoted'>Quoted</option>
                      <option value='no_response'>No response</option>
                      <option value='lost'>Lost</option>
                    </select>
                  </label>
                  <button
                    type='submit'
                    className='mt-2 w-full rounded border border-gold/35 py-1.5 text-[10px] font-black uppercase text-gold-soft'
                  >
                    Save status
                  </button>
                </form>
                <form className='mt-3' action={techUpdateLeadNotesAction}>
                  <input type='hidden' name='leadId' value={l.id} />
                  <label className='text-[10px] text-zinc-500'>
                    Notes
                    <textarea
                      name='notes'
                      rows={2}
                      defaultValue={l.notes ?? ''}
                      className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-xs text-white'
                    />
                  </label>
                  <button type='submit' className='mt-1 text-[10px] font-bold uppercase text-zinc-400 underline'>
                    Save notes
                  </button>
                </form>
                {l.status !== 'booked' ? (
                  <form className='mt-2 flex gap-2' action={techArchiveOwnLeadAction}>
                    <input type='hidden' name='leadId' value={l.id} />
                    <ConfirmSubmitButton message='Archive this test lead?' className='text-[10px] font-bold uppercase text-amber-200 underline'>
                      Archive Test Lead
                    </ConfirmSubmitButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Field Operations Center Overhaul */}
      <section className='mb-10 rounded-3xl border border-gold/20 bg-gradient-to-br from-zinc-950 via-black to-zinc-950/95 p-5 shadow-[0_0_40px_rgba(212,166,77,0.05)]'>
        <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Field Operations Center</p>
        
        {/* Ops Tabs Navigation */}
        <div className='mt-4 flex gap-1.5 overflow-x-auto pb-1 border-b border-white/5'>
          {(['routes', 'mileage', 'supplies', 'leads'] as const).map((tab) => (
            <button
              key={tab}
              type='button'
              onClick={() => setOpsTab(tab)}
              className={`rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                opsTab === tab
                  ? 'bg-gold text-black shadow-[0_0_12px_rgba(212,166,77,0.25)]'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {tab === 'routes' ? 'Routes & Dispatch' : tab === 'mileage' ? 'Gas & Mileage Log' : tab === 'supplies' ? 'Supply Request' : 'Field Lead Capture'}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className='mt-5'>
          {/* Routes Tab */}
          {opsTab === 'routes' && (
            <div className='space-y-4'>
              <p className='text-xs text-zinc-400'>Unified daily route mapping. Select destinations to launch step-by-step navigation.</p>
              {todayJobs.length === 0 ? (
                <p className='text-xs text-zinc-500 italic py-4 text-center'>No jobs scheduled for today to map.</p>
              ) : (
                <div className='space-y-3.5'>
                  <div className='space-y-2'>
                    {todayJobs.map((j, i) => (
                      <div key={j.id} className='flex items-center justify-between rounded-xl bg-zinc-900/40 p-3 border border-white/5 hover:border-gold/20 transition'>
                        <div className='flex items-start gap-2.5'>
                          <div className='flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-xs font-black text-gold border border-gold/25'>
                            {i + 1}
                          </div>
                          <div>
                            <p className='text-xs font-bold text-white'>{j.guest_name ?? 'Customer'} · <span className='text-gold-soft font-mono'>{new Date(j.scheduled_start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></p>
                            <p className='text-[10px] text-zinc-400 mt-0.5'>{j.service_address ?? 'No address provided'}</p>
                          </div>
                        </div>
                        {j.service_address && (
                          <a
                            href={directionsHref(j.service_address)}
                            target='_blank'
                            rel='noreferrer'
                            className='rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-200 flex items-center gap-1'
                          >
                            <Navigation className='h-3 w-3 text-gold-soft' /> Nav
                          </a>
                        )}
                      </div>
                    ))}
                  </div>

                  {todayJobs.some(j => j.service_address) && (
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(todayJobs.filter(j => j.service_address).map(j => j.service_address).join('|'))}`}
                      target='_blank'
                      rel='noreferrer'
                      className='w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_15px_rgba(212,166,77,0.25)] hover:bg-gold-soft transition'
                    >
                      <MapPin className='h-4 w-4' /> Launch Unified Route in Google Maps
                    </a>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Mileage Log Tab */}
          {opsTab === 'mileage' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setMileageBusy(true);
                setMileageMsg(null);
                try {
                  const fd = new FormData(e.currentTarget);
                  const res = await techLogMileageAction(fd);
                  if (res.ok) {
                    setMileageMsg('Mileage and gas purchase logged successfully!');
                    (e.target as HTMLFormElement).reset();
                  } else {
                    setMileageMsg(res.error ?? 'Failed to log mileage.');
                  }
                } catch {
                  setMileageMsg('Network error logging mileage.');
                } finally {
                  setMileageBusy(false);
                }
              }}
              className='space-y-3'
            >
              <div className='grid gap-3 sm:grid-cols-2'>
                <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                  Link to Job (Optional)
                  <select name='appointmentId' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white'>
                    <option value=''>Standalone Log (No linked job)</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.guest_name ?? 'Job'} - {j.vehicle_description ?? 'TBD'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                  Gas cost ($)
                  <input name='gasCost' type='number' step='0.01' min='0' placeholder='0.00' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
                </label>
                <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                  Odometer Start (mi) *
                  <input name='startMileage' type='number' step='0.1' min='0' required placeholder='0.0' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
                </label>
                <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                  Odometer End (mi)
                  <input name='endMileage' type='number' step='0.1' min='0' placeholder='0.0' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
                </label>
              </div>
              <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                Notes
                <textarea name='notes' rows={2} placeholder='Specify vehicle info, gas station, or route notes' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
              </label>
              <button
                type='submit'
                disabled={mileageBusy}
                className='w-full rounded-xl border border-gold/45 bg-gold/10 py-2.5 text-xs font-black uppercase text-gold-soft hover:bg-gold/15 transition disabled:opacity-50'
              >
                {mileageBusy ? 'Saving Log...' : 'Submit Mileage & Gas Log'}
              </button>
              {mileageMsg && <p className='text-xs text-gold-soft mt-1.5'>{mileageMsg}</p>}
            </form>
          )}

          {/* Supply Request Tab */}
          {opsTab === 'supplies' && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSupplyBusy(true);
                setSupplyMsg(null);
                try {
                  const fd = new FormData(e.currentTarget);
                  const res = await techSubmitSupplyRequestAction(fd);
                  if (res.ok) {
                    setSupplyMsg('Supply request submitted to manager review.');
                    (e.target as HTMLFormElement).reset();
                  } else {
                    setSupplyMsg(res.error ?? 'Failed to submit supply request.');
                  }
                } catch {
                  setSupplyMsg('Network error submitting request.');
                } finally {
                  setSupplyBusy(false);
                }
              }}
              className='space-y-3'
            >
              <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                Items Requested *
                <textarea
                  name='items'
                  rows={2}
                  required
                  placeholder='e.g., 10x Microfiber Towels, 1gal Tire Shine, 1x Clay Bar kit'
                  className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white font-mono'
                />
              </label>
              <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                Internal Notes / Urgency
                <textarea name='notes' rows={2} placeholder='Detail warehouse locations or job deadlines' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
              </label>
              <button
                type='submit'
                disabled={supplyBusy}
                className='w-full rounded-xl border border-gold/45 bg-gold/10 py-2.5 text-xs font-black uppercase text-gold-soft hover:bg-gold/15 transition disabled:opacity-50'
              >
                {supplyBusy ? 'Submitting...' : 'Submit Supply Request'}
              </button>
              {supplyMsg && <p className='text-xs text-gold-soft mt-1.5'>{supplyMsg}</p>}
            </form>
          )}

          {/* Lead Capture Tab */}
          {opsTab === 'leads' && (
            <form
              id='field-lead-capture'
              onSubmit={async (e) => {
                e.preventDefault();
                setLeadBusy(true);
                setLeadMsg(null);
                try {
                  const fd = new FormData(e.currentTarget);
                  const res = await techCreateFieldLeadAction(fd);
                  if (res.ok) {
                    setLeadMsg('Field lead captured! Claimed automatically.');
                    (e.target as HTMLFormElement).reset();
                  } else {
                    setLeadMsg(res.error ?? 'Failed to capture lead.');
                  }
                } catch {
                  setLeadMsg('Network error capturing lead.');
                } finally {
                  setLeadBusy(false);
                }
              }}
              className='space-y-3'
            >
              <div className='grid gap-3 sm:grid-cols-2'>
                <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                  Customer Full Name *
                  <input name='name' required placeholder='e.g. John Doe' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
                </label>
                <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                  Phone Number
                  <input name='phone' placeholder='512-555-0199' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
                </label>
                <label className='block text-[10px] uppercase text-zinc-500 font-bold sm:col-span-2'>
                  Email Address
                  <input name='email' type='email' placeholder='customer@domain.com' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
                </label>
              </div>
              <label className='block text-[10px] uppercase text-zinc-500 font-bold'>
                Upsell / Lead Opportunity Details
                <textarea name='notes' rows={3} placeholder='Door-knocking detail, neighbor of today’s job, vehicle interest details...' className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
              </label>
              <button
                type='submit'
                disabled={leadBusy}
                className='w-full rounded-xl bg-gold py-2.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition shadow-[0_0_15px_rgba(212,166,77,0.2)] disabled:opacity-50'
              >
                {leadBusy ? 'Saving Lead...' : 'Register Field Lead Opportunity'}
              </button>
              {leadMsg && <p className='text-xs text-gold-soft mt-1.5'>{leadMsg}</p>}
            </form>
          )}
        </div>
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
          <button type='button' onClick={() => setOpsTab('leads')} className={actionBtn}>
            <FileText className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            Capture lead
          </button>
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

      <div id='field-invoice' className='mt-10 scroll-mt-28'>
        {activeJob ? (
          <TechFieldTools linkAppointmentId={activeJob.id} />
        ) : (
          <section className={cardGlow}>
            <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Field tools</p>
            <p className='mt-2 text-sm text-zinc-400'>
              Timer and job notes appear here after you start or select an active job. Use the walk-in workflow for same-day jobs.
            </p>
            <Link href='/tech/workflow' className='mt-4 inline-block rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>
              Start walk-in workflow
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}
