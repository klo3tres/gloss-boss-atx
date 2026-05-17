'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, admin };
}

export async function archiveAppointmentWorkOrderAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const confirm = String(formData.get('confirm') ?? '').trim();
  if (!id || confirm !== 'ARCHIVE') return { ok: false, error: 'Type ARCHIVE to confirm.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from('appointments')
    .update({ archived: true, archived_at: now, updated_at: now })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  return { ok: true };
}

export async function deleteAppointmentWorkOrderAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const confirm = String(formData.get('confirm') ?? '').trim();
  if (!id || confirm !== 'DELETE') return { ok: false, error: 'Type DELETE to confirm.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from('appointments')
    .update({ archived: true, archived_at: now, deleted_at: now, status: 'deleted', updated_at: now })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/work-orders');
  revalidatePath('/admin/dispatch');
  return { ok: true };
}

export async function clearStaleActiveTestRecordsAction(formData: FormData) {
  const confirm = String(formData.get('confirm') ?? '').trim();
  if (confirm !== 'CLEAR') return { ok: false, error: 'Type CLEAR to confirm.' };
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const staleBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  await gate.admin
    .from('tech_job_timers')
    .update({ ended_at: now, running: false, status: 'cleared_test' })
    .is('ended_at', null)
    .lt('created_at', staleBefore);

  await gate.admin
    .from('tech_workflow_sessions')
    .update({ status: 'archived', archived_at: now, updated_at: now })
    .in('status', ['active', 'in_progress'])
    .lt('created_at', staleBefore);

  await gate.admin
    .from('booking_fallbacks')
    .update({ archived: true, archived_at: now, status: 'archived', updated_at: now })
    .or('guest_email.ilike.%test%,guest_name.ilike.%test%,guest_phone.ilike.%555%')
    .in('status', ['pending', 'active', 'in_progress']);

  revalidatePath('/admin/work-orders');
  revalidatePath('/tech');
  return { ok: true };
}
