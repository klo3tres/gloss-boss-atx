'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import {
  archiveNotification,
  loadTitanNotificationEvents,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/titan/notification-events';
import { pushoverConfigured, sendPushoverNotification } from '@/lib/pushover';
import type { ScanFrequency } from '@/lib/titan/scan-budget';

async function requireStaffAdmin() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) return null;
  return { admin };
}

export async function loadNotificationHubAction() {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  const { events, tablesReady } = await loadTitanNotificationEvents(gate.admin, { limit: 100 });
  const unread = events.filter((e) => !e.readAt).length;
  return { events, tablesReady, unread };
}

export async function markNotificationReadAction(id: string) {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  await markNotificationRead(gate.admin, id);
  revalidatePath('/admin/notifications');
  return { ok: true };
}

export async function markAllNotificationsReadAction() {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  await markAllNotificationsRead(gate.admin);
  revalidatePath('/admin/notifications');
  return { ok: true };
}

export async function archiveNotificationAction(id: string) {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  await archiveNotification(gate.admin, id);
  revalidatePath('/admin/notifications');
  return { ok: true };
}

export async function sendTestPushoverAction(): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };
  if (!pushoverConfigured()) {
    return { error: 'Add PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY in Vercel env vars.' };
  }
  const res = await sendPushoverNotification({
    title: 'Gloss Boss ATX — Test',
    message: 'Pushover is connected. You will get Titan alerts on your phone.',
    url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.glossbossatx.com'}/admin/setup-center`,
    priority: 0,
  });
  if (!res.ok) return { error: res.error ?? 'Pushover send failed' };
  return { ok: true };
}

export async function saveNotificationPreferencesAction(input: {
  notifyEmailEnabled?: boolean;
  notifySmsEnabled?: boolean;
  notifyPushoverEnabled?: boolean;
  notifyBookings?: boolean;
  notifyPayments?: boolean;
  notifyLeads?: boolean;
  notifyWeather?: boolean;
  notifyInventory?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  leadRadarAutoScanEnabled?: boolean;
  googlePlacesScanFrequency?: ScanFrequency;
  maxPlacesRequestsPerDay?: number;
}): Promise<{ ok?: boolean; error?: string }> {
  const gate = await requireStaffAdmin();
  if (!gate) return { error: 'Unauthorized' };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.notifyEmailEnabled != null) patch.notify_email_enabled = input.notifyEmailEnabled;
  if (input.notifySmsEnabled != null) patch.notify_sms_enabled = input.notifySmsEnabled;
  if (input.notifyPushoverEnabled != null) patch.notify_pushover_enabled = input.notifyPushoverEnabled;
  if (input.notifyBookings != null) patch.notify_bookings = input.notifyBookings;
  if (input.notifyPayments != null) patch.notify_payments = input.notifyPayments;
  if (input.notifyLeads != null) patch.notify_leads = input.notifyLeads;
  if (input.notifyWeather != null) patch.notify_weather = input.notifyWeather;
  if (input.notifyInventory != null) patch.notify_inventory = input.notifyInventory;
  if (input.quietHoursStart !== undefined) patch.quiet_hours_start = input.quietHoursStart || null;
  if (input.quietHoursEnd !== undefined) patch.quiet_hours_end = input.quietHoursEnd || null;
  if (input.leadRadarAutoScanEnabled != null) patch.lead_radar_auto_scan_enabled = input.leadRadarAutoScanEnabled;
  if (input.googlePlacesScanFrequency) patch.google_places_scan_frequency = input.googlePlacesScanFrequency;
  if (input.maxPlacesRequestsPerDay != null) {
    patch.max_places_requests_per_day = Math.max(5, Math.min(200, input.maxPlacesRequestsPerDay));
  }

  const { error } = await gate.admin.from('titan_workspace_settings').update(patch).eq('workspace_key', 'default');
  if (error) return { error: error.message };
  revalidatePath('/admin/setup-center');
  revalidatePath('/admin/notifications');
  return { ok: true };
}
