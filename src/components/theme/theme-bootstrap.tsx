'use client';

import { useEffect } from 'react';
import { useTheme } from '@/components/theme/theme-provider';
import { applyUiPreferencesToDocument, type UserUiPreferences } from '@/lib/user-ui-preferences';

/** Hydrates per-user theme + UI prefs from the database after login. */
export function ThemeBootstrap() {
  const { setPreference } = useTheme();

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/user/preferences', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { preferences?: UserUiPreferences; websiteDefault?: 'light' | 'dark' } | null) => {
        if (cancelled || !data?.preferences) return;
        setPreference(data.preferences.themePreference);
        applyUiPreferencesToDocument(data.preferences);
        try {
          localStorage.setItem('gb-theme-preference', data.preferences.themePreference);
        } catch {
          /* ignore */
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [setPreference]);

  return null;
}
