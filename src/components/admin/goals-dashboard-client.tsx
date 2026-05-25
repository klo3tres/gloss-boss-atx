'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  archiveAdminGoalAction,
  completeAdminGoalAction,
  deleteAdminGoalAction,
  saveAdminGoalAction,
} from '@/app/(dashboard)/admin/goals/goals-actions';

export type GoalRow = {
  id: string;
  title: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  unit: string;
  status: string;
  period_end: string | null;
  technician_id: string | null;
  tracking_mode?: string;
};

const GOAL_TYPES: Array<{ value: string; label: string; unit: string; money: boolean }> = [
  { value: 'revenue_weekly', label: 'Weekly revenue', unit: 'cents', money: true },
  { value: 'revenue_monthly', label: 'Monthly revenue', unit: 'cents', money: true },
  { value: 'profit_monthly', label: 'Monthly profit', unit: 'cents', money: true },
  { value: 'jobs_monthly', label: 'Job count', unit: 'count', money: false },
  { value: 'avg_ticket', label: 'Average ticket', unit: 'cents', money: true },
  { value: 'reviews', label: 'Google reviews', unit: 'count', money: false },
  { value: 'referrals', label: 'Referrals', unit: 'count', money: false },
  { value: 'technician_jobs', label: 'Technician jobs', unit: 'count', money: false },
];

function displayValue(unit: string, n: number) {
  if (unit === 'cents') return `$${(n / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return String(n);
}

function GoalForm({
  initial,
  technicians,
  onDone,
}: {
  initial?: GoalRow;
  technicians: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const type = initial?.goal_type ?? 'revenue_monthly';
  const preset = GOAL_TYPES.find((g) => g.value === type) ?? GOAL_TYPES[1]!;
  const targetDisplay =
    initial && preset.money ? (initial.target_value / 100).toString() : initial ? String(initial.target_value) : '';

  return (
    <form
      className='gb-glass rounded-3xl border border-gold/20 p-5'
      onSubmit={(e) => {
        e.preventDefault();
        setErr(null);
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const res = await saveAdminGoalAction(fd);
          if (res?.error) {
            setErr(res.error);
            return;
          }
          onDone();
        });
      }}
    >
      <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>{initial ? 'Edit goal' : 'New goal'}</p>
      {initial ? <input type='hidden' name='id' value={initial.id} /> : null}
      <div className='mt-4 grid gap-3 sm:grid-cols-2'>
        <input name='title' defaultValue={initial?.title} placeholder='Goal title' className='gb-input sm:col-span-2' required />
        <select name='goalType' defaultValue={type} className='gb-input'>
          {GOAL_TYPES.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </select>
        <input
          name='targetValue'
          type='number'
          step={preset.money ? '0.01' : '1'}
          placeholder={preset.money ? 'Target in dollars' : 'Target count'}
          defaultValue={targetDisplay}
          className='gb-input'
          required
        />
        <input name='unit' type='hidden' value={preset.unit} />
        <input name='periodEnd' type='date' defaultValue={initial?.period_end?.slice(0, 10) ?? ''} className='gb-input' />
        <select name='technicianId' defaultValue={initial?.technician_id ?? ''} className='gb-input'>
          <option value=''>All technicians</option>
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {err ? <p className='mt-3 text-sm text-red-300'>{err}</p> : null}
      <button type='submit' disabled={pending} className='mt-4 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black disabled:opacity-50'>
        {pending ? 'Saving…' : initial ? 'Update goal' : 'Create goal'}
      </button>
    </form>
  );
}

export function GoalsDashboardClient({
  goals,
  technicians,
}: {
  goals: GoalRow[];
  technicians: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [editId, setEditId] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = () => router.refresh();

  return (
    <div className='space-y-6'>
      <GoalForm technicians={technicians} onDone={refresh} />
      {editId ? (
        <GoalForm
          initial={goals.find((g) => g.id === editId)}
          technicians={technicians}
          onDone={() => {
            setEditId(null);
            refresh();
          }}
        />
      ) : null}
      <div className='space-y-4'>
        {goals.length === 0 ? (
          <p className='text-sm text-zinc-500'>No goals yet. Create one above or apply migration 000057_goals_dashboard.sql.</p>
        ) : (
          goals.map((g) => {
            const pct = g.target_value > 0 ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : 0;
            const auto = ['revenue_weekly', 'revenue_monthly', 'jobs_monthly', 'avg_ticket', 'profit_monthly'].includes(g.goal_type);
            return (
              <article key={g.id} className='gb-premium-card rounded-2xl border border-gold/20 p-5'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div>
                    <p className='text-lg font-black text-white'>{g.title}</p>
                    <p className='text-xs uppercase tracking-widest text-zinc-500'>
                      {g.goal_type.replace(/_/g, ' ')} · {auto ? 'Auto-tracked' : 'Manual'}
                    </p>
                  </div>
                  <span className='rounded-full border border-gold/30 px-3 py-1 text-xs font-bold uppercase text-gold-soft'>{g.status}</span>
                </div>
                <div className='mt-4 h-2.5 overflow-hidden rounded-full bg-zinc-800'>
                  <div className='h-full rounded-full bg-gradient-to-r from-gold/80 to-gold' style={{ width: `${pct}%` }} />
                </div>
                <p className='mt-2 text-sm text-zinc-300'>
                  {displayValue(g.unit, g.current_value)} / {displayValue(g.unit, g.target_value)} ({pct}%)
                </p>
                {g.period_end ? <p className='text-xs text-zinc-500'>Due {g.period_end.slice(0, 10)}</p> : null}
                <div className='mt-4 flex flex-wrap gap-2'>
                  <button type='button' onClick={() => setEditId(g.id)} className='text-xs font-bold uppercase text-gold-soft underline'>
                    Edit
                  </button>
                  {g.status !== 'completed' ? (
                    <button
                      type='button'
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const fd = new FormData();
                          fd.set('id', g.id);
                          await completeAdminGoalAction(fd);
                          refresh();
                        })
                      }
                      className='text-xs font-bold uppercase text-emerald-300'
                    >
                      Complete
                    </button>
                  ) : null}
                  <button
                    type='button'
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        const fd = new FormData();
                        fd.set('id', g.id);
                        await archiveAdminGoalAction(fd);
                        refresh();
                      })
                    }
                    className='text-xs font-bold uppercase text-amber-200'
                  >
                    Archive
                  </button>
                  <button
                    type='button'
                    disabled={pending}
                    onClick={() => {
                      if (!confirm('Delete this goal permanently?')) return;
                      start(async () => {
                        const fd = new FormData();
                        fd.set('id', g.id);
                        await deleteAdminGoalAction(fd);
                        refresh();
                      });
                    }}
                    className='text-xs font-bold uppercase text-red-300'
                  >
                    Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}
