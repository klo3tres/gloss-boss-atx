'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadCadenceRules, saveCadenceRule, type CadenceRule } from '@/lib/customer-notification-cadence';

export async function loadCadenceRulesAction() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return { rules: [], tablesReady: false };
  return loadCadenceRules(admin);
}

export async function saveCadenceRuleAction(formData: FormData) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return;

  const rule: CadenceRule = {
    ruleKey: String(formData.get('rule_key') ?? ''),
    label: String(formData.get('label') ?? ''),
    enabled: formData.get('enabled') === 'on',
    smsEnabled: formData.get('sms_enabled') === 'on',
    emailEnabled: formData.get('email_enabled') === 'on',
    delayHours: Number(formData.get('delay_hours') ?? 0) || 0,
    delayDays: Number(formData.get('delay_days') ?? 0) || 0,
    serviceTypeFilter: String(formData.get('service_type_filter') ?? '').trim() || null,
    smsTemplate: String(formData.get('sms_template') ?? ''),
    emailSubject: String(formData.get('email_subject') ?? ''),
    emailBody: String(formData.get('email_body') ?? ''),
    sortOrder: Number(formData.get('sort_order') ?? 0) || 0,
  };

  await saveCadenceRule(admin, rule);
  revalidatePath('/admin/notifications');
  revalidatePath('/admin/follow-ups');
}

export async function attachReferralToBookingAction(input: {
  referralCode: string;
  appointmentId?: string;
  customerEmail?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) return { error: 'Forbidden' };

  const code = input.referralCode.trim().toUpperCase();
  if (!code) return { error: 'Referral code required.' };

  const { data: codeRow } = await admin.from('customer_referral_codes').select('customer_id, code').ilike('code', code).maybeSingle();
  if (!codeRow) return { error: 'Referral code not found.' };

  const { recordReferralEvent } = await import('@/lib/referral/referral-events');
  const res = await recordReferralEvent(admin, {
    referralCode: code,
    referrerCustomerId: String(codeRow.customer_id),
    status: 'booked',
    referredEmail: input.customerEmail?.trim().toLowerCase() ?? null,
    appointmentId: input.appointmentId ?? null,
    metadata: { attached_by_admin: session.user.id },
  });

  if (!res.ok) return { error: res.error };
  const { logTitanActivity } = await import('@/lib/titan/activity-feed');
  await logTitanActivity(admin, {
    kind: 'command_executed',
    title: 'Referral manually attached',
    detail: `${code} → ${input.appointmentId ?? input.customerEmail ?? 'customer'}`,
    href: '/admin/referrals',
  });
  revalidatePath('/admin/referrals');
  return { ok: true };
}
