'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { currentValueForGoalType, loadAdminGoalsMetrics } from '@/lib/admin-goals-metrics';

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
  const row = {
    title,
    goal_type: goalType,
    target_value: targetValue,
    current_value: currentValueForGoalType(goalType, metrics),
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
  await admin
    .from('admin_goals')
    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/admin/goals');
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
