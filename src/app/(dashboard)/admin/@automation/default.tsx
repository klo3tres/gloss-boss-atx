import { AdminAutomationBoot } from '@/components/admin/admin-automation-boot';
import { loadOwnerNotificationPreferences } from '@/lib/titan/notification-preferences';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export default async function AdminAutomationSlot() {
  const admin = tryCreateAdminSupabase();
  const prefs = admin ? await loadOwnerNotificationPreferences(admin) : null;

  return (
    <AdminAutomationBoot
      leadRadarAutoEnabled={prefs?.leadRadarAutoScanEnabled ?? false}
      lastLeadRadarScanAt={prefs?.lastLeadRadarScanAt ?? null}
      scanFrequency={prefs?.googlePlacesScanFrequency ?? 'on_login'}
    />
  );
}
