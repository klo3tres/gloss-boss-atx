import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { GoalsDashboardClient, type GoalRow } from '@/components/admin/goals-dashboard-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import type { AppRole } from '@/lib/auth/roles';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadAdminGoalsMetrics, syncAdminGoalsCurrentValues } from '@/lib/admin-goals-metrics';
import {
  loadAchievementsForProfile,
  loadRecentTeamAchievements,
  processTeamGoalAchievements,
} from '@/lib/goals-achievements';

export const dynamic = 'force-dynamic';

function money(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export default async function AdminGoalsPage() {
  const session = await getSessionWithProfile();
  const role = session.profile?.role as AppRole | undefined;
  if (!isStaffRole(role)) {
    return (
      <DashboardShell title='Goals' subtitle='Staff access required.' role='admin'>
        <p className='text-sm text-zinc-400'>You need staff access to view goals.</p>
      </DashboardShell>
    );
  }
  const canEdit = role === 'super_admin';
  const shellRole = role === 'technician' ? 'technician' : 'admin';

  const admin = tryCreateAdminSupabase();
  let goals: GoalRow[] = [];
  let monthRevenueCents = 0;
  let monthJobs = 0;
  let avgTicketCents = 0;
  let technicians: Array<{ id: string; name: string }> = [];
  let myAchievements: Awaited<ReturnType<typeof loadAchievementsForProfile>> = [];
  let teamAchievements: Awaited<ReturnType<typeof loadRecentTeamAchievements>> = [];

  if (admin) {
    const metrics = await loadAdminGoalsMetrics(admin);
    monthRevenueCents = metrics.monthRevenueCents;
    monthJobs = metrics.monthJobs;
    avgTicketCents = metrics.avgTicketCents;
    await syncAdminGoalsCurrentValues(admin, metrics);
    const { data } = await admin
      .from('admin_goals')
      .select('*')
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(50);
    goals = (data ?? []).map((g) => {
      const row = g as Record<string, unknown>;
      return {
        id: String(row.id),
        title: String(row.title),
        goal_type: String(row.goal_type),
        target_value: Number(row.target_value ?? 0),
        current_value: Number(row.current_value ?? 0),
        unit: String(row.unit ?? 'cents'),
        status: String(row.status ?? 'active'),
        period_end: row.period_end != null ? String(row.period_end) : null,
        technician_id: row.technician_id != null ? String(row.technician_id) : null,
      };
    });
    await processTeamGoalAchievements(admin, goals);
    if (session.user?.id) {
      myAchievements = await loadAchievementsForProfile(admin, session.user.id, 16);
      teamAchievements = await loadRecentTeamAchievements(admin, 10);
    }
    const { data: techs } = await admin.from('profiles').select('id, full_name, email').eq('role', 'technician').limit(50);
    technicians =
      techs?.map((t) => {
        const r = t as { id: string; full_name?: string; email?: string };
        return { id: r.id, name: r.full_name?.trim() || r.email || 'Technician' };
      }) ?? [];
  }

  return (
    <DashboardShell title='Goals dashboard' subtitle='Revenue, jobs, reviews, and technician targets with live progress.' role={shellRole}>
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
          <p className='mt-2 text-2xl font-black text-white'>{avgTicketCents > 0 ? money(avgTicketCents) : '—'}</p>
        </div>
      </section>

      <GoalsDashboardClient
        goals={goals}
        technicians={technicians}
        canEdit={canEdit}
        profileId={session.user?.id}
        myAchievements={myAchievements}
        teamAchievements={teamAchievements}
      />

      <Link href='/admin' className='mt-6 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Admin
      </Link>
    </DashboardShell>
  );
}
