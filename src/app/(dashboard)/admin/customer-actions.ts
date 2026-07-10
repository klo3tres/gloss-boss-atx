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

export async function claimLoyaltyRewardForCustomerAction(formData: FormData) {
  const { actionErr, actionOk } = await import('@/lib/action-result');
  const {
    buildLoyaltyRewardView,
    countRedeemedLoyaltyRewards,
    loadLoyaltyRewardConfig,
  } = await import('@/lib/loyalty-reward-claim');
  const { sendCustomerSms } = await import('@/lib/sms-send');

  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  const customerId = String(formData.get('customerId') ?? '').trim();
  const workOrderId = String(formData.get('workOrderId') ?? '').trim();
  if (!session.user || !admin) return actionErr('Not authorized.');
  const isStaff = ['admin', 'super_admin', 'technician'].includes(session.profile?.role ?? '');
  if (!isStaff) return actionErr('Staff only.');
  if (!customerId) return actionErr('No customer linked.');

  const [{ data: customer }, { data: stamps }, redeemedCount, rewardConfig] = await Promise.all([
    admin.from('customers').select('id, full_name, email, phone, sms_consent, sms_status').eq('id', customerId).maybeSingle(),
    admin.from('loyalty_stamps').select('stamp_count, voided, voided_at').eq('customer_id', customerId),
    countRedeemedLoyaltyRewards(admin, customerId),
    loadLoyaltyRewardConfig(admin),
  ]);
  if (!customer?.id) return actionErr('Customer not found.');

  const view = buildLoyaltyRewardView(stamps ?? [], redeemedCount, { rewardThreshold: rewardConfig.rewardThreshold });
  if (!view.canClaim) return actionErr('No punch-card reward is available to claim right now.');

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 12);

  const { data: inserted, error } = await admin
    .from('customer_credits')
    .insert({
      customer_id: customerId,
      amount_cents: rewardConfig.rewardCents,
      remaining_cents: rewardConfig.rewardCents,
      type: 'loyalty_reward',
      reason: rewardConfig.rewardDescription,
      source: 'loyalty_staff_claim',
      status: 'active',
      expires_at: expiresAt.toISOString(),
      linked_work_order_id: workOrderId || null,
      issued_by: session.user.id,
    })
    .select('id')
    .maybeSingle();

  if (error || !inserted) return actionErr(error?.message ?? 'Could not issue reward credit.');

  const amountLabel = `$${(rewardConfig.rewardCents / 100).toFixed(2)}`;
  const name = String(customer.full_name || 'Valued Client');

  if (customer.phone && (customer.sms_consent === true || customer.sms_status === 'opted_in')) {
    await sendCustomerSms({
      db: admin,
      kind: 'loyalty_reward_claimed',
      to: customer.phone,
      body: `Gloss Boss ATX: Your punch-card reward is ready! We added ${amountLabel} to your account — apply it on your next detail or this visit in Payments.`,
      customer_id: customerId,
      appointment_id: workOrderId || undefined,
      requireConsent: false,
    });
  }

  if (customer.email?.includes('@')) {
    await sendResendHtml({
      to: customer.email,
      subject: 'Gloss Boss ATX — Punch-card reward issued',
      html: `<div style="font-family:sans-serif;background:#000;color:#fff;padding:24px;border:1px solid #d4af37;border-radius:12px"><h2 style="color:#d4af37">Reward ready</h2><p>Hi ${name},</p><p>Your loyalty punch-card reward (${amountLabel}) is on your account. Your tech can apply it to this visit or your next booking.</p></div>`,
    });
  }

  await admin.from('customer_notes').insert({
    customer_id: customerId,
    body: `Staff issued punch-card reward credit (${amountLabel})${workOrderId ? ` from work order ${workOrderId.slice(0, 8)}` : ''}.`,
  });

  revalidatePath('/dashboard');
  revalidatePath('/admin/customers');
  revalidatePath(`/admin/customers/${customerId}`);
  if (workOrderId) {
    revalidatePath(`/tech/work-orders/${workOrderId}`);
    revalidatePath(`/admin/work-orders/${workOrderId}`);
  }
  return actionOk(`Reward issued! ${amountLabel} credit added — apply in Payments tab.`);
}
