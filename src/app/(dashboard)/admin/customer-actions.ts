'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';

async function requireAdminGate() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();
  if (!session.supabaseConfigured || !supabase || !session.user || !isAdminLevel(session.profile?.role ?? null)) {
    return { ok: false as const, supabase: null, session: null };
  }
  return { ok: true as const, supabase, session };
}

export async function createCustomerAction(formData: FormData) {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const fullName = String(formData.get('full_name') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.warn('[CRM_DEBUG_DB]', 'create_customer_invalid_email');
    return;
  }

  const gate = await requireAdminGate();
  if (!gate.ok) return;

  const { error } = await gate.supabase.from('customers').insert({ email, full_name: fullName, phone });
  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'create_customer_failed', error.message);
    return;
  }
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
  revalidatePath('/admin/super');
}

export async function updateCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const fullName = String(formData.get('full_name') ?? '').trim() || null;
  const phone = String(formData.get('phone') ?? '').trim() || null;
  if (!id || !email) return;

  const gate = await requireAdminGate();
  if (!gate.ok) return;

  const { error } = await gate.supabase.from('customers').update({ email, full_name: fullName, phone }).eq('id', id);
  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'update_customer_failed', error.message);
    return;
  }
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
}

/** Permanent delete: **super_admin only** and requires typed confirmation `DELETE`. */
export async function deleteCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  const confirm = String(formData.get('super_confirm') ?? '').trim();
  if (!id || confirm !== 'DELETE') return;

  const gate = await requireAdminGate();
  if (!gate.ok || !gate.session?.profile || gate.session.profile.role !== 'super_admin') {
    console.warn('[CRM_DEBUG_AUTH]', 'delete_customer_blocked_not_super');
    return;
  }

  const { error } = await gate.supabase.from('customers').delete().eq('id', id);
  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'delete_customer_failed', error.message);
    return;
  }
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
  revalidatePath('/admin/super');
}
