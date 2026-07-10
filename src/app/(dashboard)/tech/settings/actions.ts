'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { actionErr, actionOk, type ActionResult } from '@/lib/action-result';
import {
  parseStaffNotificationPreferences,
  staffPrefsToJson,
  type StaffNotificationPreferences,
} from '@/lib/staff-notification-preferences';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

async function requireStaff() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !admin || !isStaffRole(session.profile?.role ?? null)) return null;
  return { session, admin, userId: session.user.id };
}

export async function saveStaffNotificationPreferencesAction(
  prefs: StaffNotificationPreferences,
  phone?: string,
  pushoverUserKey?: string,
): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const patch: Record<string, unknown> = {
    staff_notification_preferences: staffPrefsToJson(prefs),
    updated_at: new Date().toISOString(),
  };

  const phoneClean = str(phone).replace(/\D/g, '');
  if (phone !== undefined) {
    if (phoneClean.length >= 10) {
      patch.phone = phoneClean.length === 10 ? `+1${phoneClean}` : phone.startsWith('+') ? phone : `+${phoneClean}`;
    } else if (phone === '') {
      patch.phone = null;
    }
  }

  if (pushoverUserKey !== undefined) {
    patch.pushover_user_key = str(pushoverUserKey) || null;
  }

  const { error } = await gate.admin.from('profiles').update(patch).eq('id', gate.userId);
  if (error) return actionErr(error.message);

  revalidatePath('/tech/settings');
  revalidatePath('/admin/settings');
  return actionOk('Notification preferences saved.');
}

export async function sendStaffNotificationTestAction(): Promise<ActionResult> {
  const gate = await requireStaff();
  if (!gate) return actionErr('Not authorized.');

  const email = gate.session.user?.email ?? '';
  const { data: profile } = await gate.admin
    .from('profiles')
    .select('phone, full_name')
    .eq('id', gate.userId)
    .maybeSingle();

  const name = str(profile?.full_name) || 'Team member';
  const prefs = await import('@/lib/staff-notification-preferences').then((m) =>
    m.loadStaffNotificationPreferences(gate.admin, gate.userId),
  );

  const results: string[] = [];

  if (prefs.notifyEmailEnabled && email) {
    const { resendConfigured, sendResendHtml } = await import('@/lib/email-send');
    if (resendConfigured()) {
      const sent = await sendResendHtml({
        to: email,
        subject: 'Gloss Boss ATX — Test staff alert',
        html: `<p>Hi ${name},</p><p>This is a test job alert. Email notifications are working.</p>`,
      });
      results.push(sent.ok ? 'Email sent' : `Email failed: ${sent.error}`);
    } else {
      results.push('Email skipped (Resend not configured)');
    }
  }

  if (prefs.notifySmsEnabled && str(profile?.phone)) {
    const { sendCustomerSms } = await import('@/lib/sms-send');
    const sms = await sendCustomerSms({
      db: gate.admin,
      kind: 'staff_test_alert',
      to: str(profile?.phone),
      body: `Gloss Boss ATX test: SMS job alerts are working for ${name}.`,
      requireConsent: false,
    });
    results.push(sms.ok ? 'SMS sent' : `SMS failed: ${sms.error ?? 'unknown'}`);
  }

  if (prefs.notifyPushEnabled) {
    const { sendWebPushToUser, webPushConfigured } = await import('@/lib/web-push-send');
    if (webPushConfigured()) {
      const push = await sendWebPushToUser(gate.admin, gate.userId, {
        title: 'Gloss Boss test alert',
        body: 'Browser push notifications are working.',
        url: '/tech/settings',
      });
      results.push(push.sent > 0 ? 'Push sent' : push.error ?? 'Push not subscribed');
    } else {
      results.push('Push skipped (VAPID not configured)');
    }
  }

  if (results.length === 0) return actionErr('Enable at least one channel and add contact info.');
  return actionOk(results.join(' · '));
}

export async function loadStaffNotificationSettingsAction(): Promise<{
  prefs: StaffNotificationPreferences;
  phone: string;
  email: string;
  pushoverUserKey: string;
  pushConfigured: boolean;
  vapidPublicKey: string | null;
} | null> {
  const gate = await requireStaff();
  if (!gate) return null;

  const { data } = await gate.admin
    .from('profiles')
    .select('staff_notification_preferences, phone, email, pushover_user_key')
    .eq('id', gate.userId)
    .maybeSingle();

  const { getVapidPublicKey, webPushConfigured } = await import('@/lib/web-push-send');

  return {
    prefs: parseStaffNotificationPreferences((data as { staff_notification_preferences?: unknown } | null)?.staff_notification_preferences),
    phone: str((data as { phone?: string } | null)?.phone),
    email: str((data as { email?: string } | null)?.email) || gate.session.user?.email || '',
    pushoverUserKey: str((data as { pushover_user_key?: string } | null)?.pushover_user_key),
    pushConfigured: webPushConfigured(),
    vapidPublicKey: getVapidPublicKey(),
  };
}
