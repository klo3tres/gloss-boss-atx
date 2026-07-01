'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useGoogleCalendarAutoSync } from '@/hooks/use-google-calendar-auto-sync';
import { motion } from 'framer-motion';
import { GripVertical, Search, Trash2, Clock, MapPin, ExternalLink, Compass } from 'lucide-react';
import {
  assignAppointmentTechnicianAction,
  unassignAppointmentTechnicianAction,
  updateAppointmentDispatchStatusAction,
} from '@/app/(dashboard)/admin/dispatch-job-actions';
import { bulkWorkOrderAction } from '@/app/(dashboard)/admin/work-orders/work-order-actions';
import { workOrderPath } from '@/lib/work-order-links';
import {
  archiveBookingFallbackAction,
  clearExpiredFallbacksAction,
  deleteBookingFallbackAction,
  reviewBookingFallbackAction,
} from '@/app/(dashboard)/admin/booking-fallback-actions';
import { GlassCard, PremiumBadge, SectionEyebrow } from '@/components/ui/premium';
import { adminRescheduleAppointmentActionState } from '@/app/(dashboard)/admin/appointment-lifecycle-actions';

export type DispatchFallbackRow = {
  id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  scheduled_start: string | null;
  base_price_cents: number | null;
  deposit_amount_cents: number | null;
  status: string;
  created_at: string;
};

export type DispatchJobRow = {
  id: string;
  guest_name: string | null;
  guest_phone: string | null;
  guest_email: string | null;
  vehicle_description: string | null;
  service_slug: string;
  scheduled_start: string;
  base_price_cents: number | null;
  assigned_technician_id: string | null;
  status: string;
  service_address: string | null;
  notes: string | null;
  job_started_at: string | null;
  job_completed_at: string | null;
  payment_status?: string | null;
};

export type TechOption = { id: string; full_name: string | null; email: string | null };

type ColId = 'today' | 'tomorrow' | 'upcoming';
type BoardFilter = 'active' | 'today' | 'upcoming' | 'fallback' | 'completed' | 'all';

function dispatchColumn(j: DispatchJobRow): ColId {
  const t = new Date(j.scheduled_start);
  const now = new Date();
  
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const dayAfterTomorrow = new Date(tomorrow);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

  const time = t.getTime();
  if (time < tomorrow.getTime()) {
    return 'today';
  } else if (time < dayAfterTomorrow.getTime()) {
    return 'tomorrow';
  } else {
    return 'upcoming';
  }
}

function formatMoney(cents: number | null) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function chicago(value: string | null) {
  if (!value) return 'Schedule TBD';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return 'Schedule TBD';
  }
}

const COLS: { id: ColId; label: string; hint: string }[] = [
  { id: 'today', label: 'Today', hint: "Today's scheduled jobs" },
  { id: 'tomorrow', label: 'Tomorrow', hint: "Tomorrow's scheduled jobs" },
  { id: 'upcoming', label: 'Upcoming', hint: 'Upcoming scheduled jobs' },
];

