'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  assignLeadTechnicianAction,
  convertLeadToCustomerAction,
  incrementLeadContactAttemptsAction,
  setLeadPoolAction,
  unassignLeadAction,
  updateLeadNotesAction,
  updateLeadStatusAction,
} from '@/app/(dashboard)/admin/dispatch-lead-actions';

export type LeadAdminRow = Record<string, unknown>;
export type TechOption = { id: string; full_name: string | null; email: string | null };
export type AssignmentEventRow = {
  id: string;
  action: string;
  technician_id: string | null;
  previous_technician_id: string | null;
  actor_id: string | null;
  created_at: string;
  note: string | null;
};

const STATUSES = ['new', 'assigned', 'claimed', 'contacted', 'quoted', 'booked', 'lost'] as const;

export function LeadsAdminClient({
  leads,
  technicians,
  eventsByLead,
}: {
  leads: LeadAdminRow[];
  technicians: TechOption[];
  eventsByLead: Record<string, AssignmentEventRow[]>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

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
      <ul className='space-y-4'>
        {leads.map((r) => {
          const id = String(r.id);
          const name = String(r.name ?? '');
          const assigned = r.assigned_technician_id != null ? String(r.assigned_technician_id) : '';
          const inPool = Boolean(r.in_pool);
          const evs = eventsByLead[id] ?? [];
          return (
            <li key={id} className='rounded-2xl border border-white/10 bg-zinc-950 p-4 text-sm'>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <p className='text-lg font-bold text-white'>{name}</p>
                  <p className='text-xs text-zinc-500'>
                    {String(r.status)} · attempts {String(r.contact_attempts ?? 0)} ·{' '}
                    {r.created_at ? new Date(String(r.created_at)).toLocaleString() : ''}
                  </p>
                  {r.email ? <p className='text-zinc-400'>{String(r.email)}</p> : null}
                  {r.phone ? <p className='text-zinc-400'>{String(r.phone)}</p> : null}
                  {r.vehicle ? <p className='text-xs text-zinc-500'>Vehicle: {String(r.vehicle)}</p> : null}
                  <p className='mt-2 text-xs text-zinc-500'>
                    Pool: {inPool ? 'open' : 'closed'} · Assigned tech: {assigned ? `${assigned.slice(0, 8)}…` : '—'}
                  </p>
                </div>
                <div className='flex flex-col gap-2'>
                  <form
                    className='flex flex-wrap items-end gap-2'
                    action={async (fd) => {
                      setMsg(null);
                      const res = await assignLeadTechnicianAction(fd);
                      setMsg(res.ok ? 'Assignment saved.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <input type='hidden' name='leadId' value={id} />
                    <label className='text-[10px] text-zinc-500'>
                      Assign to
                      <select name='technicianId' className='ml-1 rounded border border-zinc-700 bg-black px-2 py-1 text-white' defaultValue=''>
                        <option value='' disabled>
                          Select…
                        </option>
                        {techOptions.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.full_name ?? t.email ?? t.id.slice(0, 6)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type='submit' className='rounded border border-gold/40 px-3 py-1 text-[10px] font-bold uppercase text-gold-soft'>
                      Assign
                    </button>
                  </form>
                  <form
                    action={async () => {
                      setMsg(null);
                      const fd = new FormData();
                      fd.set('leadId', id);
                      const res = await unassignLeadAction(fd);
                      setMsg(res.ok ? 'Lead unassigned to pool.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <button type='submit' className='text-[10px] font-bold uppercase text-amber-200 underline'>
                      Unassign → pool
                    </button>
                  </form>
                  <div className='flex gap-2'>
                    <form
                      action={async () => {
                        const fd = new FormData();
                        fd.set('leadId', id);
                        fd.set('inPool', 'true');
                        const res = await setLeadPoolAction(fd);
                        setMsg(res.ok ? 'Marked in open pool.' : res.error ?? 'Failed');
                        router.refresh();
                      }}
                    >
                      <button type='submit' className='text-[10px] text-zinc-400 underline'>
                        Pool on
                      </button>
                    </form>
                    <form
                      action={async () => {
                        const fd = new FormData();
                        fd.set('leadId', id);
                        fd.set('inPool', 'false');
                        const res = await setLeadPoolAction(fd);
                        setMsg(res.ok ? 'Pool off.' : res.error ?? 'Failed');
                        router.refresh();
                      }}
                    >
                      <button type='submit' className='text-[10px] text-zinc-400 underline'>
                        Pool off
                      </button>
                    </form>
                  </div>
                  <form
                    action={async () => {
                      const fd = new FormData();
                      fd.set('leadId', id);
                      const res = await incrementLeadContactAttemptsAction(fd);
                      setMsg(res.ok ? 'Logged contact attempt.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <button type='submit' className='text-[10px] font-bold uppercase text-emerald-300 underline'>
                      + Contact attempt
                    </button>
                  </form>
                  <form
                    action={async () => {
                      const fd = new FormData();
                      fd.set('leadId', id);
                      const res = await convertLeadToCustomerAction(fd);
                      if (res.ok && 'customerId' in res && res.customerId) {
                        setMsg('Converted — opening customer record.');
                        router.push(`/admin/customers/${res.customerId}`);
                        return;
                      }
                      setMsg(res.ok ? 'Converted.' : (res as { error?: string }).error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <button type='submit' className='text-[10px] font-bold uppercase text-gold-soft underline'>
                      Convert to customer
                    </button>
                  </form>
                </div>
              </div>

              <form
                className='mt-3 grid gap-2 md:grid-cols-2'
                action={async (fd) => {
                  const res = await updateLeadStatusAction(fd);
                  setMsg(res.ok ? 'Status updated.' : res.error ?? 'Failed');
                  router.refresh();
                }}
              >
                <input type='hidden' name='leadId' value={id} />
                <label className='text-[10px] text-zinc-500'>
                  Status
                  <select name='status' defaultValue={String(r.status)} className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white'>
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <button type='submit' className='self-end rounded border border-white/20 px-3 py-1 text-[10px] font-bold uppercase'>
                  Save status
                </button>
              </form>

              <form
                className='mt-3'
                action={async (fd) => {
                  const res = await updateLeadNotesAction(fd);
                  setMsg(res.ok ? 'Notes saved.' : res.error ?? 'Failed');
                  router.refresh();
                }}
              >
                <input type='hidden' name='leadId' value={id} />
                <label className='text-[10px] text-zinc-500'>
                  Notes
                  <textarea
                    name='notes'
                    rows={2}
                    defaultValue={r.notes != null ? String(r.notes) : ''}
                    className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white'
                  />
                </label>
                <button type='submit' className='mt-1 text-[10px] font-bold uppercase text-zinc-400 underline'>
                  Save notes
                </button>
              </form>

              {evs.length > 0 ? (
                <details className='mt-3 text-xs text-zinc-500'>
                  <summary className='cursor-pointer text-[10px] font-bold uppercase tracking-wider text-zinc-400'>
                    Assignment history ({evs.length})
                  </summary>
                  <ul className='mt-2 space-y-1 border-t border-white/5 pt-2'>
                    {evs.map((e) => (
                      <li key={e.id} className='font-mono text-[10px]'>
                        {new Date(e.created_at).toLocaleString()} — {e.action}{' '}
                        {e.technician_id ? `→ ${e.technician_id.slice(0, 8)}…` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
