import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import type { AppRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadAdminGoalsMetrics, syncAdminGoalsCurrentValues } from '@/lib/admin-goals-metrics';
import { completeAdminGoalAction, saveAdminGoalAction } from './goals-actions';

export const dynamic = 'force-dynamic';

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default async function AdminGoalsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = searchParams ? await searchParams : {};
  const session = await getSessionWithProfile();
  if ((session.profile?.role as AppRole | undefined) !== 'super_admin') {
    return (
      <DashboardShell title='Goals' subtitle='Super admin only.' role='admin'>
        <p className='text-sm text-zinc-400'>You need super admin access to manage goals.</p>
      </DashboardShell>
    );
  }

  const admin = tryCreateAdminSupabase();
  let goals: Array<Record<string, unknown>> = [];
  let monthRevenueCents = 0;
  let monthJobs = 0;
  let avgTicketCents = 0;

  if (admin) {
    const metrics = await loadAdminGoalsMetrics(admin);
    monthRevenueCents = metrics.monthRevenueCents;
    monthJobs = metrics.monthJobs;
    avgTicketCents = metrics.avgTicketCents;
    await syncAdminGoalsCurrentValues(admin, metrics);
    const { data } = await admin.from('admin_goals').select('*').order('created_at', { ascending: false }).limit(50);
    goals = (data ?? []) as Array<Record<string, unknown>>;
  }

  const presets = [
    { type: 'revenue_monthly', label: 'Monthly revenue', target: monthRevenueCents * 1.2, unit: 'cents' },
    { type: 'jobs_monthly', label: 'Monthly jobs', target: Math.max(monthJobs + 5, 10), unit: 'count' },
    { type: 'avg_ticket', label: 'Average ticket', target: avgTicketCents > 0 ? Math.round(avgTicketCents * 1.1) : 25000, unit: 'cents' },
    { type: 'reviews', label: 'Google reviews', target: 10, unit: 'count' },
  ];

  return (
    <DashboardShell title='Goals dashboard' subtitle='Track revenue, jobs, reviews, and technician targets.' role='admin'>
      {sp.saved === '1' ? (
        <p className='mb-4 rounded-lg border border-emerald-500/35 bg-emerald-500/10 p-3 text-sm text-emerald-100'>Goal saved.</p>
      ) : null}
      <section className='gb-glass mb-6 grid gap-4 rounded-3xl border border-gold/25 p-5 sm:grid-cols-3'>
        <div>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>MTD revenue</p>
          <p className='mt-2 text-2xl font-black text-white'>{money(monthRevenueCents)}</p>
        </div>
        <div>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Completed jobs</p>
          <p className='mt-2 text-2xl font-black text-white'>{monthJobs}</p>
        </div>
        <div>
          <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>Avg ticket</p>
          <p className='mt-2 text-2xl font-black text-white'>
            {avgTicketCents > 0 ? money(avgTicketCents) : '—'}
          </p>
        </div>
      </section>

      <form action={saveAdminGoalAction} className='gb-glass mb-8 rounded-3xl border border-gold/20 p-5'>
        <p className='text-xs font-black uppercase tracking-widest text-gold-soft'>New goal</p>
        <div className='mt-4 grid gap-3 sm:grid-cols-2'>
          <input name='title' placeholder='Goal title' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white sm:col-span-2' required />
          <select name='goalType' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' defaultValue='revenue_monthly'>
            {presets.map((p) => (
              <option key={p.type} value={p.type}>
                {p.label}
              </option>
            ))}
          </select>
          <input name='targetValue' type='number' placeholder='Target (cents or count)' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' required />
          <input name='unit' defaultValue='cents' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='periodEnd' type='date' className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
        </div>
        <button type='submit' className='mt-4 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>
          Save goal
        </button>
      </form>

      <div className='space-y-4'>
        {goals.length === 0 ? (
          <p className='text-sm text-zinc-500'>No goals yet. Apply migration 000057_goals_dashboard.sql in Supabase if the table is missing.</p>
        ) : (
          goals.map((g) => {
            const target = Number(g.target_value ?? 0);
            const current = Number(g.current_value ?? 0);
            const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
            const status = String(g.status ?? 'active');
            return (
              <article key={String(g.id)} className='gb-glass rounded-2xl border border-gold/20 p-5'>
                <div className='flex flex-wrap items-start justify-between gap-3'>
                  <div>
                    <p className='text-lg font-black text-white'>{String(g.title)}</p>
                    <p className='text-xs uppercase tracking-widest text-zinc-500'>{String(g.goal_type)}</p>
                  </div>
                  <span className='rounded-full border border-gold/30 px-3 py-1 text-xs font-bold uppercase text-gold-soft'>{status}</span>
                </div>
                <div className='mt-4 h-2 overflow-hidden rounded-full bg-zinc-800'>
                  <div className='h-full rounded-full bg-gradient-to-r from-gold/80 to-gold' style={{ width: `${pct}%` }} />
                </div>
                <p className='mt-2 text-sm text-zinc-400'>
                  {current} / {target} {String(g.unit)} ({pct}%)
                </p>
                {status !== 'completed' ? (
                  <form action={completeAdminGoalAction} className='mt-3'>
                    <input type='hidden' name='id' value={String(g.id)} />
                    <button type='submit' className='text-xs font-bold uppercase text-emerald-300 hover:text-emerald-200'>
                      Mark complete
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })
        )}
      </div>

      <Link href='/admin' className='mt-6 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Admin
      </Link>
    </DashboardShell>
  );
}
