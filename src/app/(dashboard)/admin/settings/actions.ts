'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import type { ThemePreference } from '@/components/theme/theme-provider';
import type { UiAccent, UiDensity } from '@/lib/user-ui-preferences';
import { parseDiscountPolicy } from '@/lib/discount-policy';

function isSuperAdmin(role: string | null | undefined) {
  return role === 'super_admin';
}

export async function updateUserAppearanceAction(input: {
  themePreference: ThemePreference;
  uiAccent: UiAccent;
  uiSidebarDensity: UiDensity;
  uiDashboardDensity: UiDensity;
}): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSessionWithProfile();
  if (!session.user?.id || !isStaffRole(session.profile?.role)) return { error: 'Unauthorized' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database unavailable' };

  const { error } = await admin
    .from('profiles')
    .update({
      theme_preference: input.themePreference,
      ui_accent: input.uiAccent,
      ui_sidebar_density: input.uiSidebarDensity,
      ui_dashboard_density: input.uiDashboardDensity,
    })
    .eq('id', session.user.id);
  if (error) return { error: error.message };

  revalidatePath('/admin/settings');
  revalidatePath('/tech/settings');
  revalidatePath('/dashboard/settings');
  return { ok: true };
}

export async function updateWebsiteDefaultThemeAction(theme: 'light' | 'dark'): Promise<{ error?: string; ok?: boolean }> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role)) return { error: 'Super admin only' };
  const admin = tryCreateAdminSupabase();
  if (!admin) return { error: 'Database unavailable' };

  const { error } = await admin.from('site_settings').upsert(
    { key: 'website_default_theme', value: theme, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) return { error: error.message };

  revalidatePath('/admin/settings');
  revalidatePath('/');
  return { ok: true };
}

export async function resetAppearanceDefaultsAction(): Promise<{ error?: string; ok?: boolean }> {
  return updateUserAppearanceAction({
    themePreference: 'system',
    uiAccent: 'gold',
    uiSidebarDensity: 'comfortable',
    uiDashboardDensity: 'comfortable',
  });
}

export async function updateDiscountPolicyAction(formData: FormData): Promise<void> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role)) throw new Error('Super admin only');
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error('Database unavailable');

  const dollarsToCents = (name: string, fallback: number | null) => {
    const raw = String(formData.get(name) ?? '').trim();
    if (!raw) return fallback;
    const value = Number(raw);
    return Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : fallback;
  };
  const expiration = String(formData.get('qaExpiresAt') ?? '').trim();
  const policy = parseDiscountPolicy({
    allowRewardPlusPromo: formData.get('allowRewardPlusPromo') === 'on',
    allowMembershipPlusPromo: formData.get('allowMembershipPlusPromo') === 'on',
    allowReferralPlusPromo: formData.get('allowReferralPlusPromo') === 'on',
    allowLoyaltyPlusPromo: formData.get('allowLoyaltyPlusPromo') === 'on',
    maximumCombinedDiscountPercent: Number(formData.get('maximumCombinedDiscountPercent') ?? 100),
    maximumCombinedDiscountCents: dollarsToCents('maximumCombinedDiscountDollars', null),
    minimumOrderTotalCents: dollarsToCents('minimumOrderTotalDollars', 0),
    excludedServiceSlugs: String(formData.get('excludedServiceSlugs') ?? ''),
    excludedPromoCodes: String(formData.get('excludedPromoCodes') ?? ''),
    oneRewardPerOrder: formData.get('oneRewardPerOrder') === 'on',
    onePromoCodePerOrder: formData.get('onePromoCodePerOrder') === 'on',
    qaMode: {
      enabled: formData.get('qaEnabled') === 'on',
      expiresAt: expiration ? new Date(expiration).toISOString() : null,
      approvedCustomerIds: String(formData.get('qaApprovedCustomerIds') ?? ''),
      approvedCustomerEmails: String(formData.get('qaApprovedCustomerEmails') ?? ''),
      allowStacking: formData.get('qaAllowStacking') === 'on',
    },
  });

  const { error } = await admin.from('site_settings').upsert(
    { key: 'discount_policy', value: JSON.stringify(policy), updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  );
  if (error) throw new Error(error.message);
  revalidatePath('/admin/settings');
  revalidatePath('/book');
}

export async function updateAppointmentNotificationPolicyAction(formData: FormData): Promise<void> {
  const session = await getSessionWithProfile();
  if (!session.user || !isSuperAdmin(session.profile?.role)) throw new Error('Super admin only');
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error('Database unavailable');
  const { parseAppointmentNotificationPolicy } = await import('@/lib/appointment-notification-policy');
  const policy = parseAppointmentNotificationPolicy({
    enabled: formData.get('enabled') === 'on',
    acknowledgeMinutesBefore: formData.get('acknowledgeMinutesBefore'),
    onWayMinutesBefore: formData.get('onWayMinutesBefore'),
    firstLateMinutes: formData.get('firstLateMinutes'),
    secondLateMinutes: formData.get('secondLateMinutes'),
    overrunGraceMinutes: formData.get('overrunGraceMinutes'),
    cooldownMinutes: formData.get('cooldownMinutes'),
    maximumSendsPerRule: formData.get('maximumSendsPerRule'),
  });
  const { error } = await admin.from('site_settings').upsert({ key: 'appointment_notification_policy', value: JSON.stringify(policy), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  revalidatePath('/admin/settings');
}
