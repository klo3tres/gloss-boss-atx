'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

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

  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  let { error } = await client.from('customers').insert({ email, full_name: fullName, phone, archived: false });
  if (error && /archived|column|schema cache|Could not find/i.test(error.message)) {
    ({ error } = await client.from('customers').insert({ email, full_name: fullName, phone }));
  }
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

/** Soft-archive: hides from default directory; reversible. */
export async function archiveCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const gate = await requireAdminGate();
  if (!gate.ok) return;

  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  const now = new Date().toISOString();
  let { error } = await client.from('customers').update({ archived: true, archived_at: now }).eq('id', id);
  if (error && /archived|column|schema cache|Could not find/i.test(error.message)) {
    ({ error } = await client.from('customers').update({ archived: true }).eq('id', id));
  }
  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'archive_customer_failed', error.message);
    return;
  }
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
  revalidatePath(`/admin/customers/${id}`);
}

export async function unarchiveCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;
  const gate = await requireAdminGate();
  if (!gate.ok) return;
  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  let { error } = await client.from('customers').update({ archived: false, archived_at: null }).eq('id', id);
  if (error && /archived_at|column|schema cache|Could not find/i.test(error.message)) {
    ({ error } = await client.from('customers').update({ archived: false }).eq('id', id));
  }
  if (error && /archived|column|schema cache|Could not find/i.test(error.message)) {
    return;
  }
  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'unarchive_customer_failed', error.message);
    return;
  }
  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${id}`);
}

/** Permanent delete: **super_admin only** and requires click confirmation in the UI. */
export async function deleteCustomerAction(formData: FormData) {
  const id = String(formData.get('id') ?? '').trim();
  if (!id) return;

  const gate = await requireAdminGate();
  if (!gate.ok || !gate.session?.profile || gate.session.profile.role !== 'super_admin') {
    console.warn('[CRM_DEBUG_AUTH]', 'delete_customer_blocked_not_super');
    return;
  }

  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;
  const { error } = await client.from('customers').delete().eq('id', id);
  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'delete_customer_failed', error.message);
    return;
  }
  revalidatePath('/admin/customers');
  revalidatePath('/admin');
  revalidatePath('/admin/super');
}

export async function addManualLoyaltyStampAction(formData: FormData) {
  const customerId = String(formData.get('customerId') ?? '').trim();
  const stampCount = Number(formData.get('stampCount') ?? 1);
  const reason = String(formData.get('reason') ?? 'Manual adjustment').trim();
  if (!customerId || isNaN(stampCount) || stampCount < 1) return;

  const gate = await requireAdminGate();
  if (!gate.ok) return;

  const admin = tryCreateAdminSupabase();
  const client = admin ?? gate.supabase;

  const { error } = await client.from('loyalty_stamps').insert({
    customer_id: customerId,
    stamp_count: stampCount,
    reason,
  });

  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'add_manual_loyalty_stamp_failed', error.message);
    return;
  }

  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/dashboard');
}
