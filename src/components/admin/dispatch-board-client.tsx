'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { GripVertical, Search, Trash2 } from 'lucide-react';
import {
  assignAppointmentTechnicianAction,
  unassignAppointmentTechnicianAction,
  updateAppointmentDispatchStatusAction,
} from '@/app/(dashboard)/admin/dispatch-job-actions';
import { bulkWorkOrderAction } from '@/app/(dashboard)/admin/work-orders/work-order-actions';
import {
  archiveBookingFallbackAction,
  clearExpiredFallbacksAction,
  deleteBookingFallbackAction,
  reviewBookingFallbackAction,
} from '@/app/(dashboard)/admin/booking-fallback-actions';
import { GlassCard, PremiumBadge, SectionEyebrow } from '@/components/ui/premium';

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
};

export type TechOption = { id: string; full_name: string | null; email: string | null };

type ColId = 'unassigned' | 'assigned' | 'in_progress' | 'completed';
type BoardFilter = 'active' | 'today' | 'upcoming' | 'fallback' | 'completed' | 'all';

function dispatchColumn(j: DispatchJobRow): ColId {
  if (j.status === 'cancelled') return 'completed';
  if (j.job_completed_at || j.status === 'completed') return 'completed';
  if (j.job_started_at || j.status === 'in_progress') return 'in_progress';
  if (j.assigned_technician_id) return 'assigned';
  return 'unassigned';
}

