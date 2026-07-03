'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { currentValueForGoalType, loadAdminGoalsMetrics, loadTechnicianGoalsMetrics } from '@/lib/admin-goals-metrics';
import {
  awardGoalCompletionToTeam,
  type GoalLike,
} from '@/lib/goals-achievements';

function isSuperAdmin(role: string | null | undefined) {
  return role === 'super_admin';
}

function str(v: FormDataEntryValue | null) {
  return v == null ? '' : String(v).trim();
}

const MONEY_GOALS = new Set(['revenue_weekly', 'revenue_monthly', 'profit_monthly', 'avg_ticket']);

function parseTarget(goalType: string, raw: string): { target: number; unit: string } {
  const n = Number(raw || '0');
  if (MONEY_GOALS.has(goalType)) {
    return { target: Math.round(n * 100), unit: 'cents' };
  }
  return { target: Math.round(n), unit: 'count' };
}

export async function saveAdminGoalAction(formData: FormData): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role ?? null)) {
    return { error: 'Unauthorized' };
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database not configured' };

  const id = str(formData.get('id'));
  const title = str(formData.get('title')) || 'Goal';
  const goalType = str(formData.get('goalType')) || 'revenue_monthly';
  const { target: targetValue, unit } = parseTarget(goalType, str(formData.get('targetValue')));
  const periodEnd = str(formData.get('periodEnd')) || null;
  const technicianId = str(formData.get('technicianId')) || null;

  const metrics = await loadAdminGoalsMetrics(admin);
  let currentValue = currentValueForGoalType(goalType, metrics);
  if (technicianId) {
    const techMetrics = await loadTechnicianGoalsMetrics(admin, technicianId);
    currentValue = currentValueForGoalType(goalType, metrics, techMetrics);
  }
  const row = {
    title,
    goal_type: goalType,
    target_value: targetValue,
    current_value: currentValue,
    unit,
    period_end: periodEnd,
    technician_id: technicianId || null,
    status: 'active',
    updated_at: new Date().toISOString(),
  };

  const q = id ? admin.from('admin_goals').update(row).eq('id', id) : admin.from('admin_goals').insert(row);
  const { error } = await q;
  if (error) return { error: error.message };

  revalidatePath('/admin/goals');
  return { ok: true };
}

export async function completeAdminGoalAction(formData: FormData): Promise<{ error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role ?? null)) return { error: 'Unauthorized' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database' };
  const id = str(formData.get('id'));
  if (!id) return { error: 'Missing id' };
  const { data: goalRow } = await admin.from('admin_goals').select('*').eq('id', id).maybeSingle();
  await admin
    .from('admin_goals')
    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (goalRow) {
    await awardGoalCompletionToTeam(admin, goalRow as GoalLike);
  }
  revalidatePath('/admin/goals');
  revalidatePath('/tech');
  return {};
}

export async function markAchievementsSeenAction(ids: string[]): Promise<{ error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user) return { error: 'Unauthorized' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database' };
  const { markAchievementsSeen } = await import('@/lib/goals-achievements');
  await markAchievementsSeen(admin, session.user.id, ids);
  revalidatePath('/admin/goals');
  revalidatePath('/tech');
  return {};
}

export async function archiveAdminGoalAction(formData: FormData): Promise<{ error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role ?? null)) return { error: 'Unauthorized' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database' };
  const id = str(formData.get('id'));
  if (!id) return { error: 'Missing id' };
  await admin.from('admin_goals').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/admin/goals');
  return {};
}

export async function deleteAdminGoalAction(formData: FormData): Promise<{ error?: string }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role ?? null)) return { error: 'Unauthorized' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database' };
  const id = str(formData.get('id'));
  if (!id) return { error: 'Missing id' };
  await admin.from('admin_goals').delete().eq('id', id);
  revalidatePath('/admin/goals');
  return {};
}

function endOfMonthIso() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}

/** One-click starter pack so the team can measure progress immediately. */
export async function seedStarterGoalsAction(): Promise<{ error?: string; ok?: boolean; created?: number }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role ?? null)) {
    return { error: 'Only super admin can launch starter goals' };
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database not configured' };

  const { count } = await admin.from('admin_goals').select('id', { count: 'exact', head: true }).neq('status', 'archived');
  if ((count ?? 0) > 0) return { error: 'Goals already exist — edit or archive them first' };

  const metrics = await loadAdminGoalsMetrics(admin);
  const periodEnd = endOfMonthIso();
  const starters = [
    { title: 'Monthly revenue target', goal_type: 'revenue_monthly', target_value: 1500000, unit: 'cents' },
    { title: 'Jobs completed this month', goal_type: 'jobs_monthly', target_value: 40, unit: 'count' },
    { title: 'Average ticket', goal_type: 'avg_ticket', target_value: 27500, unit: 'cents' },
    { title: 'New Google reviews', goal_type: 'reviews', target_value: 8, unit: 'count' },
    { title: 'Referral bookings', goal_type: 'referrals', target_value: 5, unit: 'count' },
  ];

  const rows = starters.map((s) => ({
    ...s,
    current_value: currentValueForGoalType(s.goal_type, metrics),
    period_end: periodEnd,
    technician_id: null,
    status: 'active',
    updated_at: new Date().toISOString(),
  }));

  const { error } = await admin.from('admin_goals').insert(rows);
  if (error) return { error: error.message };

  const { data: techs } = await admin.from('profiles').select('id').eq('role', 'technician').limit(20);
  const techGoalRows = (techs ?? []).map((t) => {
    const techId = String((t as { id: string }).id);
    return {
      title: 'My jobs this month',
      goal_type: 'technician_jobs',
      target_value: 12,
      current_value: 0,
      unit: 'count',
      period_end: periodEnd,
      technician_id: techId,
      status: 'active',
      updated_at: new Date().toISOString(),
    };
  });
  if (techGoalRows.length > 0) {
    await admin.from('admin_goals').insert(techGoalRows);
  }

  revalidatePath('/admin/goals');
  revalidatePath('/admin');
  revalidatePath('/admin/setup-center');
  revalidatePath('/tech');
  return { ok: true, created: rows.length + techGoalRows.length };
}
