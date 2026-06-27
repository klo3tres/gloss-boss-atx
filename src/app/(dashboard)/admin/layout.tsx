import { AdminLayoutClient } from '@/components/admin/admin-layout-client';
import { loadOwnerNotificationPreferences } from '@/lib/titan/notification-preferences';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = tryCreateAdminSupabase();
  const prefs = admin ? await loadOwnerNotificationPreferences(admin) : null;

  return (
    <AdminLayoutClient
      leadRadarAutoEnabled={prefs?.leadRadarAutoScanEnabled ?? false}
      lastLeadRadarScanAt={prefs?.lastLeadRadarScanAt ?? null}
      scanFrequency={prefs?.googlePlacesScanFrequency ?? 'on_login'}
    >
      {children}
    </AdminLayoutClient>
  );
}
