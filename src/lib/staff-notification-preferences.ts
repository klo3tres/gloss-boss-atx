import type { SupabaseClient } from '@supabase/supabase-js';

export type StaffNotificationEventType =
  | 'job_assigned'
  | 'job_rescheduled'
  | 'job_cancelled'
  | 'new_booking_assigned'
  | 'job_reminder_24h'
  | 'job_reminder_2h';

export type StaffNotificationPreferences = {
  notifyEmailEnabled: boolean;
  notifySmsEnabled: boolean;
  notifyPushEnabled: boolean;
  notifyInAppEnabled: boolean;
  notifyJobAssigned: boolean;
  notifyJobRescheduled: boolean;
  notifyJobCancelled: boolean;
  notifyNewBookingAssigned: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

export const DEFAULT_STAFF_NOTIFICATION_PREFERENCES: StaffNotificationPreferences = {
  notifyEmailEnabled: true,
  notifySmsEnabled: true,
  notifyPushEnabled: true,
  notifyInAppEnabled: true,
  notifyJobAssigned: true,
  notifyJobRescheduled: true,
  notifyJobCancelled: true,
  notifyNewBookingAssigned: true,
  quietHoursStart: null,
  quietHoursEnd: null,
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function bool(v: unknown, fallback: boolean) {
  return typeof v === 'boolean' ? v : fallback;
}

export function parseStaffNotificationPreferences(raw: unknown): StaffNotificationPreferences {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_STAFF_NOTIFICATION_PREFERENCES;
  return {
    notifyEmailEnabled: bool(o.notify_email_enabled, d.notifyEmailEnabled),
    notifySmsEnabled: bool(o.notify_sms_enabled, d.notifySmsEnabled),
    notifyPushEnabled: bool(o.notify_push_enabled, d.notifyPushEnabled),
    notifyInAppEnabled: bool(o.notify_in_app_enabled, d.notifyInAppEnabled),
    notifyJobAssigned: bool(o.notify_job_assigned, d.notifyJobAssigned),
    notifyJobRescheduled: bool(o.notify_job_rescheduled, d.notifyJobRescheduled),
    notifyJobCancelled: bool(o.notify_job_cancelled, d.notifyJobCancelled),
    notifyNewBookingAssigned: bool(o.notify_new_booking_assigned, d.notifyNewBookingAssigned),
    quietHoursStart: str(o.quiet_hours_start) || null,
    quietHoursEnd: str(o.quiet_hours_end) || null,
  };
}

export function staffPrefsToJson(prefs: StaffNotificationPreferences): Record<string, unknown> {
  return {
    notify_email_enabled: prefs.notifyEmailEnabled,
    notify_sms_enabled: prefs.notifySmsEnabled,
    notify_push_enabled: prefs.notifyPushEnabled,
    notify_in_app_enabled: prefs.notifyInAppEnabled,
    notify_job_assigned: prefs.notifyJobAssigned,
    notify_job_rescheduled: prefs.notifyJobRescheduled,
    notify_job_cancelled: prefs.notifyJobCancelled,
    notify_new_booking_assigned: prefs.notifyNewBookingAssigned,
    quiet_hours_start: prefs.quietHoursStart,
    quiet_hours_end: prefs.quietHoursEnd,
  };
}

export async function loadStaffNotificationPreferences(
  admin: SupabaseClient,
  userId: string,
): Promise<StaffNotificationPreferences> {
  const { data } = await admin
    .from('profiles')
    .select('staff_notification_preferences')
    .eq('id', userId)
    .maybeSingle();
  return parseStaffNotificationPreferences((data as { staff_notification_preferences?: unknown } | null)?.staff_notification_preferences);
}

export function isStaffInQuietHours(prefs: StaffNotificationPreferences, now = new Date()): boolean {
  if (!prefs.quietHoursStart || !prefs.quietHoursEnd) return false;
  const [sh, sm] = prefs.quietHoursStart.split(':').map(Number);
  const [eh, em] = prefs.quietHoursEnd.split(':').map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const start = sh * 60 + sm;
  const end = eh * 60 + em;
  if (start <= end) return mins >= start && mins < end;
  return mins >= start || mins < end;
}

export function staffEventAllowed(prefs: StaffNotificationPreferences, eventType: StaffNotificationEventType): boolean {
  switch (eventType) {
    case 'job_assigned':
    case 'job_reminder_24h':
    case 'job_reminder_2h':
      return prefs.notifyJobAssigned;
    case 'new_booking_assigned':
      return prefs.notifyNewBookingAssigned;
    case 'job_rescheduled':
      return prefs.notifyJobRescheduled;
    case 'job_cancelled':
      return prefs.notifyJobCancelled;
    default:
      return true;
  }
}
