import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminSettingsClient } from '@/components/admin/admin-settings-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { parseUserUiPreferences } from '@/lib/user-ui-preferences';
import { loadOwnerNotificationPreferences } from '@/lib/titan/notification-preferences';
import { pushoverConfigured } from '@/lib/pushover';
import { DEFAULT_DISCOUNT_POLICY, loadDiscountPolicy } from '@/lib/discount-policy';
import { DEFAULT_APPOINTMENT_NOTIFICATION_POLICY, loadAppointmentNotificationPolicy } from '@/lib/appointment-notification-policy';

export const dynamic = 'force-dynamic';

export default async function AdminSettingsPage() {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) notFound();

  const admin = tryCreateAdminSupabase();
  const isSuperAdmin = session.profile?.role === 'super_admin';

  let uiPreferences = parseUserUiPreferences(null);
  let websiteDefault: 'light' | 'dark' = 'dark';
  let notifyPrefs = await loadOwnerNotificationPreferences(admin!);
  let discountPolicy = DEFAULT_DISCOUNT_POLICY;
  let appointmentNotificationPolicy = DEFAULT_APPOINTMENT_NOTIFICATION_POLICY;

  if (admin && session.user.id) {
    const [{ data: profile }, siteRes] = await Promise.all([
      admin
        .from('profiles')
        .select('theme_preference, ui_accent, ui_sidebar_density, ui_dashboard_density')
        .eq('id', session.user.id)
        .maybeSingle(),
      admin.from('site_settings').select('value').eq('key', 'website_default_theme').maybeSingle(),
    ]);
    uiPreferences = parseUserUiPreferences(profile as Record<string, unknown> | null);
    const raw = siteRes.data?.value;
    if (raw === 'light' || raw === 'dark') websiteDefault = raw;
    notifyPrefs = await loadOwnerNotificationPreferences(admin);
    discountPolicy = await loadDiscountPolicy(admin);
    appointmentNotificationPolicy = await loadAppointmentNotificationPolicy(admin);
  }

  return (
    <DashboardShell title="Settings" subtitle="Appearance, business, notifications, and integrations — per your account." role="admin">
      <AdminSettingsClient
        uiPreferences={uiPreferences}
        websiteDefault={websiteDefault}
        isSuperAdmin={isSuperAdmin}
        pushoverConfigured={pushoverConfigured()}
        notifyPrefs={notifyPrefs}
        discountPolicy={discountPolicy}
        appointmentNotificationPolicy={appointmentNotificationPolicy}
      />
    </DashboardShell>
  );
}
