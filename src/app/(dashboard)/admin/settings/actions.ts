'use server';

import { revalidatePath } from 'next/cache';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import type { ThemePreference } from '@/components/theme/theme-provider';
import type { UiAccent, UiDensity } from '@/lib/user-ui-preferences';

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
