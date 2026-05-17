'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

async function requireAdminAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) {
    return { ok: false as const, error: 'Forbidden' };
  }
  return { ok: true as const, admin, userId: session.user.id };
}

export async function archiveBookingFallbackAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing id' };
  const gate = await requireAdminAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from('booking_fallbacks')
    .update({ archived_at: now, updated_at: now, status: 'archived' })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/dispatch');
  revalidatePath('/admin/booking-health');
  revalidatePath('/admin');
  return { ok: true };
}

export async function reviewBookingFallbackAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing id' };
  const gate = await requireAdminAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin.from('booking_fallbacks').update({ reviewed_at: now, updated_at: now }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/dispatch');
  revalidatePath('/admin/booking-health');
  return { ok: true };
}

export async function deleteBookingFallbackAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return { ok: false, error: 'Missing id' };
  const gate = await requireAdminAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const now = new Date().toISOString();
  const { error } = await gate.admin
    .from('booking_fallbacks')
    .update({ status: 'deleted', updated_at: now, archived_at: now })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/dispatch');
  revalidatePath('/admin/booking-health');
  return { ok: true };
}

export async function clearExpiredFallbacksAction(): Promise<{ ok: boolean; error?: string; count?: number }> {
  const gate = await requireAdminAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };
  const tenAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const now = new Date().toISOString();
  const { data, error } = await gate.admin
    .from('booking_fallbacks')
    .update({ status: 'expired', updated_at: now })
    .eq('status', 'pending')
    .is('converted_appointment_id', null)
    .lt('created_at', tenAgo)
    .select('id');
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/booking-health');
  revalidatePath('/admin/dispatch');
  return { ok: true, count: data?.length ?? 0 };
}
