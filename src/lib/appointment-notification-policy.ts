import type { SupabaseClient } from '@supabase/supabase-js';

export type AppointmentNotificationPolicy = {
  enabled: boolean;
  acknowledgeMinutesBefore: number;
  onWayMinutesBefore: number;
  firstLateMinutes: number;
  secondLateMinutes: number;
  overrunGraceMinutes: number;
  cooldownMinutes: number;
  maximumSendsPerRule: number;
};

export const DEFAULT_APPOINTMENT_NOTIFICATION_POLICY: AppointmentNotificationPolicy = {
  enabled: true,
  acknowledgeMinutesBefore: 60,
  onWayMinutesBefore: 30,
  firstLateMinutes: 15,
  secondLateMinutes: 30,
  overrunGraceMinutes: 15,
  cooldownMinutes: 30,
  maximumSendsPerRule: 1,
};

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : fallback;
}

export function parseAppointmentNotificationPolicy(raw: unknown): AppointmentNotificationPolicy {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { value = {}; }
  }
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    enabled: row.enabled !== false,
    acknowledgeMinutesBefore: bounded(row.acknowledgeMinutesBefore, 60, 0, 1440),
    onWayMinutesBefore: bounded(row.onWayMinutesBefore, 30, 0, 1440),
    firstLateMinutes: bounded(row.firstLateMinutes, 15, 1, 240),
    secondLateMinutes: bounded(row.secondLateMinutes, 30, 1, 480),
    overrunGraceMinutes: bounded(row.overrunGraceMinutes, 15, 0, 240),
    cooldownMinutes: bounded(row.cooldownMinutes, 30, 1, 1440),
    maximumSendsPerRule: bounded(row.maximumSendsPerRule, 1, 1, 10),
  };
}

export async function loadAppointmentNotificationPolicy(admin: SupabaseClient) {
  const { data } = await admin.from('site_settings').select('value').eq('key', 'appointment_notification_policy').maybeSingle();
  return parseAppointmentNotificationPolicy(data?.value);
}
