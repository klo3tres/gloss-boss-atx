'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, type ThemePreference } from '@/components/theme/theme-provider';

const CYCLE: ThemePreference[] = ['light', 'dark', 'system'];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { preference, resolved, setPreference } = useTheme();
  const active = preference || 'system';

  const next = () => {
    const idx = CYCLE.indexOf(active);
    setPreference(CYCLE[(idx + 1) % CYCLE.length]);
  };

  const Icon = active === 'light' ? Sun : active === 'dark' ? Moon : Monitor;
  const label = active === 'system' ? `Theme: system (${resolved})` : `Theme: ${active}`;

  return (
    <button
      type="button"
      onClick={next}
      title={label}
      aria-label={label}
      className={
        compact
          ? 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:border-gold/30 hover:text-foreground'
          : 'inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-2 text-[10px] font-black uppercase text-muted-foreground hover:border-gold/30 hover:text-foreground'
      }
    >
      <Icon className="h-4 w-4" />
      {!compact ? <span className="hidden lg:inline">{active}</span> : null}
    </button>
  );
}
