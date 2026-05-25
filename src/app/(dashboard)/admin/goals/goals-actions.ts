'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getSessionWithProfile } from '@/lib/auth/session';
import type { AppRole } from '@/lib/auth/roles';

function isSuperAdmin(role: string | null | undefined) {
  return role === 'super_admin';
}
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { currentValueForGoalType, loadAdminGoalsMetrics } from '@/lib/admin-goals-metrics';

function str(v: FormDataEntryValue | null) {
  return v == null ? '' : String(v).trim();
}

export async function saveAdminGoalAction(formData: FormData) {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role ?? null)) {
    redirect('/admin/goals?err=Unauthorized');
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) redirect('/admin/goals?err=Database%20not%20configured');

  const id = str(formData.get('id'));
  const title = str(formData.get('title')) || 'Goal';
  const goalType = str(formData.get('goalType')) || 'revenue_monthly';
  const targetValue = Number(str(formData.get('targetValue')) || '0');
  const unit = str(formData.get('unit')) || 'cents';
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

  if (id) {
    await admin.from('admin_goals').update(row).eq('id', id);
  } else {
    await admin.from('admin_goals').insert(row);
  }

  revalidatePath('/admin/goals');
  redirect('/admin/goals?saved=1');
}

export async function completeAdminGoalAction(formData: FormData) {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role ?? null)) redirect('/admin/goals?err=Unauthorized');
  const admin = tryCreateAdminSupabase();
  if (!admin) redirect('/admin/goals?err=Database');
  const id = str(formData.get('id'));
  if (!id) redirect('/admin/goals?err=Missing%20id');
  await admin
    .from('admin_goals')
    .update({ status: 'completed', completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  revalidatePath('/admin/goals');
  redirect('/admin/goals?saved=1');
}
