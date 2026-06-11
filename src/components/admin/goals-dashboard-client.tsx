'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  archiveAdminGoalAction,
  completeAdminGoalAction,
  deleteAdminGoalAction,
  saveAdminGoalAction,
} from '@/app/(dashboard)/admin/goals/goals-actions';
import { GlassCard, PremiumBadge, SectionEyebrow } from '@/components/ui/premium';
import { Target, Calendar, User, CheckCircle2, Archive, Trash2, Edit3, Plus } from 'lucide-react';

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
      className='rounded-3xl border border-gold/20 bg-zinc-950/40 p-6 shadow-xl backdrop-blur-sm space-y-4'
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
      <SectionEyebrow>{initial ? 'Edit Goal' : 'New Goal Target'}</SectionEyebrow>
      {initial ? <input type='hidden' name='id' value={initial.id} /> : null}
      
      <div className='grid gap-4 sm:grid-cols-2'>
        <label className="block text-xs text-zinc-400 sm:col-span-2">
          Goal Title
          <input 
            name='title' 
            defaultValue={initial?.title} 
            placeholder="e.g. June Revenue Target" 
            className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition font-bold' 
            required 
          />
        </label>
        
        <label className="block text-xs text-zinc-400">
          Metric Type
          <select name='goalType' defaultValue={type} className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition'>
            {GOAL_TYPES.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        
        <label className="block text-xs text-zinc-400">
          Target Value
          <input
            name='targetValue'
            type='number'
            step={preset.money ? '0.01' : '1'}
            placeholder={preset.money ? 'Target in dollars ($)' : 'Target count'}
            defaultValue={targetDisplay}
            className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition font-mono'
            required
          />
        </label>
        
        <input name='unit' type='hidden' value={preset.unit} />
        
        <label className="block text-xs text-zinc-400">
          Period End Date
          <input 
            name='periodEnd' 
            type='date' 
            defaultValue={initial?.period_end?.slice(0, 10) ?? ''} 
            className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-2 text-xs text-white focus:border-gold/50 outline-none transition' 
          />
        </label>
        
        <label className="block text-xs text-zinc-400">
          Assign to Technician
          <select name='technicianId' defaultValue={initial?.technician_id ?? ''} className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3.5 py-2.5 text-xs text-white focus:border-gold/50 outline-none transition'>
            <option value=''>All Technicians</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {err ? <p className='text-xs text-rose-400 font-bold'>{err}</p> : null}
      
      <div className="flex justify-end pt-2">
        <button type='submit' disabled={pending} className='rounded-xl bg-gold px-6 py-3 text-xs font-black uppercase tracking-widest text-black shadow-md hover:brightness-110 disabled:opacity-50 transition duration-200'>
          {pending ? 'Saving…' : initial ? 'Update Goal' : 'Create Goal'}
        </button>
      </div>
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
    <div className='space-y-8'>
      {/* GOAL CREATOR COLLAPSIBLE */}
      <GlassCard className="p-0 overflow-hidden border-white/10">
        <div className="px-6 py-5 border-b border-white/5 bg-zinc-950/20">
          <SectionEyebrow>Goal Configurator</SectionEyebrow>
          <p className="text-xs text-zinc-500 mt-1">Configure targets for revenue, jobs, or technicians below.</p>
        </div>
        <div className="p-6">
          <GoalForm technicians={technicians} onDone={refresh} />
        </div>
      </GlassCard>

      {editId ? (
        <GlassCard className="border-gold/30 bg-gold/5 space-y-4">
          <div className="flex justify-between items-center">
            <SectionEyebrow>Modify Goal Target</SectionEyebrow>
            <button type="button" onClick={() => setEditId(null)} className="text-xs font-bold uppercase text-zinc-400 hover:text-white transition">Cancel</button>
          </div>
          <GoalForm
            initial={goals.find((g) => g.id === editId)}
            technicians={technicians}
            onDone={() => {
              setEditId(null);
              refresh();
            }}
          />
        </GlassCard>
      ) : null}

      {/* GOALS GRID */}
      <div>
        <SectionEyebrow className="mb-4">Active & Synced Targets</SectionEyebrow>
        <div className='grid gap-6 lg:grid-cols-2'>
          {goals.length === 0 ? (
            <GlassCard className='text-center py-12 border border-dashed border-white/10 bg-black/20 lg:col-span-2'>
              <p className='text-xs text-zinc-500 italic'>No goals currently set. Create one above to track progress.</p>
            </GlassCard>
          ) : (
            goals.map((g) => {
              const pct = g.target_value > 0 ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : 0;
              const auto = ['revenue_weekly', 'revenue_monthly', 'jobs_monthly', 'avg_ticket', 'profit_monthly'].includes(g.goal_type);
              const dashOffset = 283 - (283 * pct) / 100;
              
              return (
                <GlassCard key={g.id} className='hover:border-gold/30 transition duration-300 flex flex-col justify-between space-y-4'>
                  <div>
                    <div className='flex items-start justify-between gap-3'>
                      <div>
                        <h3 className='text-base font-black text-white uppercase tracking-tight'>{g.title}</h3>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[8px] font-mono text-zinc-400 uppercase">
                            {g.goal_type.replace(/_/g, ' ')}
                          </span>
                          <span className="rounded bg-white/5 border border-white/10 px-2 py-0.5 text-[8px] font-mono text-zinc-400 uppercase">
                            {auto ? 'Auto-tracked' : 'Manual'}
                          </span>
                        </div>
                      </div>
                      
                      <div className='flex items-center gap-3 shrink-0'>
                        <PremiumBadge tone={g.status === 'completed' ? 'emerald' : 'gold'}>
                          {g.status}
                        </PremiumBadge>
                        
                        <div className='relative h-14 w-14'>
                          <svg className='h-14 w-14 -rotate-90' viewBox='0 0 100 100' aria-hidden='true'>
                            <circle cx='50' cy='50' r='45' stroke='rgba(255,255,255,0.06)' strokeWidth='10' fill='none' />
                            <circle
                              cx='50'
                              cy='50'
                              r='45'
                              stroke='#f4d35e'
                              strokeWidth='10'
                              fill='none'
                              strokeLinecap='round'
                              strokeDasharray='283'
                              strokeDashoffset={dashOffset}
                              className="transition-all duration-500"
                            />
                          </svg>
                          <div className='absolute inset-0 flex items-center justify-center'>
                            <span className='font-mono text-xs font-black text-gold-soft'>{pct}%</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className='mt-4 space-y-2'>
                      <div className='h-2 overflow-hidden rounded-full bg-zinc-950 border border-white/5'>
                        <div className='h-full rounded-full bg-gradient-to-r from-gold via-gold-soft to-amber-400 shadow-[0_0_8px_rgba(212,175,55,0.4)] transition-all duration-500' style={{ width: `${pct}%` }} />
                      </div>
                      <div className='flex justify-between text-[10px] text-zinc-500 font-bold uppercase'>
                        <span>Current: <strong className="text-white font-mono">{displayValue(g.unit, g.current_value)}</strong></span>
                        <span>Target: <strong className="text-gold-soft font-mono">{displayValue(g.unit, g.target_value)}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className='border-t border-white/5 pt-3.5 flex flex-wrap items-center justify-between gap-3 text-xs'>
                    {g.period_end ? (
                      <span className='text-[10px] text-zinc-500 flex items-center gap-1'>
                        <Calendar className="h-3 w-3" /> Due {g.period_end.slice(0, 10)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">No deadline</span>
                    )}

                    <div className='flex items-center gap-3 font-black uppercase text-[10px] tracking-wider'>
                      <button type='button' onClick={() => setEditId(g.id)} className='text-gold hover:underline flex items-center gap-1'>
                        <Edit3 className="h-3 w-3" /> Edit
                      </button>
                      
                      {g.status !== 'completed' && (
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
                          className='text-emerald-400 hover:underline flex items-center gap-0.5'
                        >
                          <CheckCircle2 className="h-3 w-3" /> Complete
                        </button>
                      )}
                      
                      {g.status !== 'archived' && (
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
                          className='text-amber-200 hover:underline flex items-center gap-0.5'
                        >
                          <Archive className="h-3 w-3" /> Archive
                        </button>
                      )}
                      
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
                        className='text-rose-300 hover:underline flex items-center gap-0.5'
                      >
                        <Trash2 className="h-3 w-3" /> Delete
                      </button>
                    </div>
                  </div>
                </GlassCard>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
