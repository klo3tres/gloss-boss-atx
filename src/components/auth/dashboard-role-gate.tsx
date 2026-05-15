'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AppRole } from '@/lib/auth/roles';
import {
  clearHydratedOnceFlag,
  clearRoleCache,
  readHydratedOnceFlag,
  setRoleCache,
  writeHydratedOnceFlag,
} from '@/lib/auth/auth-session-ux';
import { fetchUserRole } from '@/lib/auth/fetchUserRole';
import { logRoleDebug } from '@/lib/auth/role-resolution';
import { logRenderDebug } from '@/lib/debug/render-debug';
import { createSupabaseBrowserClient, isSupabasePublicReady } from '@/lib/supabase/client';
import { defaultDashboardPathForRole } from '@/lib/auth/resolve-post-login-path';
import { DashboardSkeleton } from '@/components/auth/dashboard-skeleton';

export type RoleGateVariant = 'admin' | 'super_admin_only' | 'tech' | 'customer';

function allowedRolesForVariant(variant: RoleGateVariant): readonly AppRole[] {
  switch (variant) {
    case 'admin':
      return ['admin', 'super_admin'];
    case 'super_admin_only':
      return ['super_admin'];
    case 'tech':
      return ['technician', 'admin', 'super_admin'];
    case 'customer':
      return ['customer'];
    default:
      return ['customer'];
  }
}

type GateState =
  | 'resolving'
  | 'ready'
  | 'unauthorized'
  | 'setup'
  | 'resolve_timeout'
  | 'missing_profile'
  | 'profile_query_error'
  | 'invalid_role';