const FILTER_TABS: { id: BoardFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'fallback', label: 'Fallbacks' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

export function DispatchBoardClient({
  jobs,
  technicians,
  fallbacks = [],
  jobNotes = {},
}: {
  jobs: DispatchJobRow[];
  technicians: TechOption[];
  fallbacks?: DispatchFallbackRow[];
  jobNotes?: Record<string, string>;
}) {
  useGoogleCalendarAutoSync();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<BoardFilter>('active');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<ColId | null>(null);
  const [mobileCol, setMobileCol] = useState<ColId>('today');

  const techLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of technicians) m[t.id] = t.full_name?.trim() || t.email?.trim() || t.id.slice(0, 8);
    return m;
  }, [technicians]);

  const filteredJobs = useMemo(() => {
    const q = search.trim().toLowerCase();
    const now = new Date();
    const sod = new Date(now);
    sod.setHours(0, 0, 0, 0);
    const eod = new Date(sod);
    eod.setHours(23, 59, 59, 999);
    const horizon = new Date(now.getTime() + 30 * 86400000);
    return jobs.filter((j) => {
      const col = dispatchColumn(j);
      const t = new Date(j.scheduled_start).getTime();
      if (filter === 'all') {
        /* keep */
      } else if (filter === 'completed') {
        const isJobDone = j.job_completed_at || j.status === 'completed' || j.status === 'cancelled';
        if (!isJobDone) return false;
      } else if (filter === 'active') {
        const isJobDone = j.job_completed_at || j.status === 'completed' || j.status === 'cancelled';
        if (isJobDone) return false;
      } else if (filter === 'today') {
        if (t < sod.getTime() || t > eod.getTime()) return false;
      } else if (filter === 'upcoming') {
        if (t <= eod.getTime() || t > horizon.getTime()) return false;
      }
      if (!q) return true;
      const hay = [j.guest_name, j.guest_phone, j.guest_email, j.vehicle_description, j.service_address, j.service_slug]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [jobs, filter, search]);

  const grouped = useMemo(() => {
    const g: Record<ColId, DispatchJobRow[]> = { today: [], tomorrow: [], upcoming: [] };
    for (const j of filteredJobs) g[dispatchColumn(j)].push(j);
    return g;
  }, [filteredJobs]);

  const techOptions = useMemo(
    () => [...technicians].sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '')),
    [technicians],
  );

  const showFallbackStrip = filter === 'all' || filter === 'active' || filter === 'fallback' || filter === 'today';

  const moveToColumn = useCallback(
    async (jobId: string, col: ColId, job: DispatchJobRow) => {
      setMsg(null);
      const now = new Date();
      const targetDate = new Date(now);
      if (col === 'tomorrow') {
        targetDate.setDate(now.getDate() + 1);
      } else if (col === 'upcoming') {
        targetDate.setDate(now.getDate() + 3);
      }
      const dateStr = targetDate.toISOString().slice(0, 10);
      const timeStr = '09:00'; // Default morning slot
      
      const fd = new FormData();
      fd.set('appointmentId', jobId);
      fd.set('date', dateStr);
      fd.set('time', timeStr);
      fd.set('reason', `Rescheduled via Dispatch Board drag-and-drop to ${col}`);

      const res = await adminRescheduleAppointmentActionState(null, fd);
      if (res && res.error) {
        setMsg(`Failed to reschedule: ${res.error}`);
      } else {
        setMsg(`Rescheduled to ${col} (${dateStr} at ${timeStr}).`);
      }
      router.refresh();
    },
    [router],
  );

  const onDrop = (col: ColId) => {
    if (!dragJobId) return;
    const job = jobs.find((j) => j.id === dragJobId);
    if (!job) return;
    void moveToColumn(dragJobId, col, job);
    setDragJobId(null);
    setDropCol(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderCard = (j: DispatchJobRow) => {
    // Determine glowing status light
    const getStatusIndicator = () => {
      if (j.status === 'cancelled') return { color: 'bg-zinc-600', label: 'Cancelled' };
      if (j.job_completed_at || j.status === 'completed') return { color: 'bg-emerald-500', label: 'Completed' };
      if (j.job_started_at || j.status === 'in_progress') return { color: 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]', label: 'On Site' };
      if (j.assigned_technician_id) return { color: 'bg-amber-400 shadow-[0_0_8px_#fbbf24]', label: 'Assigned' };
      return { color: 'bg-zinc-500', label: 'Unassigned' };
    };
    
    const indicator = getStatusIndicator();

    return (
      <motion.li
        layout
        key={j.id}
        draggable
        onDragStart={() => setDragJobId(j.id)}
        onDragEnd={() => {
          setDragJobId(null);
          setDropCol(null);
        }}
        className={`gb-premium-card cursor-grab rounded-2xl border p-5 active:cursor-grabbing transition-all duration-300 hover:border-gold/30 ${
          selected.has(j.id) ? 'border-gold/60 bg-gold/5 shadow-[0_0_24px_rgba(212,175,55,0.08)]' : 'border-white/10 bg-black/50'
        } ${dragJobId === j.id ? 'opacity-40' : ''}`}
      >
        <div className="flex items-start gap-3">
          <GripVertical className="mt-1.5 h-4.5 w-4.5 shrink-0 text-zinc-600 hover:text-zinc-400" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="truncate font-bold text-white text-base">{j.guest_name ?? 'Guest'}</p>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`h-2 w-2 rounded-full ${indicator.color}`} />
                  <span className="text-[10px] uppercase font-black tracking-wider text-zinc-400">{indicator.label}</span>
                  {j.payment_status && (
                    <>
                      <span className="text-zinc-600">·</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                        j.payment_status === 'paid'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/20'
                          : j.payment_status === 'deposit_paid' || j.payment_status === 'deposit_only'
                            ? 'bg-amber-500/15 text-amber-300 border border-amber-500/20'
                            : 'bg-rose-500/15 text-rose-300 border border-rose-500/20'
                      }`}>
                        {j.payment_status.replace(/_/g, ' ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <input
                type="checkbox"
                checked={selected.has(j.id)}
                onChange={() => toggleSelect(j.id)}
                className="rounded border-gold/30 text-gold bg-black focus:ring-gold/30 mt-1 h-4 w-4"
              />
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-gold-soft">
              {j.service_slug.replace(/-/g, ' ')}
            </p>

            <p className="text-xs text-zinc-300 font-medium leading-relaxed">
              {j.vehicle_description ?? 'Vehicle details TBD'}
            </p>

            <div className="flex flex-col gap-1 pt-1 border-t border-white/5 text-xs">
              {/* ETA clock badge */}
              <div className="flex items-center gap-1.5 text-gold-soft font-semibold font-mono">
                <Clock className="h-3.5 w-3.5 shrink-0 text-gold" />
                <span>{chicago(j.scheduled_start)}</span>
              </div>

              {/* Price & Tech */}
              <div className="flex items-center gap-1 text-zinc-400 font-mono">
                <span>{formatMoney(j.base_price_cents)}</span>
                <span>·</span>
                <span className="truncate max-w-[120px] font-semibold text-zinc-300">
                  {techLabel[j.assigned_technician_id ?? ''] ?? 'Unassigned'}
                </span>
              </div>

              {/* View Route Link */}
              {j.service_address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.service_address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-zinc-400 hover:text-gold-soft transition group"
                >
                  <MapPin className="h-3.5 w-3.5 text-gold-soft group-hover:text-gold" />
                  <span className="truncate max-w-[200px] border-b border-dashed border-zinc-600 group-hover:border-gold-soft">
                    {j.service_address}
                  </span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              )}
            </div>

            {jobNotes[j.id] ? (
              <p className="mt-2 line-clamp-2 rounded-lg bg-zinc-950/80 px-2.5 py-1.5 text-[10px] text-zinc-400 font-sans border border-white/5 leading-relaxed">
                {jobNotes[j.id]}
              </p>
            ) : null}

            <div className="pt-2 flex items-center justify-between border-t border-white/5">
              <Link
                href={workOrderPath(j.id, { shell: 'admin' })}
                className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-gold-soft hover:underline tracking-wider"
              >
                <Compass className="h-3.5 w-3.5" /> Order Console →
              </Link>
            </div>
          </div>
        </div>

        <form
          className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/5 pt-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setMsg(null);
            const res = await assignAppointmentTechnicianAction(fd);
            setMsg(res.ok ? 'Assigned.' : res.error ?? 'Failed');
            router.refresh();
          }}
        >
          <input type="hidden" name="appointmentId" value={j.id} />
          <select
            name="technicianId"
            defaultValue={j.assigned_technician_id ?? ''}
            className="gb-input flex-1 text-xs py-1.5 px-2 border-zinc-800 bg-zinc-950"
          >
            <option value="" disabled>
              Tech…
            </option>
            {techOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.full_name ?? t.email}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-lg bg-gold/15 border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/25 transition duration-150"
          >
            Assign
          </button>
        </form>
      </motion.li>
    );
  };

  const KanbanColumn = ({ col, className }: { col: (typeof COLS)[0]; className?: string }) => (
    <section
      className={`gb-kanban-col flex min-h-[400px] flex-col rounded-3xl border border-gold/10 bg-zinc-950/40 shadow-xl backdrop-blur-md transition-all duration-300 ${
        dropCol === col.id ? 'border-gold bg-gold/5 shadow-[0_0_30px_rgba(212,175,55,0.06)]' : ''
      } ${className ?? ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDropCol(col.id);
      }}
      onDragLeave={() => setDropCol((c) => (c === col.id ? null : c))}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(col.id);
      }}
    >
      <header className="border-b border-white/5 px-6 py-4.5 flex items-center justify-between gap-2">
        <div>
          <SectionEyebrow>{col.label}</SectionEyebrow>
          <p className="text-[10px] text-zinc-500 font-semibold uppercase mt-0.5 tracking-wider">{col.hint}</p>
        </div>
        <span className="rounded-full bg-gold/10 border border-gold/30 px-2.5 py-0.5 text-[10px] font-black text-gold-soft">
          {grouped[col.id].length}
        </span>
      </header>
      <ul className="flex-1 space-y-4 overflow-y-auto p-5" style={{ maxHeight: 'min(78vh, 850px)' }}>
        {grouped[col.id].map(renderCard)}
        {grouped[col.id].length === 0 ? (
          <li className="py-20 text-center text-xs text-zinc-500 border border-dashed border-white/5 rounded-2xl italic">
            Drag jobs here to route
          </li>
        ) : null}
      </ul>
    </section>
  );

  const totalJobsCount = jobs.length;
  const assignedJobsCount = jobs.filter(j => j.assigned_technician_id).length;
  const assignmentRate = totalJobsCount > 0 ? Math.round((assignedJobsCount / totalJobsCount) * 100) : 0;
  
  const circ = 2 * Math.PI * 36;
  const strokeDashoffset = circ - (Math.min(100, Math.max(0, assignmentRate)) / 100) * circ;

  return (
    <div className="space-y-6">
      {msg ? (
        <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100 font-semibold" role="status">
          {msg}
        </p>
      ) : null}

      {/* DISPATCH HEALTH HERO BAR */}
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        
        {/* SVG Dial & Route Health */}
        <div className="rounded-3xl border border-gold/25 bg-black/65 p-6 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-[0_0_30px_rgba(212,175,55,0.06)] relative overflow-hidden group hover:border-gold/40 transition-all duration-300">
          <div className="absolute -top-12 -left-12 h-40 w-40 bg-gold/5 rounded-full blur-2xl pointer-events-none" />
          <div className="space-y-4 text-center sm:text-left min-w-0 flex-1">
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold-soft">Dispatch Cockpit</span>
            <div>
              <p className="text-zinc-400 text-xs">Route Assignment Rate</p>
              <h2 className="mt-1 font-mono text-4xl font-black text-white tracking-tight">
                {assignedJobsCount} / {totalJobsCount} Scheduled
              </h2>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed max-w-sm">
              We have assigned technicians to <strong className="text-white">{assignedJobsCount}</strong> out of <strong className="text-white">{totalJobsCount}</strong> active schedules.
            </p>
          </div>
          
          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full bg-zinc-950/60 border border-white/10 p-2 shadow-inner">
            <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 80 80">
              <circle cx="40" cy="40" r="36" className="text-white/5" strokeWidth="6" stroke="currentColor" fill="none" />
              <circle
                cx="40"
                cy="40"
                r="36"
                className="text-gold-soft transition-all duration-1000 ease-out"
                strokeWidth="6"
                strokeDasharray={circ}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-black text-white">{assignmentRate}%</span>
              <span className="text-[8px] font-black uppercase tracking-wider text-zinc-500">Route</span>
            </div>
          </div>
        </div>

        {/* Dynamic Summary Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-black/45 p-5 relative overflow-hidden group hover:border-gold/20 transition duration-300">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Unassigned Today</span>
            <p className="mt-2 font-mono text-3xl font-black text-amber-400">
              {jobs.filter(j => !j.assigned_technician_id && dispatchColumn(j) === 'today').length}
            </p>
            <p className="text-[9px] text-zinc-500 mt-1">Pending tech matches</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/45 p-5 relative overflow-hidden group hover:border-gold/20 transition duration-300">
            <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Total Techs</span>
            <p className="mt-2 font-mono text-3xl font-black text-emerald-400">{technicians.length}</p>
            <p className="text-[9px] text-zinc-500 mt-1">Active field routes</p>
          </div>
        </div>

      </div>

      <GlassCard className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone, vehicle, address…"
            className="gb-input pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFilter(t.id)}
              className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                filter === t.id
                  ? 'border-gold/60 bg-gold/15 text-gold-soft'
                  : 'border-white/10 text-zinc-400 hover:border-gold/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {selected.size > 0 ? (
        <GlassCard className="flex flex-wrap items-center gap-3">
          <p className="text-sm font-bold text-white">{selected.size} selected</p>
          <form
            action={async (fd) => {
              setMsg(null);
              const r = await bulkWorkOrderAction(fd);
              setMsg(r.ok ? 'Archived selected.' : r.error ?? 'Bulk failed');
              setSelected(new Set());
              router.refresh();
            }}
          >
            <input type="hidden" name="bulkAction" value="archive" />
            {Array.from(selected).map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <button type="submit" className="rounded-xl border border-amber-500/40 px-4 py-2 text-xs font-black uppercase text-amber-200">
              Bulk archive
            </button>
          </form>
          <form
            action={async (fd) => {
              if (!window.confirm(`Delete ${selected.size} work order(s)?`)) return;
              setMsg(null);
              const r = await bulkWorkOrderAction(fd);
              setMsg(r.ok ? 'Deleted selected.' : r.error ?? 'Bulk failed');
              setSelected(new Set());
              router.refresh();
            }}
          >
            <input type="hidden" name="bulkAction" value="delete" />
            {Array.from(selected).map((id) => (
              <input key={id} type="hidden" name="ids" value={id} />
            ))}
            <button type="submit" className="inline-flex items-center gap-1 rounded-xl border border-red-500/40 px-4 py-2 text-xs font-black uppercase text-red-200">
              <Trash2 className="h-3.5 w-3.5" /> Bulk delete
            </button>
          </form>
        </GlassCard>
      ) : null}

      {showFallbackStrip && fallbacks.length > 0 ? (
        <GlassCard>
          <SectionEyebrow>Fallback queue</SectionEyebrow>
          <p className="mt-1 text-sm text-zinc-500">{fallbacks.length} pending — swipe horizontally on mobile</p>
          <div className="mt-4 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory">
            {fallbacks.map((f) => (
              <div key={f.id} className="gb-glass min-w-[min(100%,300px)] shrink-0 snap-start rounded-2xl border border-amber-500/30 p-4">
                <p className="font-bold text-white">{f.guest_name ?? 'Guest'}</p>
                <p className="text-xs text-zinc-400">{chicago(f.scheduled_start)}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={async (fd) => { await reviewBookingFallbackAction(fd); router.refresh(); }}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="text-[10px] font-bold uppercase text-zinc-300">Reviewed</button>
                  </form>
                  <form action={async (fd) => { await archiveBookingFallbackAction(fd); router.refresh(); }}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="text-[10px] font-bold uppercase text-zinc-300">Archive</button>
                  </form>
                  <form action={async (fd) => { if (!window.confirm('Delete fallback?')) return; await deleteBookingFallbackAction(fd); router.refresh(); }}>
                    <input type="hidden" name="id" value={f.id} />
                    <button type="submit" className="text-[10px] font-bold uppercase text-red-300">Delete</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <form action={async () => { await clearExpiredFallbacksAction(); router.refresh(); }} className="mt-3">
            <button type="submit" className="text-[10px] font-bold uppercase text-amber-200">Clear expired fallbacks</button>
          </form>
        </GlassCard>
      ) : null}

      {/* Mobile grid (uses column picker tabs) */}
      <div className="lg:hidden">
        <div className="mb-3 flex gap-2 overflow-x-auto">
          {COLS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setMobileCol(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black uppercase ${
                mobileCol === c.id ? 'bg-gold text-black font-black' : 'border border-white/15 text-zinc-400'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <KanbanColumn col={COLS.find((c) => c.id === mobileCol) ?? COLS[0]} />
      </div>

      {/* Desktop 3-Column Grid */}
      <div className="hidden gap-6 lg:grid lg:grid-cols-3">
        {COLS.map((col) => (
          <KanbanColumn key={col.id} col={col} />
        ))}
      </div>
    </div>
  );
}
