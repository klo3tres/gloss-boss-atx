'use client';

import { useState, useTransition } from 'react';
import { Monitor, Moon, RotateCcw, Save, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/components/theme/theme-provider';
import {
  resetAppearanceDefaultsAction,
  updateUserAppearanceAction,
  updateWebsiteDefaultThemeAction,
} from '@/app/(dashboard)/admin/settings/actions';
import { updateThemePreferenceAction } from '@/app/(dashboard)/dashboard/settings/actions';
import { applyUiPreferencesToDocument, type UiAccent, type UiDensity, type UserUiPreferences } from '@/lib/user-ui-preferences';

const THEME_OPTIONS: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
  { id: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
  { id: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
];

const ACCENTS: Array<{ id: UiAccent; label: string; swatch: string }> = [
  { id: 'gold', label: 'Gold', swatch: 'bg-[#d4af37]' },
  { id: 'amber', label: 'Amber', swatch: 'bg-amber-500' },
  { id: 'emerald', label: 'Emerald', swatch: 'bg-emerald-500' },
];

export function AppearanceSettingsPanel({
  initial,
  websiteDefault = 'dark',
  canEditSiteDefault = false,
}: {
  initial: UserUiPreferences;
  websiteDefault?: 'light' | 'dark';
  canEditSiteDefault?: boolean;
}) {
  const { preference, resolved, setPreference } = useTheme();
  const [prefs, setPrefs] = useState(initial);
  const [siteTheme, setSiteTheme] = useState<'light' | 'dark'>(websiteDefault);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const activeTheme = preference || prefs.themePreference;

  const save = () => {
    start(async () => {
      setMsg(null);
      setPreference(prefs.themePreference);
      applyUiPreferencesToDocument(prefs);
      const res = await updateUserAppearanceAction(prefs);
      await updateThemePreferenceAction(prefs.themePreference);
      if (canEditSiteDefault) await updateWebsiteDefaultThemeAction(siteTheme);
      setMsg(res.error ?? 'Appearance saved to your account.');
    });
  };

  const reset = () => {
    start(async () => {
      const res = await resetAppearanceDefaultsAction();
      const next = { themePreference: 'system' as const, uiAccent: 'gold' as const, uiSidebarDensity: 'comfortable' as const, uiDashboardDensity: 'comfortable' as const };
      setPrefs(next);
      setPreference('system');
      applyUiPreferencesToDocument(next);
      setMsg(res.error ?? 'Reset to defaults.');
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Theme</p>
            <p className="mt-1 text-xs text-zinc-500">Per-user only — never changes other accounts.</p>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setPrefs((p) => ({ ...p, themePreference: opt.id }));
                    setPreference(opt.id);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-3 text-[10px] font-black uppercase transition ${
                    activeTheme === opt.id ? 'border-gold bg-gold/15 text-gold-soft' : 'border-border bg-card text-muted-foreground hover:border-gold/30'
                  }`}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft">Accent</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setPrefs((p) => ({ ...p, uiAccent: a.id }))}
                  className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold uppercase ${
                    prefs.uiAccent === a.id ? 'border-gold text-gold-soft' : 'border-white/10 text-zinc-400'
                  }`}
                >
                  <span className={`h-3 w-3 rounded-full ${a.swatch}`} />
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs text-zinc-500">
              Sidebar density
              <select
                value={prefs.uiSidebarDensity}
                onChange={(e) => setPrefs((p) => ({ ...p, uiSidebarDensity: e.target.value as UiDensity }))}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
            <label className="block text-xs text-zinc-500">
              Dashboard density
              <select
                value={prefs.uiDashboardDensity}
                onChange={(e) => setPrefs((p) => ({ ...p, uiDashboardDensity: e.target.value as UiDensity }))}
                className="mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </label>
          </div>

          {canEditSiteDefault ? (
            <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4">
              <p className="text-[10px] font-black uppercase text-amber-200">Default site theme (public website)</p>
              <p className="mt-1 text-xs text-zinc-400">Super admin only. Changes marketing pages for visitors without a saved preference.</p>
              <div className="mt-3 flex gap-2">
                {(['dark', 'light'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSiteTheme(t)}
                    className={`rounded-xl border px-4 py-2 text-[10px] font-black uppercase ${
                      siteTheme === t ? 'border-gold bg-gold/15 text-gold-soft' : 'border-white/10 text-zinc-400'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-[var(--gb-carbon)] p-4 shadow-lg">
          <p className="text-[9px] font-black uppercase tracking-wider text-zinc-500">Live preview</p>
          <div
            data-theme={resolved}
            className="mt-3 rounded-xl border border-[var(--gb-glass-line)] bg-[var(--gb-bg)] p-4 text-[var(--gb-fg)]"
          >
            <p className="text-[10px] font-black uppercase text-[var(--gb-gold-soft)]">Gloss Boss</p>
            <p className="mt-2 text-sm font-semibold">Dashboard card</p>
            <p className="mt-1 text-xs opacity-70">Soft surfaces · gold accent · readable text</p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/10">
              <div className="h-full w-2/3 rounded-full bg-[var(--gb-gold)]" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-2.5 text-[10px] font-black uppercase text-black disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" /> Save appearance
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-5 py-2.5 text-[10px] font-black uppercase text-zinc-300"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset defaults
        </button>
      </div>
      {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
    </div>
  );
}

/** @deprecated Use AppearanceSettingsPanel */
export function ThemeSettingsPanel({ savedPreference }: { savedPreference?: ThemePreference | null }) {
  return (
    <AppearanceSettingsPanel
      initial={{
        themePreference: savedPreference ?? 'system',
        uiAccent: 'gold',
        uiSidebarDensity: 'comfortable',
        uiDashboardDensity: 'comfortable',
      }}
    />
  );
}