export function DashboardRoleGate({ variant, children }: { variant: RoleGateVariant; children: React.ReactNode }) {
  const envReady = isSupabasePublicReady();
  const [state, setState] = useState<GateState>('resolving');
  const [returningUser] = useState(() => readHydratedOnceFlag());
  const [profileMessage, setProfileMessage] = useState<string | null>(null);

  useEffect(() => {
    logRenderDebug({ step: 'dashboard_role_gate_state', gateState: state, variant });
  }, [state, variant]);

  useEffect(() => {
    if (state !== 'resolving') return;
    const hard = window.setTimeout(() => {
      setState((s) => {
        if (s !== 'resolving') return s;
        logRenderDebug({ step: 'gate_resolving_timeout', variant, ms: 8000 });
        return 'resolve_timeout';
      });
    }, 8000);
    return () => window.clearTimeout(hard);
  }, [state, variant]);

  useEffect(() => {
    const allowed = allowedRolesForVariant(variant);
    let cancelled = false;

    async function run() {
      if (!envReady) {
        setState('setup');
        return;
      }

      const supabase = createSupabaseBrowserClient();
      if (!supabase) {
        setState('setup');
        return;
      }

      setState('resolving');
      setProfileMessage(null);
      logRoleDebug({ step: 'gate_start', variant, allowed: [...allowed] });

      try {
        const outcome = await fetchUserRole(supabase);

        if (cancelled) return;

        if (!outcome.ok) {
          clearHydratedOnceFlag();
          clearRoleCache();
          if (outcome.code === 'NO_SESSION') {
            setState('unauthorized');
            return;
          }
          if (outcome.code === 'MISSING_PROFILE') {
            setProfileMessage('Profile not found — contact admin.');
            setState('missing_profile');
            return;
          }
          if (outcome.code === 'PROFILE_QUERY_ERROR') {
            setProfileMessage(outcome.message);
            setState('profile_query_error');
            return;
          }
          if (outcome.code === 'INVALID_ROLE') {
            setProfileMessage(`Invalid role on profile: ${outcome.rawRole}`);
            setState('invalid_role');
            return;
          }
          setState('unauthorized');
          return;
        }

        const role = outcome.role;
        logRoleDebug({
          step: 'gate_session',
          authUserId: outcome.userId,
          resolvedRole: role,
          source: outcome.source,
        });

        setRoleCache(outcome.userId, role);

        if (allowed.includes(role)) {
          writeHydratedOnceFlag();
          setState('ready');
        } else {
          logRoleDebug({
            step: 'gate_unauthorized_role',
            authUserId: outcome.userId,
            resolvedRole: role,
            redirectDestination: defaultDashboardPathForRole(role),
          });
          setState('unauthorized');
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn('[AUTH] gate error', e);
        logRenderDebug({ step: 'gate_exception', variant, message });
        if (!cancelled) {
          setProfileMessage(message);
          setState('profile_query_error');
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [variant, envReady]);

  if (state === 'setup') {
    return (
      <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground'>
        <p className='text-sm text-zinc-400'>Supabase is not configured. Add public env keys to use dashboards.</p>
        <Link href='/setup' className='text-sm font-bold uppercase tracking-wider text-gold-soft underline'>
          Setup
        </Link>
      </main>
    );
  }

  if (state === 'resolve_timeout') {
    return (
      <main className='flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 py-16 text-foreground'>
        <div className='w-full max-w-md rounded-2xl border border-gold/35 bg-gradient-to-b from-zinc-950 to-black p-8 text-center shadow-[0_0_48px_rgba(212,166,77,0.18)]'>
          <p className='text-xs font-bold uppercase tracking-[0.25em] text-gold-soft'>Gloss Boss ATX</p>
          <h1 className='mt-3 text-2xl font-black uppercase tracking-wider text-white'>Session check timed out</h1>
          <p className='mt-3 text-sm text-zinc-400'>Reload and try again.</p>
          <div className='mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center'>
            <button
              type='button'
              onClick={() => window.location.reload()}
              className='rounded-lg bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black transition hover:brightness-110'
            >
              Retry
            </button>
            <Link
              href='/login'
              className='rounded-lg border border-gold/40 px-5 py-3 text-center text-xs font-bold uppercase tracking-wider text-gold-soft transition hover:bg-gold/10'
            >
              Back to login
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (state === 'missing_profile' || state === 'profile_query_error' || state === 'invalid_role') {
    return (
      <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground'>
        <h1 className='text-2xl font-black uppercase tracking-wider text-amber-300'>Account setup required</h1>
        <p className='max-w-md text-sm text-zinc-400'>{profileMessage ?? 'We could not load your staff profile.'}</p>
        <Link href='/login' className='text-sm font-bold uppercase tracking-wider text-gold-soft underline'>
          Back to login
        </Link>
      </main>
    );
  }

  if (state === 'unauthorized') {
    return (
      <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground'>
        <h1 className='text-2xl font-black uppercase tracking-wider text-red-400'>Unauthorized</h1>
        <p className='max-w-md text-sm text-zinc-400'>You do not have access to this area. Sign in with the correct account.</p>
        <Link href='/login' className='text-sm font-bold uppercase tracking-wider text-gold-soft underline'>
          Back to login
        </Link>
      </main>
    );
  }

  if (state === 'resolving') {
    const firstVisitOverlay = !returningUser;
    const returningOverlay = returningUser;
    return (
      <div className='relative min-h-screen bg-background'>
        <div className='relative min-h-screen'>
          <DashboardSkeleton variant={variant} />
          {firstVisitOverlay ? (
            <div className='pointer-events-none fixed inset-0 z-[2] flex flex-col items-center justify-center bg-background/70 backdrop-blur-[2px]'>
              <div className='rounded-2xl border border-gold/30 bg-black/80 px-8 py-6 text-center shadow-[0_0_40px_rgba(212,166,77,0.15)]'>
                <div className='mx-auto h-9 w-9 animate-spin rounded-full border-2 border-gold/30 border-t-gold-soft' aria-hidden />
                <p className='mt-4 text-xs font-bold uppercase tracking-[0.2em] text-gold-soft'>Gloss Boss ATX</p>
                <p className='mt-2 text-sm text-zinc-300'>Loading…</p>
              </div>
            </div>
          ) : null}
          {returningOverlay ? (
            <div className='pointer-events-none fixed right-4 top-4 z-[2] flex items-center gap-2 rounded-full border border-white/10 bg-black/50 px-3 py-1.5 backdrop-blur-sm'>
              <span className='h-2 w-2 animate-pulse rounded-full bg-gold-soft' />
              <span className='text-[10px] font-semibold uppercase tracking-wider text-zinc-400'>Loading…</span>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (state === 'ready') {
    return <div className='min-h-screen bg-background'>{children}</div>;
  }

  return (
    <main className='flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center text-foreground'>
      <p className='text-xs font-bold uppercase tracking-widest text-gold-soft'>Gloss Boss ATX</p>
      <h1 className='text-xl font-black uppercase text-white'>Unexpected state</h1>
      <p className='max-w-md text-sm text-zinc-400'>Please reload the page or return to login.</p>
      <button
        type='button'
        onClick={() => window.location.reload()}
        className='rounded-lg bg-gold px-5 py-3 text-xs font-black uppercase tracking-wider text-black'
      >
        Reload
      </button>
      <Link href='/login' className='text-sm font-bold uppercase tracking-wider text-gold-soft underline'>
        Back to login
      </Link>
    </main>
  );
}
