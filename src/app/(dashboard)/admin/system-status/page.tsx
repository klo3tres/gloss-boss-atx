'use client';

import { useEffect, useState } from 'react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';

type StatusPayload = {
  timestamp: string;
  actorRole?: string;
  supabase: { configured: boolean; databaseReachable: boolean; databaseError: string | null };
  env: {
    nextPublicAppUrl: string | null;
    nextPublicSupabaseUrl: boolean;
    nextPublicSupabaseAnonKey: boolean;
    supabaseServiceRoleKey: boolean;
  };
  stripe: {
    secretConfigured: boolean;
    webhookSecretConfigured: boolean;
    publishableConfigured: boolean;
    keySource: string;
    mode: string;
  };
  resend: { apiKeyConfigured: boolean; fromEmailConfigured: boolean };
  webhooks: { primaryUrlHint: string | null };
};

function Row({ label, ok, detail }: { label: string; ok: boolean; detail?: string | null }) {
  return (
    <div className='flex flex-col gap-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
      <p className='text-sm font-semibold text-zinc-200'>{label}</p>
      <div className='text-right'>
        <span className={ok ? 'text-sm font-bold text-emerald-400' : 'text-sm font-bold text-amber-400'}>{ok ? 'OK' : 'Action needed'}</span>
        {detail ? <p className='mt-1 max-w-md text-xs text-zinc-500'>{detail}</p> : null}
      </div>
    </div>
  );
}

export default function SystemStatusPage() {
  const [data, setData] = useState<StatusPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/system-status')
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<StatusPayload>;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <DashboardShell
      title='System status'
      subtitle='Pre-flight checklist for Supabase, Stripe, Resend, and environment wiring before production cutover.'
      role='admin'
    >
      {error ? (
        <p className='rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200'>Could not load status: {error}</p>
      ) : null}

      {!data && !error ? (
        <div className='space-y-3'>
          <div className='h-10 w-48 animate-pulse rounded-lg bg-zinc-900' />
          <div className='h-24 animate-pulse rounded-2xl bg-zinc-900' />
          <div className='h-24 animate-pulse rounded-2xl bg-zinc-900' />
        </div>
      ) : null}

      {data ? (
        <div className='space-y-6'>
          <p className='text-xs text-zinc-500'>Last checked: {new Date(data.timestamp).toLocaleString()}</p>

          <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Supabase</h2>
            <div className='mt-4 space-y-2'>
              <Row label='Database reachable (RLS session)' ok={data.supabase.databaseReachable} detail={data.supabase.databaseError} />
              <Row label='NEXT_PUBLIC_SUPABASE_URL' ok={data.env.nextPublicSupabaseUrl} />
              <Row label='NEXT_PUBLIC_SUPABASE_ANON_KEY' ok={data.env.nextPublicSupabaseAnonKey} />
              <Row label='SUPABASE_SERVICE_ROLE_KEY (server / Vercel)' ok={data.env.supabaseServiceRoleKey} />
            </div>
          </section>

          <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Stripe</h2>
            <div className='mt-4 space-y-2'>
              <Row label='Secret key configured' ok={data.stripe.secretConfigured} detail={`Source: ${data.stripe.keySource}`} />
              <Row label='Webhook signing secret' ok={data.stripe.webhookSecretConfigured} />
              <Row label='Publishable key' ok={data.stripe.publishableConfigured} />
              <div className='rounded-xl border border-white/10 bg-black/30 px-4 py-3'>
                <p className='text-sm font-semibold text-zinc-200'>Detected mode</p>
                <p className='mt-1 text-sm uppercase tracking-wider text-gold-soft'>{data.stripe.mode}</p>
              </div>
            </div>
          </section>

          <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Resend</h2>
            <div className='mt-4 space-y-2'>
              <Row label='RESEND_API_KEY' ok={data.resend.apiKeyConfigured} />
              <Row label='RESEND_FROM_EMAIL' ok={data.resend.fromEmailConfigured} />
              <p className='rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-400'>
                Messages still save without Resend. Add <code className='text-gold-soft'>RESEND_API_KEY</code> and{' '}
                <code className='text-gold-soft'>RESEND_FROM_EMAIL</code> in Vercel to email the shop on new contact form submissions.
              </p>
            </div>
          </section>

          <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>App URL & webhooks</h2>
            <div className='mt-4 space-y-2'>
              <Row label='NEXT_PUBLIC_APP_URL' ok={Boolean(data.env.nextPublicAppUrl)} detail={data.env.nextPublicAppUrl ?? 'Set for Stripe redirects and webhook URL hints.'} />
              <div className='rounded-xl border border-white/10 bg-black/30 px-4 py-3'>
                <p className='text-sm font-semibold text-zinc-200'>Stripe webhook target</p>
                <p className='mt-2 break-all font-mono text-xs text-zinc-400'>{data.webhooks.primaryUrlHint}</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </DashboardShell>
  );
}
