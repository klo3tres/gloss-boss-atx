import type { ThemePreference } from '@/components/theme/theme-provider';

export type UiAccent = 'gold' | 'amber' | 'emerald';
export type UiDensity = 'comfortable' | 'compact';

export type UserUiPreferences = {
  themePreference: ThemePreference;
  uiAccent: UiAccent;
  uiSidebarDensity: UiDensity;
  uiDashboardDensity: UiDensity;
};

export const DEFAULT_UI_PREFERENCES: UserUiPreferences = {
  themePreference: 'system',
  uiAccent: 'gold',
  uiSidebarDensity: 'comfortable',
  uiDashboardDensity: 'comfortable',
};

export function parseUserUiPreferences(row: Record<string, unknown> | null | undefined): UserUiPreferences {
  if (!row) return DEFAULT_UI_PREFERENCES;
  const theme = String(row.theme_preference ?? 'system');
  const accent = String(row.ui_accent ?? 'gold');
  const sidebar = String(row.ui_sidebar_density ?? 'comfortable');
  const dashboard = String(row.ui_dashboard_density ?? 'comfortable');
  return {
    themePreference: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system',
    uiAccent: accent === 'amber' || accent === 'emerald' ? accent : 'gold',
    uiSidebarDensity: sidebar === 'compact' ? 'compact' : 'comfortable',
    uiDashboardDensity: dashboard === 'compact' ? 'compact' : 'comfortable',
  };
}

export function applyUiPreferencesToDocument(prefs: UserUiPreferences) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.uiAccent = prefs.uiAccent;
  root.dataset.sidebarDensity = prefs.uiSidebarDensity;
  root.dataset.dashboardDensity = prefs.uiDashboardDensity;
}
