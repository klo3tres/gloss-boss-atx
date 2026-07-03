import type { SupabaseClient } from '@supabase/supabase-js';

type AdminDb = SupabaseClient;

export type StaffAchievement = {
  id: string;
  profile_id: string;
  achievement_key: string;
  title: string;
  description: string | null;
  tier: string | null;
  goal_id: string | null;
  source_id: string;
  earned_at: string;
  seen_at: string | null;
  profile_name?: string;
};

export type GoalLike = {
  id: string;
  title: string;
  goal_type: string;
  target_value: number;
  current_value: number;
  unit: string;
  status: string;
  technician_id?: string | null;
};

const MILESTONE_THRESHOLDS = [
  { pct: 25, tier: 'bronze', label: 'Bronze push' },
  { pct: 50, tier: 'silver', label: 'Halfway hero' },
  { pct: 75, tier: 'gold', label: 'Gold grind' },
  { pct: 100, tier: 'elite', label: 'Target crushed' },
] as const;

export function goalProgressPct(goal: Pick<GoalLike, 'target_value' | 'current_value'>) {
  const target = Number(goal.target_value ?? 0);
  if (target <= 0) return 0;
  return Math.min(100, Math.round((Number(goal.current_value ?? 0) / target) * 100));
}

export function averageGoalsProgress(goals: GoalLike[]) {
  const active = goals.filter((g) => g.status === 'active');
  if (active.length === 0) return 0;
  return Math.round(active.reduce((sum, g) => sum + goalProgressPct(g), 0) / active.length);
}

export function isoWeekSourceId(d = new Date()) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function awardAchievement(
  admin: AdminDb,
  input: {
    profileId: string;
    achievementKey: string;
    title: string;
    description?: string;
    tier?: string;
    goalId?: string | null;
    sourceId?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<boolean> {
  const sourceId = input.sourceId ?? '';
  const { error } = await admin.from('staff_achievements').insert({
    profile_id: input.profileId,
    achievement_key: input.achievementKey,
    title: input.title,
    description: input.description ?? null,
    tier: input.tier ?? null,
    goal_id: input.goalId ?? null,
    source_id: sourceId,
    metadata: input.metadata ?? {},
  });
  if (error && /duplicate|unique/i.test(error.message)) return false;
  return !error;
}

export async function processTeamGoalAchievements(admin: AdminDb, goals: GoalLike[]): Promise<void> {
  const { data: staff } = await admin.from('profiles').select('id').in('role', ['technician', 'admin', 'super_admin']).limit(50);
  const ids = (staff ?? []).map((s) => String((s as { id: string }).id));
  for (const profileId of ids) {
    await processGoalProgressAchievements(admin, goals, profileId);
  }
}

export async function awardGoalCompletionToTeam(admin: AdminDb, goal: GoalLike): Promise<void> {
  const { data: staff } = await admin.from('profiles').select('id').in('role', ['technician', 'admin', 'super_admin']).limit(50);
  for (const row of staff ?? []) {
    await awardGoalCompletion(admin, goal, String((row as { id: string }).id));
  }
}

export async function awardGoalCompletion(
  admin: AdminDb,
  goal: GoalLike,
  profileId: string,
): Promise<void> {
  await awardAchievement(admin, {
    profileId,
    achievementKey: 'goal_completed',
    sourceId: goal.id,
    goalId: goal.id,
    title: `🏆 ${goal.title}`,
    description: 'Goal marked complete — team win logged.',
    tier: 'trophy',
    metadata: { goal_type: goal.goal_type },
  });
}

export async function processGoalProgressAchievements(
  admin: AdminDb,
  goals: GoalLike[],
  profileId: string,
): Promise<void> {
  for (const goal of goals) {
    if (goal.status !== 'active') continue;
    const pct = goalProgressPct(goal);
    for (const m of MILESTONE_THRESHOLDS) {
      if (pct < m.pct) continue;
      await awardAchievement(admin, {
        profileId,
        achievementKey: `goal_progress_${m.pct}`,
        sourceId: goal.id,
        goalId: goal.id,
        title: `${m.label}: ${goal.title}`,
        description: `Hit ${m.pct}% on a live team target.`,
        tier: m.tier,
        metadata: { progress_pct: pct },
      });
    }
  }
}

export async function processWeeklyRevenueMilestones(
  admin: AdminDb,
  profileId: string,
  weekPct: number,
  goalLabel: string,
): Promise<void> {
  const weekId = isoWeekSourceId();
  for (const m of MILESTONE_THRESHOLDS) {
    if (weekPct < m.pct) continue;
    await awardAchievement(admin, {
      profileId,
      achievementKey: `weekly_revenue_${m.pct}`,
      sourceId: weekId,
      title: `${m.label} — ${goalLabel}`,
      description: `Weekly revenue hit ${m.pct}% of target.`,
      tier: m.tier,
      metadata: { week_pct: weekPct },
    });
  }
}

export async function loadAchievementsForProfile(admin: AdminDb, profileId: string, limit = 24): Promise<StaffAchievement[]> {
  const { data } = await admin
    .from('staff_achievements')
    .select('id, profile_id, achievement_key, title, description, tier, goal_id, source_id, earned_at, seen_at')
    .eq('profile_id', profileId)
    .order('earned_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as StaffAchievement[];
}

export async function loadRecentTeamAchievements(admin: AdminDb, limit = 12): Promise<StaffAchievement[]> {
  const { data } = await admin
    .from('staff_achievements')
    .select('id, profile_id, achievement_key, title, description, tier, goal_id, source_id, earned_at, seen_at')
    .order('earned_at', { ascending: false })
    .limit(limit);
  const rows = (data ?? []) as StaffAchievement[];
  if (rows.length === 0) return rows;
  const ids = [...new Set(rows.map((r) => r.profile_id))];
  const { data: profiles } = await admin.from('profiles').select('id, full_name, email').in('id', ids);
  const nameById = new Map(
    (profiles ?? []).map((p) => {
      const row = p as { id: string; full_name?: string; email?: string };
      return [row.id, row.full_name?.trim() || row.email || 'Team member'] as const;
    }),
  );
  return rows.map((r) => ({ ...r, profile_name: nameById.get(r.profile_id) }));
}

export async function markAchievementsSeen(admin: AdminDb, profileId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  await admin
    .from('staff_achievements')
    .update({ seen_at: now })
    .eq('profile_id', profileId)
    .in('id', ids)
    .is('seen_at', null);
}

export async function countUnseenAchievements(admin: AdminDb, profileId: string): Promise<number> {
  const { count } = await admin
    .from('staff_achievements')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .is('seen_at', null);
  return count ?? 0;
}
