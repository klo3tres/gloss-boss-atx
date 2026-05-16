'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  assignAppointmentTechnicianAction,
  unassignAppointmentTechnicianAction,
  updateAppointmentDispatchStatusAction,
} from '@/app/(dashboard)/admin/dispatch-job-actions';

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

const COLS: { id: ColId; label: string; hint: string }[] = [
  { id: 'unassigned', label: 'Unassigned', hint: 'Needs technician' },
  { id: 'assigned', label: 'Assigned', hint: 'Tech locked in' },
  { id: 'in_progress', label: 'In progress', hint: 'On the job' },
  { id: 'completed', label: 'Completed', hint: 'Wrapped / cancelled' },
];

const STATUS_OPTIONS = ['deposit_paid', 'confirmed', 'assigned', 'in_progress', 'completed', 'cancelled'] as const;

export function DispatchBoardClient({
  jobs,
  technicians,
  fallbacks = [],
}: {
  jobs: DispatchJobRow[];
  technicians: TechOption[];
  fallbacks?: DispatchFallbackRow[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  const techLabel = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of technicians) {
      m[t.id] = t.full_name?.trim() || t.email?.trim() || t.id.slice(0, 8);
    }
    return m;
  }, [technicians]);

  const grouped = useMemo(() => {
    const g: Record<ColId, DispatchJobRow[]> = { unassigned: [], assigned: [], in_progress: [], completed: [] };
    for (const j of jobs) {
      g[dispatchColumn(j)].push(j);
    }
    return g;
  }, [jobs]);

  const techOptions = useMemo(
    () => [...technicians].sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '')),
    [technicians],
  );

  return (
    <div className='space-y-4'>
      {msg ? (
        <p className='rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100' role='status'>
          {msg}
        </p>
      ) : null}

      <div className='-mx-2 overflow-x-auto pb-2'>
        <div className='flex min-w-[1080px] gap-4 px-2 lg:min-w-0 lg:grid lg:grid-cols-4'>
        {COLS.map((col) => (
          <section key={col.id} className='min-w-[260px] flex-1 rounded-2xl border border-white/10 bg-zinc-950/80 shadow-[0_0_24px_rgba(0,0,0,0.35)] lg:min-w-0'>
            <header className='border-b border-white/10 px-4 py-3'>
              <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>{col.label}</p>
              <p className='text-[10px] text-zinc-500'>{col.hint}</p>
              <p className='mt-1 text-[10px] text-zinc-600'>
                {col.id === 'unassigned' ? grouped[col.id].length + fallbacks.length : grouped[col.id].length} jobs
              </p>
            </header>
            <ul className='max-h-[75vh] space-y-3 overflow-y-auto p-3'>
              {col.id === 'unassigned' && fallbacks.length > 0
                ? fallbacks.map((f) => (
                    <li
                      key={`fb-${f.id}`}
                      className='rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-xs text-amber-50 shadow-[0_0_18px_rgba(245,158,11,0.12)]'
                    >
                      <p className='text-[10px] font-black uppercase tracking-wider text-amber-200'>Fallback · {f.status}</p>
                      <p className='mt-2 font-bold text-white'>{f.guest_name ?? 'Guest'}</p>
                      <p className='mt-1 text-zinc-300'>{f.guest_email ?? '—'}</p>
                      <p className='mt-1'>{f.guest_phone ?? '—'}</p>
                      <p className='mt-2 text-gold-soft/90'>
                        {f.scheduled_start ? new Date(f.scheduled_start).toLocaleString() : 'Schedule TBD'}
                      </p>
                      <p className='mt-1'>
                        <span className='text-zinc-500'>Value: </span>
                        {formatMoney(f.base_price_cents)}
                      </p>
                      <p className='mt-2 font-mono text-[10px] text-zinc-500'>id {f.id.slice(0, 8)}…</p>
                      <Link
                        href='/admin'
                        className='mt-2 inline-block text-[10px] font-bold uppercase text-amber-200 underline'
                      >
                        Review in operations →
                      </Link>
                    </li>
                  ))
                : null}
              {grouped[col.id].map((j) => (
                <li
                  key={j.id}
                  className='rounded-xl border border-white/10 bg-black/50 p-4 text-xs text-zinc-300 shadow-[0_0_20px_rgba(212,166,77,0.06)] transition hover:border-gold/30 hover:shadow-[0_0_28px_rgba(212,166,77,0.12)]'
                >
                  <p className='font-bold text-white'>{j.guest_name ?? 'Guest'}</p>
                  <p className='mt-1 text-[10px] uppercase tracking-wider text-zinc-500'>{j.service_slug.replace(/-/g, ' ')}</p>
                  <p className='mt-2 text-zinc-400'>{j.vehicle_description ?? 'Vehicle TBD'}</p>
                  <p className='mt-2 text-zinc-400'>
                    {j.guest_phone ? <a href={`tel:${j.guest_phone}`}>{j.guest_phone}</a> : '—'}
                  </p>
                  <p className='mt-1 break-words text-zinc-500'>
                    {j.service_address?.trim() ? j.service_address : j.notes?.trim() ? `Notes: ${j.notes}` : '—'}
                  </p>
                  <p className='mt-2 text-gold-soft'>{new Date(j.scheduled_start).toLocaleString()}</p>
                  <p className='mt-1'>
                    <span className='text-zinc-500'>Value: </span>
                    {formatMoney(j.base_price_cents)}
                  </p>
                  <p className='mt-1 text-[10px] text-zinc-500'>
                    Tech: {j.assigned_technician_id ? techLabel[j.assigned_technician_id] ?? j.assigned_technician_id.slice(0, 8) : '—'}
                  </p>
                  {j.status === 'cancelled' ? (
                    <p className='mt-2 text-[10px] font-bold uppercase text-rose-300'>Cancelled</p>
                  ) : null}

                  <form
                    className='mt-3 flex flex-wrap items-end gap-2 border-t border-white/5 pt-3'
                    action={async (fd) => {
                      setMsg(null);
                      const res = await assignAppointmentTechnicianAction(fd);
                      setMsg(res.ok ? 'Assigned.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <input type='hidden' name='appointmentId' value={j.id} />
                    <label className='text-[10px] text-zinc-500'>
                      Assign
                      <select
                        name='technicianId'
                        className='ml-1 max-w-[12rem] rounded border border-zinc-700 bg-black px-2 py-1 text-white'
                        defaultValue={j.assigned_technician_id ?? ''}
                      >
                        <option value='' disabled>
                          Tech…
                        </option>
                        {techOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.full_name ?? t.email ?? t.id.slice(0, 6)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type='submit' className='rounded border border-gold/40 px-2 py-1 text-[10px] font-bold uppercase text-gold-soft'>
                      Save
                    </button>
                  </form>

                  <form
                    className='mt-2'
                    action={async (fd) => {
                      setMsg(null);
                      const res = await unassignAppointmentTechnicianAction(fd);
                      setMsg(res.ok ? 'Unassigned.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <input type='hidden' name='appointmentId' value={j.id} />
                    <button type='submit' className='text-[10px] font-bold uppercase text-amber-200 underline'>
                      Unassign tech
                    </button>
                  </form>

                  <form
                    className='mt-3 flex flex-wrap items-end gap-2'
                    action={async (fd) => {
                      setMsg(null);
                      const res = await updateAppointmentDispatchStatusAction(fd);
                      setMsg(res.ok ? 'Status updated.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <input type='hidden' name='appointmentId' value={j.id} />
                    <label className='text-[10px] text-zinc-500'>
                      Job status
                      <select
                        name='status'
                        defaultValue={j.status}
                        className='ml-1 rounded border border-zinc-700 bg-black px-2 py-1 text-white'
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type='submit' className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase'>
                      Apply
                    </button>
                  </form>
                </li>
              ))}
              {grouped[col.id].length === 0 && (col.id !== 'unassigned' || fallbacks.length === 0) ? (
                <li className='py-8 text-center text-zinc-600'>Empty</li>
              ) : null}
            </ul>
          </section>
        ))}
        </div>
      </div>
    </div>
  );
}
