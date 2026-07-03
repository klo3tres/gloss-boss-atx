'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/components/theme/theme-provider';
import { updateThemePreferenceAction } from '@/app/(dashboard)/dashboard/settings/actions';

const OPTIONS: Array<{ id: ThemePreference; label: string; icon: React.ReactNode }> = [
  { id: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
  { id: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
];

export function ThemeSettingsPanel({ savedPreference }: { savedPreference?: ThemePreference | null }) {
  const { preference, setPreference } = useTheme();
  const active = preference || savedPreference || 'system';

  return (
    <div className="rounded-3xl border border-gold/20 bg-zinc-950 p-5">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-gold-soft">Appearance</p>
      <p className="mt-3 text-sm text-zinc-300">Choose light, dark, or match your device. Saved to your account when signed in.</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => {
              setPreference(opt.id);
              void updateThemePreferenceAction(opt.id);
            }}
            className={`flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-[10px] font-black uppercase tracking-wider transition ${
              active === opt.id
                ? 'border-gold bg-gold/15 text-gold-soft'
                : 'border-white/10 bg-black/35 text-zinc-400 hover:border-gold/30 hover:text-white'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