function formatMoney(cents: number | null) {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

function chicago(value: string | null) {
  if (!value) return 'Schedule TBD';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

const COLS: { id: ColId; label: string; hint: string }[] = [
  { id: 'unassigned', label: 'Unassigned', hint: 'Needs tech' },
  { id: 'assigned', label: 'Assigned', hint: 'Scheduled' },
  { id: 'in_progress', label: 'In progress', hint: 'On site' },
  { id: 'completed', label: 'Completed', hint: 'Done' },
];

const FILTER_TABS: { id: BoardFilter; label: string }[] = [
  { id: 'active', label: 'Active' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'fallback', label: 'Fallbacks' },
  { id: 'completed', label: 'Completed' },
  { id: 'all', label: 'All' },
];

const STATUS_BY_COL: Record<ColId, string> = {
  unassigned: 'confirmed',
  assigned: 'assigned',
  in_progress: 'in_progress',
  completed: 'completed',
};

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
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<BoardFilter>('active');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropCol, setDropCol] = useState<ColId | null>(null);
  const [mobileCol, setMobileCol] = useState<ColId>('unassigned');

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
        if (col !== 'completed') return false;
      } else if (filter === 'active') {
        if (col === 'completed') return false;
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
    const g: Record<ColId, DispatchJobRow[]> = { unassigned: [], assigned: [], in_progress: [], completed: [] };
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
      if (col === 'unassigned') {
        const r = await unassignAppointmentTechnicianAction(
          (() => {
            const fd = new FormData();
            fd.set('appointmentId', jobId);
            return fd;
          })(),
        );
        setMsg(r.ok ? 'Moved to unassigned.' : r.error ?? 'Failed');
        router.refresh();
        return;
      }
      if (col === 'assigned' && !job.assigned_technician_id && techOptions[0]) {
        const fd = new FormData();
        fd.set('appointmentId', jobId);
        fd.set('technicianId', techOptions[0].id);
        const r = await assignAppointmentTechnicianAction(fd);
        setMsg(r.ok ? 'Assigned to first available tech.' : r.error ?? 'Assign a technician on the card.');
        router.refresh();
        return;
      }
      const fd = new FormData();
      fd.set('appointmentId', jobId);
      fd.set('status', STATUS_BY_COL[col]);
      const r = await updateAppointmentDispatchStatusAction(fd);
      setMsg(r.ok ? `Moved to ${col.replace(/_/g, ' ')}.` : r.error ?? 'Failed');
      router.refresh();
    },
    [router, techOptions],
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

  const renderCard = (j: DispatchJobRow) => (
    <motion.li
      layout
      key={j.id}
      draggable
      onDragStart={() => setDragJobId(j.id)}
      onDragEnd={() => {
        setDragJobId(null);
        setDropCol(null);
      }}
      className={`gb-glass cursor-grab rounded-2xl border p-4 active:cursor-grabbing ${
        selected.has(j.id) ? 'border-gold/50 ring-1 ring-gold/30' : 'border-white/10'
      } ${dragJobId === j.id ? 'opacity-60' : ''}`}
    >
      <div className='flex items-start gap-2'>
        <GripVertical className='mt-0.5 h-4 w-4 shrink-0 text-zinc-600' />
        <div className='min-w-0 flex-1'>
          <div className='flex items-start justify-between gap-2'>
            <p className='truncate font-bold text-white'>{j.guest_name ?? 'Guest'}</p>
            <input type='checkbox' checked={selected.has(j.id)} onChange={() => toggleSelect(j.id)} className='rounded border-gold/40' />
          </div>
          <p className='mt-1 text-[10px] font-bold uppercase tracking-wider text-gold-soft/90'>{j.service_slug.replace(/-/g, ' ')}</p>
          <p className='mt-2 line-clamp-2 text-xs text-zinc-400'>{j.vehicle_description ?? 'Vehicle TBD'}</p>
          <p className='mt-2 text-xs text-gold-soft'>{chicago(j.scheduled_start)}</p>
          <p className='mt-1 text-xs text-zinc-500'>{formatMoney(j.base_price_cents)} · {techLabel[j.assigned_technician_id ?? ''] ?? 'No tech'}</p>
          {jobNotes[j.id] ? <p className='mt-2 line-clamp-2 rounded-lg bg-black/40 px-2 py-1 text-[10px] text-zinc-400'>{jobNotes[j.id]}</p> : null}
          <Link href={`/admin/work-orders/${j.id}`} className='mt-3 inline-block text-[10px] font-bold uppercase text-gold-soft underline'>
            Open work order
          </Link>
        </div>
      </div>
      <form
        className='mt-3 flex flex-wrap items-end gap-2 border-t border-white/10 pt-3'
        onSubmit={async (e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setMsg(null);
          const res = await assignAppointmentTechnicianAction(fd);
          setMsg(res.ok ? 'Assigned.' : res.error ?? 'Failed');
          router.refresh();
        }}
      >
        <input type='hidden' name='appointmentId' value={j.id} />
        <select name='technicianId' defaultValue={j.assigned_technician_id ?? ''} className='gb-input max-w-[10rem] text-xs'>
          <option value='' disabled>
            Tech…
          </option>
          {techOptions.map((t) => (
            <option key={t.id} value={t.id}>
              {t.full_name ?? t.email}
            </option>
          ))}
        </select>
        <button type='submit' className='rounded-lg bg-gold/20 px-2 py-1 text-[10px] font-black uppercase text-gold-soft'>
          Assign
        </button>
      </form>
    </motion.li>
  );

  const KanbanColumn = ({ col, className }: { col: (typeof COLS)[0]; className?: string }) => (
    <section
      className={`gb-kanban-col flex min-h-[320px] flex-col rounded-3xl border border-white/10 bg-zinc-950/60 shadow-[0_0_32px_rgba(0,0,0,0.35)] ${dropCol === col.id ? 'gb-drop-target' : ''} ${className ?? ''}`}
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
      <header className='border-b border-white/10 px-5 py-4'>
        <SectionEyebrow>{col.label}</SectionEyebrow>
        <p className='text-xs text-zinc-500'>{col.hint}</p>
        <PremiumBadge tone='zinc'>{grouped[col.id].length}</PremiumBadge>
      </header>
      <ul className='flex-1 space-y-3 overflow-y-auto p-4' style={{ maxHeight: 'min(72vh, 720px)' }}>
        {grouped[col.id].map(renderCard)}
        {grouped[col.id].length === 0 ? <li className='py-12 text-center text-sm text-zinc-600'>Drop jobs here</li> : null}
      </ul>
    </section>
  );

  return (
    <div className='space-y-6'>
      {msg ? (
        <p className='rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100' role='status'>
          {msg}
        </p>
      ) : null}

      <GlassCard className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div className='relative flex-1'>
          <Search className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500' />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='Search customer, phone, vehicle, address…'
            className='gb-input pl-10'
          />
        </div>
        <div className='flex flex-wrap gap-2'>
          {FILTER_TABS.map((t) => (
            <button
              key={t.id}
              type='button'
              onClick={() => setFilter(t.id)}
              className={`rounded-full border px-4 py-2 text-[10px] font-black uppercase tracking-wider transition ${
                filter === t.id ? 'border-gold/60 bg-gold/15 text-gold-soft' : 'border-white/10 text-zinc-400 hover:border-gold/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </GlassCard>

      {selected.size > 0 ? (
        <GlassCard className='flex flex-wrap items-center gap-3'>
          <p className='text-sm font-bold text-white'>{selected.size} selected</p>
          <form
            action={async (fd) => {
              setMsg(null);
              const r = await bulkWorkOrderAction(fd);
              setMsg(r.ok ? 'Archived selected.' : r.error ?? 'Bulk failed');
              setSelected(new Set());
              router.refresh();
            }}
          >
            <input type='hidden' name='bulkAction' value='archive' />
            {Array.from(selected).map((id) => (
              <input key={id} type='hidden' name='ids' value={id} />
            ))}
            <button type='submit' className='rounded-xl border border-amber-500/40 px-4 py-2 text-xs font-black uppercase text-amber-200'>
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
            <input type='hidden' name='bulkAction' value='delete' />
            {Array.from(selected).map((id) => (
              <input key={id} type='hidden' name='ids' value={id} />
            ))}
            <button type='submit' className='inline-flex items-center gap-1 rounded-xl border border-red-500/40 px-4 py-2 text-xs font-black uppercase text-red-200'>
              <Trash2 className='h-3.5 w-3.5' /> Bulk delete
            </button>
          </form>
        </GlassCard>
      ) : null}

      {showFallbackStrip && fallbacks.length > 0 ? (
        <GlassCard>
          <SectionEyebrow>Fallback queue</SectionEyebrow>
          <p className='mt-1 text-sm text-zinc-500'>{fallbacks.length} pending — swipe horizontally on mobile</p>
          <div className='mt-4 flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory'>
            {fallbacks.map((f) => (
              <div key={f.id} className='gb-glass min-w-[min(100%,300px)] shrink-0 snap-start rounded-2xl border border-amber-500/30 p-4'>
                <p className='font-bold text-white'>{f.guest_name ?? 'Guest'}</p>
                <p className='text-xs text-zinc-400'>{chicago(f.scheduled_start)}</p>
                <div className='mt-3 flex flex-wrap gap-2'>
                  <form action={async (fd) => { await reviewBookingFallbackAction(fd); router.refresh(); }}>
                    <input type='hidden' name='id' value={f.id} />
                    <button type='submit' className='text-[10px] font-bold uppercase text-zinc-300'>Reviewed</button>
                  </form>
                  <form action={async (fd) => { await archiveBookingFallbackAction(fd); router.refresh(); }}>
                    <input type='hidden' name='id' value={f.id} />
                    <button type='submit' className='text-[10px] font-bold uppercase text-zinc-300'>Archive</button>
                  </form>
                  <form action={async (fd) => { if (!window.confirm('Delete fallback?')) return; await deleteBookingFallbackAction(fd); router.refresh(); }}>
                    <input type='hidden' name='id' value={f.id} />
                    <button type='submit' className='text-[10px] font-bold uppercase text-red-300'>Delete</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <form action={async () => { await clearExpiredFallbacksAction(); router.refresh(); }} className='mt-3'>
            <button type='submit' className='text-[10px] font-bold uppercase text-amber-200'>Clear expired fallbacks</button>
          </form>
        </GlassCard>
      ) : null}

      <div className='lg:hidden'>
        <div className='mb-3 flex gap-2 overflow-x-auto'>
          {COLS.map((c) => (
            <button
              key={c.id}
              type='button'
              onClick={() => setMobileCol(c.id)}
              className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black uppercase ${mobileCol === c.id ? 'bg-gold text-black' : 'border border-white/15 text-zinc-400'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <KanbanColumn col={COLS.find((c) => c.id === mobileCol) ?? COLS[0]} />
      </div>

      <div className='hidden gap-5 lg:grid lg:grid-cols-4'>
        {COLS.map((col) => (
          <KanbanColumn key={col.id} col={col} />
        ))}
      </div>
    </div>
  );
}
