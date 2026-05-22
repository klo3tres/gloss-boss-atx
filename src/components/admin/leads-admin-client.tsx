'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  assignLeadTechnicianAction,
  archiveLeadAction,
  convertLeadToCustomerAction,
  createLeadAction,
  deleteLeadAction,
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

const STATUSES = ['new', 'assigned', 'claimed', 'contacted', 'quoted', 'booked', 'no_response', 'lost'] as const;

const PIPELINE_STAGES: { id: string; label: string; statuses: readonly string[] }[] = [
  { id: 'new', label: 'New', statuses: ['new', 'assigned', 'claimed'] },
  { id: 'contacted', label: 'Contacted', statuses: ['contacted'] },
  { id: 'quoted', label: 'Quoted', statuses: ['quoted'] },
  { id: 'booked', label: 'Booked', statuses: ['booked'] },
  { id: 'no_response', label: 'No response', statuses: ['no_response'] },
  { id: 'lost', label: 'Lost', statuses: ['lost'] },
];

function pipelineStageId(status: string): string {
  for (const s of PIPELINE_STAGES) {
    if (s.statuses.includes(status)) return s.id;
  }
  return 'new';
}

export function LeadsAdminClient({
  leads,
  technicians,
  eventsByLead,
  techById = {},
}: {
  leads: LeadAdminRow[];
  technicians: TechOption[];
  eventsByLead: Record<string, AssignmentEventRow[]>;
  techById?: Record<string, string>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [view, setView] = useState<'pipeline' | 'list'>('pipeline');

  const techOptions = useMemo(
    () => [...technicians].sort((a, b) => (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? '')),
    [technicians],
  );

  const pipelineGrouped = useMemo(() => {
    const m: Record<string, LeadAdminRow[]> = {};
    for (const s of PIPELINE_STAGES) m[s.id] = [];
    for (const r of leads) {
      const st = String(r.status ?? 'new');
      const col = pipelineStageId(st);
      m[col]?.push(r);
    }
    return m;
  }, [leads]);

  return (
    <div className='space-y-4'>
      {msg ? (
        <p className='rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-100' role='status'>
          {msg}
        </p>
      ) : null}

      <div className='flex flex-wrap items-center gap-2'>
        <button
          type='button'
          className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${view === 'pipeline' ? 'bg-gold/20 text-gold-soft' : 'bg-zinc-900 text-zinc-400'}`}
          onClick={() => setView('pipeline')}
        >
          Pipeline
        </button>
        <button
          type='button'
          className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${view === 'list' ? 'bg-gold/20 text-gold-soft' : 'bg-zinc-900 text-zinc-400'}`}
          onClick={() => setView('list')}
        >
          Detail list
        </button>
        <Link href='/admin/dispatch' className='text-[10px] font-bold uppercase text-zinc-400 underline'>
          Dispatch board →
        </Link>
      </div>

      <section className='rounded-2xl border border-white/10 bg-zinc-950/80 p-4'>
        <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>New lead</p>
        <form
          className='mt-3 grid gap-3 md:grid-cols-2'
          action={async (fd) => {
            setMsg(null);
            const res = await createLeadAction(fd);
            setMsg(res.ok ? 'Lead created.' : res.error ?? 'Failed');
            router.refresh();
          }}
        >
          <label className='text-[10px] text-zinc-500'>
            Name *
            <input name='name' required className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
          </label>
          <label className='text-[10px] text-zinc-500'>
            Phone
            <input name='phone' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
          </label>
          <label className='text-[10px] text-zinc-500'>
            Email
            <input name='email' type='email' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
          </label>
          <label className='text-[10px] text-zinc-500'>
            Address
            <input name='address' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
          </label>
          <label className='text-[10px] text-zinc-500 md:col-span-2'>
            Vehicle
            <input name='vehicle' className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
          </label>
          <label className='text-[10px] text-zinc-500 md:col-span-2'>
            Notes
            <textarea name='notes' rows={2} className='mt-1 w-full rounded border border-zinc-700 bg-black px-2 py-1 text-white' />
          </label>
          <label className='flex items-center gap-2 text-[10px] text-zinc-400 md:col-span-2'>
            <input type='checkbox' name='inPool' value='true' />
            Add to open pool (technicians can claim)
          </label>
          <button type='submit' className='md:col-span-2 rounded border border-gold/40 px-4 py-2 text-[10px] font-black uppercase text-gold-soft'>
            Create lead
          </button>
        </form>
      </section>

      {view === 'pipeline' ? (
        <div className='-mx-2 overflow-x-auto pb-2'>
          <div className='flex min-w-[1080px] gap-3 px-2 lg:min-w-0 lg:justify-between'>
            {PIPELINE_STAGES.map((stage) => (
              <section
                key={stage.id}
                className='flex w-[min(100%,300px)] shrink-0 flex-col rounded-2xl border border-white/10 bg-zinc-950/70 shadow-[0_0_20px_rgba(0,0,0,0.35)] lg:w-auto lg:min-w-0 lg:flex-1'
              >
              <header className='border-b border-white/10 px-3 py-2'>
                <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>{stage.label}</p>
                <p className='text-[10px] text-zinc-600'>{pipelineGrouped[stage.id]?.length ?? 0}</p>
              </header>
              <ul className='max-h-[68vh] space-y-2 overflow-y-auto p-2'>
                {(pipelineGrouped[stage.id] ?? []).map((r) => {
                  const id = String(r.id);
                  const st = String(r.status ?? '');
                  const tid = r.assigned_technician_id != null ? String(r.assigned_technician_id) : '';
                  const techLabel = tid ? techById[tid] ?? tid.slice(0, 8) : '';
                  return (
                    <li
                      key={id}
                      className='gb-glass rounded-2xl border border-white/10 p-4 text-sm text-zinc-300 transition hover:border-gold/30 hover:shadow-[0_0_20px_rgba(212,175,55,0.1)]'
                    >
                      <div className='flex items-start gap-3'>
                        <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold/30 to-gold/5 text-sm font-black text-gold-soft'>
                          {String(r.name ?? '?').slice(0, 2).toUpperCase()}
                        </div>
                        <div className='min-w-0 flex-1'>
                      <p className='font-bold text-white'>{String(r.name ?? '')}</p>
                      <span className='mt-1 inline-block rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-gold-soft'>
                        {st.replace(/_/g, ' ')}
                      </span>
                      {tid ? (
                        <p className='text-[9px] text-zinc-400'>
                          Tech: <span className='text-amber-100/90'>{techLabel}</span>
                        </p>
                      ) : (
                        <p className='text-[9px] text-zinc-600'>Unassigned · open pool if enabled</p>
                      )}
                      <p className='text-zinc-500'>Attempts {String(r.contact_attempts ?? 0)}</p>
                      {r.phone ? <p className='text-zinc-400'>{String(r.phone)}</p> : null}
                      {r.address ? <p className='line-clamp-2 text-[9px] text-zinc-500'>{String(r.address)}</p> : null}
                      {r.vehicle ? <p className='line-clamp-1 text-[9px] text-zinc-500'>Vehicle: {String(r.vehicle)}</p> : null}
                      {r.notes ? <p className='line-clamp-2 text-[9px] italic text-zinc-600'>{String(r.notes)}</p> : null}
                      <a
                        href={`#lead-${id}`}
                        onClick={() => setView('list')}
                        className='mt-1 inline-block text-[9px] font-bold uppercase text-gold-soft underline'
                      >
                        Open in list
                      </a>
                      <form
                        className='mt-2'
                        action={async (fd) => {
                          const res = await updateLeadStatusAction(fd);
                          setMsg(res.ok ? 'Moved in pipeline.' : res.error ?? 'Failed');
                          router.refresh();
                        }}
                      >
                        <input type='hidden' name='leadId' value={id} />
                        <label className='text-[9px] text-zinc-500'>
                          Move to
                          <select
                            name='status'
                            defaultValue={st}
                            className='mt-0.5 w-full rounded border border-zinc-700 bg-black px-1 py-1 text-white'
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {s.replace(/_/g, ' ')}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type='submit' className='mt-1 w-full rounded border border-white/15 py-1 text-[9px] font-bold uppercase'>
                          Apply
                        </button>
                      </form>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {(pipelineGrouped[stage.id] ?? []).length === 0 ? (
                  <li className='py-8 text-center text-[10px] text-zinc-600'>No leads in this stage.</li>
                ) : null}
              </ul>
            </section>
            ))}
          </div>
        </div>
      ) : null}

      <ul className={`space-y-6 ${view === 'list' ? '' : 'hidden'}`}>
        {leads.map((r) => {
          const id = String(r.id);
          const name = String(r.name ?? '');
          const assigned = r.assigned_technician_id != null ? String(r.assigned_technician_id) : '';
          const inPool = Boolean(r.in_pool);
          const evs = eventsByLead[id] ?? [];
          const status = String(r.status ?? 'new');
          const notesPreview = r.notes != null ? String(r.notes).trim() : '';
          return (
            <li key={id} id={`lead-${id}`} className='gb-glass scroll-mt-24 rounded-3xl border border-gold/20 p-6 text-sm shadow-[0_0_32px_rgba(0,0,0,0.35)]'>
              <div className='flex flex-wrap items-start justify-between gap-6'>
                <div className='flex min-w-0 flex-1 gap-4'>
                  <div className='flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/35 to-gold/5 text-lg font-black text-gold-soft'>
                    {name.slice(0, 2).toUpperCase() || '?'}
                  </div>
                  <div className='min-w-0 flex-1'>
                    <p className='text-xl font-black text-white'>{name}</p>
                    <div className='mt-2 flex flex-wrap gap-2'>
                      <span className='rounded-full border border-gold/35 bg-gold/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-gold-soft'>
                        {status.replace(/_/g, ' ')}
                      </span>
                      {inPool ? (
                        <span className='rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-cyan-200'>
                          Open pool
                        </span>
                      ) : null}
                      <span className='rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] text-zinc-400'>
                        {String(r.contact_attempts ?? 0)} contacts
                      </span>
                    </div>
                    {r.email ? <p className='mt-3 text-zinc-300'>{String(r.email)}</p> : null}
                    {r.phone ? <p className='text-zinc-400'>{String(r.phone)}</p> : null}
                    {r.vehicle ? <p className='mt-1 text-xs text-zinc-500'>Vehicle · {String(r.vehicle)}</p> : null}
                    {notesPreview ? (
                      <p className='mt-3 line-clamp-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-xs italic text-zinc-400'>
                        {notesPreview}
                      </p>
                    ) : null}
                    <p className='mt-2 text-[10px] text-zinc-600'>
                      Created {r.created_at ? new Date(String(r.created_at)).toLocaleString() : '—'} · Tech{' '}
                      {assigned ? techById[assigned] ?? assigned.slice(0, 8) : 'unassigned'}
                    </p>
                    {evs.length > 0 ? (
                      <div className='mt-4 border-t border-white/10 pt-4'>
                        <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Contact timeline</p>
                        <ul className='mt-2 space-y-2'>
                          {evs.slice(0, 4).map((e) => (
                            <li key={e.id} className='flex gap-3 text-xs text-zinc-400'>
                              <span className='mt-1 h-2 w-2 shrink-0 rounded-full bg-gold/60' aria-hidden />
                              <span>
                                <span className='text-zinc-300'>{new Date(e.created_at).toLocaleString()}</span> — {e.action}
                                {e.technician_id ? ` · ${techById[e.technician_id] ?? e.technician_id.slice(0, 8)}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className='flex shrink-0 flex-col gap-2 rounded-2xl border border-white/10 bg-black/30 p-3'>
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
                      <select
                        name='technicianId'
                        className='ml-1 rounded border border-zinc-700 bg-black px-2 py-1 text-white'
                        defaultValue={assigned || ''}
                      >
                        <option value='' disabled>
                          {assigned ? 'Reassign to…' : 'Select technician…'}
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
                  <form
                    action={async () => {
                      const fd = new FormData();
                      fd.set('leadId', id);
                      const res = await archiveLeadAction(fd);
                      setMsg(res.ok ? 'Lead archived.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <button type='submit' className='text-[10px] font-bold uppercase text-amber-200 underline'>
                      Archive
                    </button>
                  </form>
                  <form
                    className='flex gap-1'
                    action={async (fd) => {
                      fd.set('leadId', id);
                      const res = await deleteLeadAction(fd);
                      setMsg(res.ok ? 'Lead deleted.' : res.error ?? 'Failed');
                      router.refresh();
                    }}
                  >
                    <button type='submit' onClick={(e) => { if (!window.confirm('Delete this lead?')) e.preventDefault(); }} className='text-[10px] font-bold uppercase text-red-200 underline'>
                      Delete
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
                        {e.technician_id ? `→ ${techById[e.technician_id] ?? e.technician_id.slice(0, 8)}…` : ''}
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
