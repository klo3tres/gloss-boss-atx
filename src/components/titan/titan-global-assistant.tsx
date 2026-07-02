'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createPortal } from 'react-dom';
import { Sparkles } from 'lucide-react';
import { PoweredByTitan } from '@/components/titan/titan-brand';
import { TitanPublicAssistant } from '@/components/titan/titan-site-guide-widget';
import { TitanOperatorAssistant } from '@/components/titan/titan-operator-assistant';
import { isStaffRole, type AppRole } from '@/lib/auth/roles';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { isSupabasePublicReady, createSupabaseBrowserClient } from '@/lib/supabase/client';

const AUTH_PREFIXES = ['/login', '/signup', '/forgot-password', '/setup', '/unauthorized'];

function isAuthRoute(pathname: string) {
  return AUTH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function TitanGlobalAssistant() {
  const pathname = usePathname() ?? '/';
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<AppRole | null>(null);
  const [flags, setFlags] = useState({ public: true, operator: true, branding: true });

  useEffect(() => {
    setMounted(true);
    void fetch('/api/public/titan-guide')
      .then((r) => r.json())
      .then((j: { settings?: { publicWidgetEnabled?: boolean; operatorAssistantEnabled?: boolean; poweredByBrandingEnabled?: boolean } }) => {
        if (j.settings) {
          setFlags({
            public: j.settings.publicWidgetEnabled !== false,
            operator: j.settings.operatorAssistantEnabled !== false,
            branding: j.settings.poweredByBrandingEnabled !== false,
          });
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!isSupabasePublicReady()) return;
    const client = createSupabaseBrowserClient();
    if (!client) return;
    void fetchUserRole(client).then((r) => {
      if (!cancelled && r.ok) setRole(r.role);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const hide =
    isAuthRoute(pathname) ||
    pathname === '/book' ||
    pathname.startsWith('/book/');
  const operatorContext =
    pathname.startsWith('/admin') ||
    pathname.startsWith('/tech') ||
    (pathname.startsWith('/dashboard') && isStaffRole(role));
  const mode = operatorContext ? 'operator' : 'public';

  const enabled = mode === 'operator' ? flags.operator : flags.public;

  if (!mounted || hide || !enabled) return null;

  const fabLabel = mode === 'operator' ? 'Titan' : 'Ask Titan';

  const ui = (
    <div className="titan-global-assistant pointer-events-none fixed inset-0 z-[99999]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto fixed bottom-5 right-4 flex flex-col items-end gap-0.5 sm:bottom-6 sm:right-6"
          aria-label={fabLabel}
        >
          <span className="flex items-center gap-2.5 rounded-full border border-emerald-400/50 bg-zinc-950/95 px-4 py-3 text-sm font-bold text-white shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_24px_rgba(52,211,153,0.18)] backdrop-blur-md transition hover:scale-[1.02] hover:border-emerald-300/70">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400/25 to-emerald-600/10 text-emerald-300 ring-1 ring-emerald-400/30">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>{fabLabel}</span>
          </span>
          <span className="mr-1 text-[8px] font-bold uppercase tracking-[0.2em] text-zinc-500">
            {flags.branding ? <PoweredByTitan compact className="!text-[8px]" /> : 'Titan'}
          </span>
        </button>
      ) : (
        <div className="pointer-events-auto fixed bottom-4 right-4 sm:bottom-6 sm:right-6">
          {mode === 'operator' ? (
            <TitanOperatorAssistant open onClose={() => setOpen(false)} />
          ) : (
            <TitanPublicAssistant open onClose={() => setOpen(false)} />
          )}
        </div>
      )}
    </div>
  );

  return createPortal(ui, document.body);
}
