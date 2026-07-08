'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useTheme, type ThemePreference } from '@/components/theme/theme-provider';
import { applyUiPreferencesToDocument, type UserUiPreferences } from '@/lib/user-ui-preferences';

const APP_PREFIXES = ['/admin', '/tech', '/dashboard'];

function isAppRoute(pathname: string) {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function applyDocumentTheme(resolved: 'light' | 'dark') {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
}

/** Hydrates per-user theme on app routes; public routes use site default only. */
export function ThemeBootstrap() {
  const pathname = usePathname() ?? '/';
  const { setPreference } = useTheme();
  const prefsRef = useRef<UserUiPreferences | null>(null);
  const siteDefaultRef = useRef<'light' | 'dark'>('dark');

  useEffect(() => {
    let cancelled = false;
    void fetch('/api/user/preferences', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { preferences?: UserUiPreferences; websiteDefault?: 'light' | 'dark' } | null) => {
        if (cancelled || !data) return;
        if (data.preferences) prefsRef.current = data.preferences;
        if (data.websiteDefault) siteDefaultRef.current = data.websiteDefault;
        const onApp = isAppRoute(pathname);
        if (onApp && data.preferences) {
          setPreference(data.preferences.themePreference);
          applyUiPreferencesToDocument(data.preferences);
          try {
            localStorage.setItem('gb-theme-preference', data.preferences.themePreference);
          } catch {
            /* ignore */
          }
        } else {
          applyDocumentTheme(siteDefaultRef.current);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [pathname, setPreference]);

  useEffect(() => {
    const onApp = isAppRoute(pathname);
    if (!onApp) {
      applyDocumentTheme(siteDefaultRef.current);
      return;
    }
    const prefs = prefsRef.current;
    if (!prefs) return;
    const resolved =
      prefs.themePreference === 'system'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : prefs.themePreference;
    applyDocumentTheme(resolved);
    applyUiPreferencesToDocument(prefs);
  }, [pathname]);

  return null;
}
