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
  resend: { apiKeyConfigured: boolean; fromEmailConfigured: boolean; ready?: boolean };
  twilio?: {
    accountSidConfigured: boolean;
    authTokenConfigured: boolean;
    fromNumberConfigured: boolean;
    ready?: boolean;
  };
  readiness?: {
    stripe: boolean;
    stripeWebhook: boolean;
    resend: boolean;
    twilio: boolean;
    supabaseServiceRole: boolean;
    businessNotifyEmail?: boolean;
  };
  envChecklist?: Array<{ key: string; ok: boolean; tier: string; detail: string }>;
  authNotes?: { passwordReset?: string };
  webhooks: { primaryUrlHint: string | null; legacyUrlHint?: string | null };
  storage?: {
    jobMediaBucket: string;
    jobMediaBucketExists: boolean;
    galleryBucket: string;
    galleryBucketExists: boolean;
    serviceRoleUploadReady: boolean;
    latestJobPhoto: { at: string | null; ok: boolean; detail: string };
    latestGalleryRow: { at: string | null; ok: boolean; detail: string };
  };
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

  const r = data?.readiness;

  return (
    <DashboardShell
      title='System status'
      subtitle='Pre-flight checklist for Supabase, Stripe, webhooks, Resend, Twilio, and production env wiring.'
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

          {r ? (
            <section className='rounded-2xl border border-gold/35 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.08)] backdrop-blur-sm'>
              <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Integrations at a glance</h2>
              <div className='mt-4 grid gap-2 sm:grid-cols-2'>
                <Row label='Stripe (secret key)' ok={r.stripe} />
                <Row label='Stripe webhook secret' ok={r.stripeWebhook} detail='Required to verify checkout.session.completed.' />
                <Row label='Resend (send email)' ok={r.resend} />
                <Row label='Twilio (SMS)' ok={r.twilio} detail='Optional — job SMS hooks no-op when missing.' />
                <Row label='Supabase service role' ok={r.supabaseServiceRole} detail='Server booking, intake, and admin writes.' />
                <Row
                  label='Business inbox (booking alerts)'
                  ok={Boolean(r.businessNotifyEmail)}
                  detail='CONTACT_NOTIFY_EMAIL or BUSINESS_NOTIFY_EMAIL — shop copy when customers book (still needs Resend).'
                />
              </div>
            </section>
          ) : null}

          {data.storage ? (
            <section className='gb-premium-card rounded-2xl border border-gold/35 p-5'>
              <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Storage & media health</h2>
              <div className='mt-4 space-y-2'>
                <Row
                  label={`Bucket: ${data.storage.jobMediaBucket}`}
                  ok={data.storage.jobMediaBucketExists}
                  detail={data.storage.jobMediaBucketExists ? 'Job photo uploads' : 'Create bucket or set JOB_MEDIA_BUCKET'}
                />
                <Row
                  label={`Bucket: ${data.storage.galleryBucket}`}
                  ok={data.storage.galleryBucketExists}
                  detail='CMS featured gallery'
                />
                <Row label='Service-role upload ready' ok={data.storage.serviceRoleUploadReady} detail='Both buckets visible to service role' />
                <Row
                  label='Latest job photo'
                  ok={data.storage.latestJobPhoto.ok}
                  detail={
                    data.storage.latestJobPhoto.at
                      ? `${data.storage.latestJobPhoto.detail} · ${new Date(data.storage.latestJobPhoto.at).toLocaleString()}`
                      : data.storage.latestJobPhoto.detail
                  }
                />
                <Row
                  label='Latest CMS gallery row'
                  ok={data.storage.latestGalleryRow.ok}
                  detail={
                    data.storage.latestGalleryRow.at
                      ? `${data.storage.latestGalleryRow.detail} · ${new Date(data.storage.latestGalleryRow.at).toLocaleString()}`
                      : data.storage.latestGalleryRow.detail
                  }
                />
              </div>
            </section>
          ) : null}

          {data.envChecklist?.length ? (
            <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
              <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Environment variables</h2>
              <p className='mt-2 text-xs text-zinc-500'>
                Required rows must be set for core CRM; optional rows enable email/SMS. Values are not shown — only presence.
              </p>
              <div className='mt-4 space-y-2'>
                {data.envChecklist.map((row) => (
                  <div
                    key={row.key}
                    className='flex flex-col gap-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                  >
                    <div>
                      <p className='text-sm font-semibold text-zinc-200'>{row.key}</p>
                      <p className='mt-1 text-xs text-zinc-500'>{row.detail}</p>
                      <p className='mt-1 text-[10px] uppercase tracking-wider text-zinc-600'>{row.tier}</p>
                    </div>
                    <span className={row.ok ? 'text-sm font-bold text-emerald-400' : 'text-sm font-bold text-amber-400'}>
                      {row.ok ? 'Set' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {data.authNotes?.passwordReset ? (
            <section className='rounded-2xl border border-white/10 bg-black/30 p-5'>
              <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Auth email (password reset)</h2>
              <p className='mt-2 text-sm text-zinc-400'>{data.authNotes.passwordReset}</p>
            </section>
          ) : null}

          <section className='rounded-2xl border border-gold/25 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Supabase Auth Email Branding</h2>
            <p className='mt-2 text-sm text-zinc-400'>
              Branded confirm signup, reset password, and magic link templates live in <code className='text-zinc-200'>docs/email-templates</code>.
              Paste them into Supabase Authentication email templates and keep production redirects on <code className='text-zinc-200'>NEXT_PUBLIC_APP_URL</code>.
              Remove localhost URLs from production Supabase settings.
            </p>
            <div className='mt-4 grid gap-2 sm:grid-cols-2'>
              <Row label='NEXT_PUBLIC_APP_URL' ok={Boolean(data.env.nextPublicAppUrl && !data.env.nextPublicAppUrl.includes('localhost'))} detail={data.env.nextPublicAppUrl ?? 'Set this to the production domain in Vercel.'} />
              <Row label='Supabase Site URL' ok={Boolean(data.env.nextPublicAppUrl && !data.env.nextPublicAppUrl.includes('localhost'))} detail='Set Supabase Auth Site URL to the exact production NEXT_PUBLIC_APP_URL.' />
              <Row label='Redirect URLs' ok detail='Add /login, /dashboard, /customer, /reset-password, /agreement, and /book/complete production URLs.' />
              <Row label='Resend domain verification' ok={Boolean(data.resend.ready)} detail='If customer email returns 403, verify the sending domain in Resend.' />
              <Row label='Confirm subject' ok detail='Gloss Boss ATX — Confirm Your Account' />
              <Row label='Reset subject' ok detail='Gloss Boss ATX — Reset Your Password' />
            </div>
          </section>

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
              {typeof data.resend.ready === 'boolean' ? (
                <Row label='Ready to send transactional mail' ok={data.resend.ready} detail='Both API key and From must be set.' />
              ) : null}
              <p className='rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-400'>
                Without Resend, confirmations and receipts are logged only; no customer email is sent.
              </p>
            </div>
          </section>

          <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Twilio</h2>
            <div className='mt-4 space-y-2'>
              {data.twilio ? (
                <>
                  <Row label='TWILIO_ACCOUNT_SID' ok={data.twilio.accountSidConfigured} />
                  <Row label='TWILIO_AUTH_TOKEN' ok={data.twilio.authTokenConfigured} />
                  <Row
                    label='TWILIO_MESSAGING_SERVICE_SID'
                    ok={Boolean((data.twilio as { messagingServiceConfigured?: boolean }).messagingServiceConfigured)}
                  />
                  <Row label='TWILIO_FROM_NUMBER (fallback)' ok={data.twilio.fromNumberConfigured} />
                  {typeof data.twilio.ready === 'boolean' ? (
                    <Row label='Ready to send SMS' ok={data.twilio.ready} detail='SID + token + Messaging Service SID (or From number).' />
                  ) : null}
                </>
              ) : (
                <p className='text-xs text-zinc-500'>Twilio status unavailable — refresh after deploy.</p>
              )}
            </div>
          </section>

          <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Google review & notifications</h2>
            <p className='mt-2 text-xs text-zinc-400'>
              Set the public review button from <span className='text-gold-soft'>Admin → Website CMS</span> (saves to review settings and{' '}
              <code className='text-zinc-300'>site_settings.google_review_url</code>). Optional business inbox: configure Resend above; SMS via
              Twilio.
            </p>
          </section>

          <section className='rounded-2xl border border-gold/20 bg-zinc-950/80 p-5 shadow-[0_0_24px_rgba(212,166,77,0.06)] backdrop-blur-sm'>
            <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>App URL & webhooks</h2>
            <div className='mt-4 space-y-2'>
              <Row
                label='NEXT_PUBLIC_APP_URL'
                ok={Boolean(data.env.nextPublicAppUrl)}
                detail={data.env.nextPublicAppUrl ?? 'Set for Stripe redirects and webhook URL hints.'}
              />
              <div className='rounded-xl border border-white/10 bg-black/30 px-4 py-3'>
                <p className='text-sm font-semibold text-zinc-200'>Stripe webhook (canonical)</p>
                <p className='mt-2 break-all font-mono text-xs text-zinc-400'>{data.webhooks.primaryUrlHint}</p>
              </div>
              {data.webhooks.legacyUrlHint ? (
                <div className='rounded-xl border border-white/10 bg-black/30 px-4 py-3'>
                  <p className='text-sm font-semibold text-zinc-200'>Legacy webhook path</p>
                  <p className='mt-2 break-all font-mono text-xs text-zinc-400'>{data.webhooks.legacyUrlHint}</p>
                </div>
              ) : null}
            </div>
          </section>

          <details className='rounded-2xl border border-white/10 bg-black/40 p-4'>
            <summary className='cursor-pointer text-xs font-bold uppercase tracking-wider text-zinc-300'>Full environment checklist</summary>
            <ul className='mt-3 list-inside list-disc space-y-1 font-mono text-[11px] text-zinc-500'>
              <li>NEXT_PUBLIC_SUPABASE_URL — public Supabase project URL</li>
              <li>NEXT_PUBLIC_SUPABASE_ANON_KEY — browser-safe key</li>
              <li>SUPABASE_SERVICE_ROLE_KEY — server-only; required for messages, some admin writes, booking fallbacks</li>
              <li>STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</li>
              <li>RESEND_API_KEY, RESEND_FROM_EMAIL</li>
              <li>TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_MESSAGING_SERVICE_SID (preferred) or TWILIO_FROM_NUMBER (optional)</li>
              <li>NEXT_PUBLIC_APP_URL — canonical site URL for redirects</li>
            </ul>
          </details>
        </div>
      ) : null}
    </DashboardShell>
  );
}
