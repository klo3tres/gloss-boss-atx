import Link from 'next/link';
import {
  CalendarDays,
  Camera,
  ClipboardCheck,
  FileText,
  Sparkles,
  Timer,
  TrendingUp,
  Truck,
  Zap,
} from 'lucide-react';
import { TechFieldTools } from '@/app/(dashboard)/tech/tech-field-tools';
import { TechJobsClient } from '@/app/(dashboard)/tech/tech-jobs-client';

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

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

function formatRole(role: string | null | undefined): string {
  const r = (role ?? '').replace(/_/g, ' ');
  return r ? r.charAt(0).toUpperCase() + r.slice(1) : 'Staff';
}

const cardBase =
  'rounded-2xl border border-gold/25 bg-gradient-to-br from-zinc-950 via-black to-zinc-950/95 p-5 shadow-[0_0_40px_rgba(212,166,77,0.08)] transition duration-300 hover:-translate-y-0.5 hover:border-gold/45 hover:shadow-[0_0_48px_rgba(212,166,77,0.16)]';

const actionBtn =
  'group flex items-center justify-center gap-2 rounded-xl border border-gold/35 bg-black/50 px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-gold-soft shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition hover:border-gold/60 hover:bg-gold/10';

export function TechPremiumShell({
  techName,
  roleLabel,
  jobs,
  revenueTodayCents,
  revenueWeekCents,
  analytics,
}: {
  techName: string;
  roleLabel: string | null;
  jobs: TechJob[];
  revenueTodayCents: number;
  revenueWeekCents: number;
  analytics: TechAnalytics;
}) {
  const todayJobs = jobs.filter((j) => isToday(j.scheduled_start));
  const activeJob = jobs.find((j) => j.status === 'in_progress');
  const todayStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className='relative min-h-screen overflow-hidden pb-20'>
      <div
        className='pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/10 blur-[100px]'
        aria-hidden
      />
      <div className='pointer-events-none absolute -left-32 top-1/3 h-64 w-64 rounded-full bg-amber-500/5 blur-[90px]' aria-hidden />

      <header className='relative mb-8 flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-start gap-4'>
          <div className='flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/25 to-black shadow-[0_0_24px_rgba(212,166,77,0.35)]'>
            <Sparkles className='h-7 w-7 text-gold-soft' aria-hidden />
          </div>
          <div>
            <p className='text-[10px] font-black uppercase tracking-[0.35em] text-gold-soft'>Gloss Boss ATX</p>
            <h1 className='mt-1 text-2xl font-black uppercase tracking-tight text-white sm:text-3xl'>Field command</h1>
            <p className='mt-1 text-sm text-zinc-400'>
              {techName}
              <span className='mx-2 text-zinc-600'>·</span>
              {todayStr}
            </p>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-[10px] font-black uppercase tracking-widest text-gold-soft'>
            {formatRole(roleLabel)}
          </span>
        </div>
      </header>

      <section className={`${cardBase} relative mb-8`}>
        <div className='pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_at_top,rgba(212,166,77,0.12),transparent_55%)]' />
        <p className='relative text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Today — command center</p>
        <div className='relative mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          <div className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <CalendarDays className='h-3.5 w-3.5 text-gold-soft' aria-hidden />
              Jobs today
            </p>
            <p className='mt-2 text-2xl font-black text-white'>{todayJobs.length}</p>
          </div>
          <div className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <Truck className='h-3.5 w-3.5 text-emerald-400' aria-hidden />
              Active job
            </p>
            <p className='mt-2 text-sm font-semibold text-white'>{activeJob ? activeJob.guest_name ?? 'On site' : '—'}</p>
            {activeJob ? (
              <p className='mt-1 text-[11px] text-zinc-500'>{activeJob.service_slug.replace(/-/g, ' ')}</p>
            ) : (
              <p className='mt-1 text-[11px] text-zinc-600'>No job marked in progress</p>
            )}
          </div>
          <div className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <TrendingUp className='h-3.5 w-3.5 text-gold-soft' aria-hidden />
              Revenue (done)
            </p>
            <p className='mt-2 text-lg font-black text-white'>
              ${(revenueTodayCents / 100).toFixed(0)}{' '}
              <span className='text-xs font-normal text-zinc-500'>today</span>
            </p>
            <p className='text-sm text-gold-soft'>
              ${(revenueWeekCents / 100).toFixed(0)} <span className='text-xs font-normal text-zinc-500'>week</span>
            </p>
          </div>
          <div className='rounded-xl border border-white/10 bg-black/40 px-4 py-3'>
            <p className='flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500'>
              <Timer className='h-3.5 w-3.5 text-zinc-400' aria-hidden />
              Avg job time
            </p>
            <p className='mt-2 text-lg font-black text-white'>
              {analytics.avgJobMinutes != null ? `${analytics.avgJobMinutes} min` : '—'}
            </p>
            <p className='mt-1 text-[10px] text-zinc-600'>
              From {analytics.completedCount} completed assignments (in-window sample).
            </p>
          </div>
        </div>
        {analytics.revenueMonthCents > 0 ? (
          <p className='relative mt-3 text-[11px] text-zinc-500'>
            Last 30 days completed job value (assigned to you):{' '}
            <span className='font-semibold text-gold-soft'>${(analytics.revenueMonthCents / 100).toFixed(0)}</span>
          </p>
        ) : null}
      </section>

      <section className='mb-8'>
        <p className='mb-3 text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Quick actions</p>
        <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-5'>
          <Link href='/tech#field-invoice' className={actionBtn}>
            <Zap className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            Field invoice
          </Link>
          <Link href='/admin/leads' className={actionBtn}>
            <FileText className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            Open leads
          </Link>
          <Link href='/tech#field-invoice' className={actionBtn}>
            <Sparkles className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            New job sheet
          </Link>
          <Link href='/tech/resources' className={actionBtn}>
            <ClipboardCheck className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            SOPs & docs
          </Link>
          <Link href='/tech#schedule-today' className={actionBtn}>
            <CalendarDays className='h-4 w-4 opacity-80 transition group-hover:scale-110' aria-hidden />
            Schedule
          </Link>
        </div>
        <p className='mt-3 text-[10px] leading-relaxed text-zinc-600'>
          Stay on this dashboard for the full workflow: field invoice, timers, photos, checklist, and completion — no public
          booking required for walk-up jobs.
        </p>
      </section>

      {activeJob ? (
        <section className={`${cardBase} mb-8 border-emerald-500/25 shadow-[0_0_36px_rgba(16,185,129,0.12)]`}>
          <p className='text-xs font-black uppercase tracking-[0.25em] text-emerald-400'>Active job panel</p>
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
                <span className='text-zinc-500'>Use timer below</span>
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

      <div id='schedule-today' className='scroll-mt-28'>
        {todayJobs.length > 0 ? (
          <section className={`${cardBase} mb-8`}>
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
          <p className='mb-8 text-sm text-zinc-500'>No jobs scheduled for today.</p>
        )}
      </div>

      <div id='field-invoice' className='scroll-mt-28'>
        <TechFieldTools linkAppointmentId={activeJob?.id ?? null} />
      </div>

      <h2 className='mb-3 mt-10 text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Active assignments</h2>
      <TechJobsClient jobs={jobs} />
    </div>
  );
}
