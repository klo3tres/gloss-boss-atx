'use server';

import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import { businessNotifyDestination, resendConfigured, sendResendHtml } from '@/lib/email-send';

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
  const reason = String(formData.get('reason') ?? '').trim() || 'Manual adjustment';
  const source = String(formData.get('source') ?? 'admin_manual').trim();
  const appointmentId = String(formData.get('appointmentId') ?? '').trim() || null;
  if (!customerId || isNaN(stampCount)) return;

  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin) return;

  const isStaff = ['admin', 'super_admin', 'technician'].includes(session.profile?.role ?? '');
  if (!isStaff) return;

  const patch: any = {
    customer_id: customerId,
    stamp_count: stampCount,
    reason,
    note: reason,
    source,
    appointment_id: appointmentId,
    created_by: session.user.id,
  };

  if (session.profile?.role === 'technician') {
    patch.technician_id = session.user.id;
  } else {
    patch.admin_id = session.user.id;
  }

  const { error } = await admin.from('loyalty_stamps').insert(patch);

  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'add_manual_loyalty_stamp_failed', error.message);
    return;
  }

  try {
    const { data: stamps } = await admin
      .from('loyalty_stamps')
      .select('stamp_count, voided, voided_at')
      .eq('customer_id', customerId);
    const loyalty = calculateLoyaltyStatus(stamps ?? []);
    if (loyalty.rewardReady) {
      const { data: customer } = await admin.from('customers').select('full_name, email').eq('id', customerId).maybeSingle();
      const to = businessNotifyDestination();
      const payload = {
        to,
        customer_id: customerId,
        customerName: customer?.full_name ?? customer?.email ?? 'Customer',
        customerEmail: customer?.email ?? null,
        stamps: loyalty.totalStamps,
        appointment_id: appointmentId,
      };
      if (!resendConfigured()) {
        await admin.from('notification_outbox').insert({
          kind: 'reward_earned',
          channel: 'email',
          status: 'skipped',
          provider: 'resend',
          skipped_reason: 'resend_not_configured',
          template_key: 'reward_earned',
          payload,
        });
      } else {
        const sent = await sendResendHtml({
          to,
          subject: `Gloss Boss ATX — Reward earned: ${payload.customerName}`,
          html: `<div style="font-family:Arial,sans-serif;background:#050505;color:#fff;padding:24px;border:1px solid #d4af37;border-radius:14px"><h2 style="margin:0 0 12px">Reward earned</h2><p>${payload.customerName} has ${loyalty.totalStamps} loyalty stamps and is reward-ready.</p></div>`,
        });
        await admin.from('notification_outbox').insert({
          kind: 'reward_earned',
          channel: 'email',
          status: sent.ok ? 'sent' : 'failed',
          provider: 'resend',
          provider_message_id: sent.emailId ?? null,
          error_message: sent.ok ? null : sent.error ?? 'send failed',
          template_key: 'reward_earned',
          payload,
        });
      }
    }
  } catch (e) {
    console.warn('[loyalty] reward owner notification failed', e);
  }

  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/dashboard');
  revalidatePath('/admin/memberships');
  revalidatePath('/tech');
  if (appointmentId) {
    revalidatePath(`/tech/work-orders/${appointmentId}`);
    revalidatePath(`/admin/work-orders/${appointmentId}`);
  }
}

export async function deleteLoyaltyStampAction(formData: FormData) {
  const stampId = String(formData.get('stampId') ?? '').trim();
  const customerId = String(formData.get('customerId') ?? '').trim();
  const voidReason = String(formData.get('voidReason') ?? 'Correction/Void').trim();
  if (!stampId || !customerId) return;

  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin) return;

  const isStaff = ['admin', 'super_admin', 'technician'].includes(session.profile?.role ?? '');
  if (!isStaff) return;

  // Soft-void the stamp by marking it voided = true
  const { error } = await admin
    .from('loyalty_stamps')
    .update({
      voided: true,
      voided_at: new Date().toISOString(),
      voided_by: session.user.id,
      reason: `Voided: ${voidReason}`,
      note: voidReason,
    })
    .eq('id', stampId);

  if (error) {
    console.warn('[CRM_DEBUG_DB]', 'delete_loyalty_stamp_failed', error.message);
    return;
  }

  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${customerId}`);
  revalidatePath('/dashboard');
  revalidatePath('/admin/memberships');
  revalidatePath('/tech');
}

export async function voidLoyaltyStampAction(formData: FormData) {
  return deleteLoyaltyStampAction(formData);
}
