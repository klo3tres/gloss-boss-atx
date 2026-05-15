'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getCachedRoleForUser } from '@/lib/auth/auth-session-ux';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';

type DebugState = {
  userId: string | null;
  cachedRole: string | null;
  profileRole: string | null;
  resolvedRole: string | null;
  route: string;
  outcomeCode: string | null;
};

/**
 * Dev-only footer: session + profile role diagnostics.
 */
export function DashboardAuthDebugFooter() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [info, setInfo] = useState<DebugState | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || process.env.NODE_ENV === 'production') return;

    const supabase = createSupabaseBrowserClient();
    if (!supabase || !isSupabasePublicReady()) {
      setInfo({
        userId: null,
        cachedRole: null,
        profileRole: null,
        resolvedRole: null,
        route: pathname,
        outcomeCode: 'no_client',
      });
      return;
    }

    let cancelled = false;

    void (async () => {
      const outcome = await fetchUserRole(supabase);
      if (cancelled) return;

      if (!outcome.ok) {
        const cached = outcome.userId ? getCachedRoleForUser(outcome.userId) : null;
        setInfo({
          userId: outcome.userId,
          cachedRole: cached ?? '—',
          profileRole: null,
          resolvedRole: null,
          route: pathname,
          outcomeCode: outcome.code,
        });
        return;
      }

      const cached = getCachedRoleForUser(outcome.userId);
      setInfo({
        userId: outcome.userId,
        cachedRole: cached ?? '—',
        profileRole: outcome.profileRow?.role ?? '—',
        resolvedRole: outcome.role,
        route: pathname,
        outcomeCode: outcome.source,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [mounted, pathname]);

  if (!mounted || process.env.NODE_ENV === 'production') {
    return null;
  }

  return (
    <footer className='mt-10 rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-[11px] leading-relaxed text-amber-100/90'>
      <p className='font-bold uppercase tracking-wider text-amber-200'>Dev — auth link</p>
      {info ? (
        <dl className='mt-2 grid gap-1 font-mono text-[10px] text-amber-50/95 sm:grid-cols-2'>
          <div>
            <dt className='text-amber-400/90'>auth user id</dt>
            <dd className='break-all'>{info.userId ?? '—'}</dd>
          </div>
          <div>
            <dt className='text-amber-400/90'>cached role</dt>
            <dd>{info.cachedRole}</dd>
          </div>
          <div>
            <dt className='text-amber-400/90'>profiles.role</dt>
            <dd>{info.profileRole}</dd>
          </div>
          <div>
            <dt className='text-amber-400/90'>resolved role</dt>
            <dd>{info.resolvedRole ?? '—'}</dd>
          </div>
          <div>
            <dt className='text-amber-400/90'>source / code</dt>
            <dd>{info.outcomeCode}</dd>
          </div>
          <div>
            <dt className='text-amber-400/90'>route</dt>
            <dd className='break-all'>{info.route}</dd>
          </div>
        </dl>
      ) : (
        <p className='mt-2 text-[10px]'>Loading debug…</p>
      )}
    </footer>
  );
}
