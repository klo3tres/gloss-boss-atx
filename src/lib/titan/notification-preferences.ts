import type { SupabaseClient } from '@supabase/supabase-js';
import type { ScanFrequency } from '@/lib/titan/scan-budget';

export type OwnerNotificationPreferences = {
  notifyEmailEnabled: boolean;
  notifySmsEnabled: boolean;
  notifyPushoverEnabled: boolean;
  notifyBookings: boolean;
  notifyPayments: boolean;
  notifyLeads: boolean;
  notifyWeather: boolean;
  notifyInventory: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  leadRadarAutoScanEnabled: boolean;
  googlePlacesScanFrequency: ScanFrequency;
  maxPlacesRequestsPerDay: number;
  lastLeadRadarScanAt: string | null;
  nextLeadRadarScanAt: string | null;
};

export type OwnerNotificationEventType =
  | 'new_booking'
  | 'payment_received'
  | 'booking_canceled'
  | 'high_confidence_lead'
  | 'quote_sent'
  | 'customer_replied'
  | 'work_order_created'
  | 'work_order_completed'
  | 'delivery_failed'
  | 'low_inventory'
  | 'weather_risk'
  | 'calendar_sync_failed';

const DEFAULTS: OwnerNotificationPreferences = {
  notifyEmailEnabled: true,
  notifySmsEnabled: true,
  notifyPushoverEnabled: true,
  notifyBookings: true,
  notifyPayments: true,
  notifyLeads: true,
  notifyWeather: true,
  notifyInventory: true,
  quietHoursStart: null,
  quietHoursEnd: null,
  leadRadarAutoScanEnabled: false,
  googlePlacesScanFrequency: 'on_login',
  maxPlacesRequestsPerDay: 25,
  lastLeadRadarScanAt: null,
  nextLeadRadarScanAt: null,
};

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function parseFrequency(v: unknown): ScanFrequency {
  const s = str(v);
  if (['manual', 'on_login', 'twice_daily', 'four_times_daily', 'hourly'].includes(s)) {
    return s as ScanFrequency;
  }
  return 'on_login';
}

export function mapRowToNotificationPreferences(row: Record<string, unknown> | null): OwnerNotificationPreferences {
  if (!row) return { ...DEFAULTS };
  return {
    notifyEmailEnabled: row.notify_email_enabled !== false,
    notifySmsEnabled: row.notify_sms_enabled !== false,
    notifyPushoverEnabled: row.notify_pushover_enabled !== false,
    notifyBookings: row.notify_bookings !== false,
    notifyPayments: row.notify_payments !== false,
    notifyLeads: row.notify_leads !== false,
    notifyWeather: row.notify_weather !== false,
    notifyInventory: row.notify_inventory !== false,
    quietHoursStart: str(row.quiet_hours_start) || null,
    quietHoursEnd: str(row.quiet_hours_end) || null,
    leadRadarAutoScanEnabled: row.lead_radar_auto_scan_enabled === true,
    googlePlacesScanFrequency: parseFrequency(row.google_places_scan_frequency),
    maxPlacesRequestsPerDay: Math.max(5, Number(row.max_places_requests_per_day ?? 25)),
    lastLeadRadarScanAt: str(row.last_lead_radar_scan_at) || null,
    nextLeadRadarScanAt: str(row.next_lead_radar_scan_at) || null,
  };
}

export async function loadOwnerNotificationPreferences(
  admin: SupabaseClient,
  workspaceKey = 'default',
): Promise<OwnerNotificationPreferences> {
  const { data } = await admin
    .from('titan_workspace_settings')
    .select(
      'notify_email_enabled, notify_sms_enabled, notify_pushover_enabled, notify_bookings, notify_payments, notify_leads, notify_weather, notify_inventory, quiet_hours_start, quiet_hours_end, lead_radar_auto_scan_enabled, google_places_scan_frequency, max_places_requests_per_day, last_lead_radar_scan_at, next_lead_radar_scan_at',
    )
    .eq('workspace_key', workspaceKey)
    .maybeSingle();
  return mapRowToNotificationPreferences((data as Record<string, unknown>) ?? null);
}

export function isInQuietHours(prefs: OwnerNotificationPreferences, now = new Date()): boolean {
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

export function eventAllowed(prefs: OwnerNotificationPreferences, eventType: OwnerNotificationEventType): boolean {
  switch (eventType) {
    case 'new_booking':
    case 'booking_canceled':
    case 'work_order_created':
    case 'work_order_completed':
      return prefs.notifyBookings;
    case 'payment_received':
      return prefs.notifyPayments;
    case 'high_confidence_lead':
    case 'quote_sent':
    case 'customer_replied':
      return prefs.notifyLeads;
    case 'weather_risk':
      return prefs.notifyWeather;
    case 'low_inventory':
      return prefs.notifyInventory;
    case 'delivery_failed':
    case 'calendar_sync_failed':
      return true;
    default:
      return true;
  }
}

export function priorityForEvent(eventType: OwnerNotificationEventType): 'low' | 'normal' | 'high' | 'urgent' {
  switch (eventType) {
    case 'delivery_failed':
    case 'calendar_sync_failed':
    case 'payment_received':
    case 'new_booking':
      return 'high';
    case 'weather_risk':
    case 'low_inventory':
      return 'normal';
    case 'high_confidence_lead':
      return 'high';
    default:
      return 'normal';
  }
}
