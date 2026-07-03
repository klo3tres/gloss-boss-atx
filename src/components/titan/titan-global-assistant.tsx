'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [flags, setFlags] = useState({ public: true, operator: true, branding: true });
  const [fabPos, setFabPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem('gb_titan_fab_pos');
      if (raw) {
        const parsed = JSON.parse(raw) as { x: number; y: number };
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) setFabPos(parsed);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail;
      const fromStorage = (() => {
        try {
          return sessionStorage.getItem('gb_titan_pending_prompt');
        } catch {
          return null;
        }
      })();
      const prompt = detail?.prompt?.trim() || fromStorage?.trim() || null;
      if (prompt) {
        try {
          sessionStorage.removeItem('gb_titan_pending_prompt');
        } catch {
          /* ignore */
        }
        setPendingPrompt(prompt);
      }
      setOpen(true);
    };
    window.addEventListener('gb-open-titan', onOpen);
    return () => window.removeEventListener('gb-open-titan', onOpen);
  }, []);

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

  const snapFab = (x: number, y: number) => {
    const margin = 12;
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    const snappedX = x < w / 2 ? margin : w - margin;
    const next = { x: snappedX, y: Math.max(margin, Math.min(y, (window.innerHeight || 800) - 80)) };
    setFabPos(next);
    try {
      localStorage.setItem('gb_titan_fab_pos', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const hasStickyBookCta =
    mode === 'public' &&
    (pathname === '/' ||
      pathname === '/services' ||
      pathname === '/memberships' ||
      pathname === '/gallery' ||
      pathname.startsWith('/fleet'));

  const fabStyle =
    fabPos.x || fabPos.y
      ? { left: fabPos.x, top: fabPos.y, right: 'auto', bottom: 'auto' as const }
      : {
          right: 16,
          bottom: hasStickyBookCta ? 88 : 20,
          left: 'auto' as const,
          top: 'auto' as const,
        };

  const ui = (
    <div className="titan-global-assistant pointer-events-none fixed inset-0 z-[99999]">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          onPointerDown={(e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            dragRef.current = { startX: e.clientX, startY: e.clientY, originX: fabPos.x || window.innerWidth - 16, originY: fabPos.y || window.innerHeight - 80 };
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            setFabPos({ x: dragRef.current.originX + dx, y: dragRef.current.originY + dy });
          }}
          onPointerUp={(e) => {
            if (!dragRef.current) return;
            const dx = e.clientX - dragRef.current.startX;
            const dy = e.clientY - dragRef.current.startY;
            const moved = Math.abs(dx) + Math.abs(dy) > 10;
            const finalX = dragRef.current.originX + dx;
            const finalY = dragRef.current.originY + dy;
            dragRef.current = null;
            if (moved) {
              snapFab(finalX, finalY);
              e.preventDefault();
            }
          }}
          style={fabStyle}
          className="pointer-events-auto fixed flex flex-col items-end gap-0.5 scale-[0.92] sm:scale-100"
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
            <TitanPublicAssistant
              open
              onClose={() => {
                setOpen(false);
                setPendingPrompt(null);
              }}
              initialPrompt={pendingPrompt}
              onInitialPromptConsumed={() => setPendingPrompt(null)}
            />
          )}
        </div>
      )}
    </div>
  );

  return createPortal(ui, document.body);
}
