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
    rewardLifecycle?: boolean;
  };
  deployment?: {
    localLatestMigration: string;
    remoteLatestMigration: string;
    remoteMigrationSource: string;
    applicationVersion: string;
    applicationCommit: string;
    rewardLifecycleReady: boolean;
    migrationParityReady: boolean;
    expectedSchema: Array<{ label: string; ok: boolean; error: string | null }>;
  };
  weatherMaps?: {
    openWeatherConfigured: boolean;
    businessHomeBaseConfigured: boolean;
    businessCoordinatesConfigured: boolean;
    googleMapsKeyConfigured: boolean;
    appleWeatherKit: { configured: boolean; status: string };
    appleMapsServerApi: { configured: boolean; status: string };
    appleAdvanced: { configured: boolean; message: string; missing: string[] };
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
      title='System Status'
      subtitle='Pre-flight operations validation for database, payment APIs, messaging queues, and storage buckets.'
      role='admin'
    >
      {error ? (
        <section className='mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200'>
          Could not load system status: {error}
        </section>
      ) : null}

      {!data && !error ? (
        <div className='space-y-4'>
          <div className='h-10 w-48 animate-pulse rounded-lg bg-zinc-900' />
          <div className='h-24 animate-pulse rounded-2xl bg-zinc-900' />
          <div className='h-24 animate-pulse rounded-2xl bg-zinc-900' />
        </div>
      ) : null}

      {data ? (
        <div className='space-y-6'>
          <div className='flex justify-between items-center text-[10px] text-zinc-500 font-bold uppercase tracking-wider'>
            <span>Checked: {new Date(data.timestamp).toLocaleString()}</span>
            <span className="text-[9px] py-0.5 px-2 bg-emerald-500/10 text-emerald-300 border border-emerald-500/15 rounded-full">Server Sync Healthy</span>
          </div>

          {r ? (
            <section className='gb-premium-card rounded-3xl p-6'>
              <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft mb-4'>Pre-Flight Readiness Check</h2>
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                <Row label='Stripe Payments API' ok={r.stripe} />
                <Row label='Stripe Webhook Receiver' ok={r.stripeWebhook} detail='Session completion dispatcher' />
                <Row label='Resend Email Outbox' ok={r.resend} />
                <Row label='Twilio SMS Queue' ok={r.twilio} detail='Optional operations trigger' />
                <Row label='Supabase Service Client' ok={r.supabaseServiceRole} detail='Database credentials validation' />
                <Row
                  label='Customer Alerts Copy'
                  ok={Boolean(r.businessNotifyEmail)}
                  detail='Alert mail recipient active'
                />
                <Row label='Reward Lifecycle' ok={Boolean(r.rewardLifecycle)} detail='Issuance, wallet, reservation, redemption, reset, and delivery schema' />
              </div>
            </section>
          ) : null}

          {data.deployment ? (
            <section className={`rounded-3xl border p-6 ${data.deployment.migrationParityReady ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/10'}`}>
              <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                  <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Deployment & Migration Readiness</h2>
                  <p className='mt-2 text-sm font-bold text-white'>{data.deployment.migrationParityReady ? 'Local and production schema are aligned' : 'A newer local migration still needs production deployment'}</p>
                  <p className='mt-1 text-xs text-zinc-400'>{data.deployment.remoteMigrationSource}</p>
                </div>
                <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${data.deployment.migrationParityReady ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-200'}`}>
                  {data.deployment.migrationParityReady ? 'In sync' : 'Migration pending'}
                </span>
              </div>
              <div className='mt-5 grid gap-3 sm:grid-cols-2'>
                <Row label='Local latest migration' ok detail={data.deployment.localLatestMigration} />
                <Row label='Remote latest migration' ok={data.deployment.migrationParityReady} detail={data.deployment.remoteLatestMigration} />
                <Row label='Application version' ok detail={data.deployment.applicationVersion} />
                <Row label='Application commit' ok={data.deployment.applicationCommit !== 'local-uncommitted'} detail={data.deployment.applicationCommit} />
              </div>
              <div className='mt-4 space-y-2'>
                {data.deployment.expectedSchema.map((check) => <Row key={check.label} label={check.label} ok={check.ok} detail={check.error} />)}
              </div>
            </section>
          ) : null}

          {data.weatherMaps ? (
            <section className='gb-premium-card rounded-3xl p-6'>
              <h2 className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft mb-4'>Weather & Maps Setup</h2>
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                <Row
                  label='OpenWeather configured'
                  ok={data.weatherMaps.openWeatherConfigured}
                  detail={data.weatherMaps.openWeatherConfigured ? 'Active weather provider for widgets.' : 'missing OPENWEATHER_API_KEY'}
                />
                <Row
                  label='Business home base configured'
                  ok={data.weatherMaps.businessHomeBaseConfigured}
                  detail={
                    data.weatherMaps.businessHomeBaseConfigured
                      ? 'BUSINESS_HOME_BASE_ADDRESS is set.'
                      : 'Optional fallback: BUSINESS_HOME_BASE_ADDRESS'
                  }
                />
                <Row
                  label='Business coordinates configured'
                  ok={data.weatherMaps.businessCoordinatesConfigured}
                  detail={data.weatherMaps.businessCoordinatesConfigured ? 'BUSINESS_LAT and BUSINESS_LNG bypass weather geocoding.' : 'Optional: BUSINESS_LAT and BUSINESS_LNG'}
                />
                <Row
                  label='Google Maps key configured'
                  ok={data.weatherMaps.googleMapsKeyConfigured}
                  detail='Google direction links work without this key; API-backed distance tools use a key when configured.'
                />
                <Row
                  label='Apple WeatherKit configured'
                  ok={data.weatherMaps.appleWeatherKit.configured}
                  detail={`Status: ${data.weatherMaps.appleWeatherKit.status}. ${data.weatherMaps.appleAdvanced.message}`}
                />
                <Row
                  label='Apple Maps Server API configured'
                  ok={data.weatherMaps.appleMapsServerApi.configured}
                  detail={`Status: ${data.weatherMaps.appleMapsServerApi.status}. Basic Apple Maps links still work.`}
                />
              </div>
              {data.weatherMaps.appleAdvanced.missing.length ? (
                <p className='mt-4 rounded-xl border border-white/10 bg-black/30 p-3 font-mono text-[10px] text-zinc-500'>
                  Missing future Apple advanced keys: {data.weatherMaps.appleAdvanced.missing.join(', ')}
                </p>
              ) : null}
            </section>
          ) : null}

          {/* Storage Details Collapsed */}
          {data.storage ? (
            <details className='rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
              <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
                <span>Storage & Bucket Health</span>
                <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Details</span>
              </summary>
              <div className="mt-5 pt-5 border-t border-white/5 space-y-3">
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
                <Row label='Service-Role Upload Permissions' ok={data.storage.serviceRoleUploadReady} detail='Buckets write-access active' />
                <Row
                  label='Latest Job Media Sync'
                  ok={data.storage.latestJobPhoto.ok}
                  detail={
                    data.storage.latestJobPhoto.at
                      ? `${data.storage.latestJobPhoto.detail} · ${new Date(data.storage.latestJobPhoto.at).toLocaleString()}`
                      : data.storage.latestJobPhoto.detail
                  }
                />
                <Row
                  label='Latest CMS Portfolio Row'
                  ok={data.storage.latestGalleryRow.ok}
                  detail={
                    data.storage.latestGalleryRow.at
                      ? `${data.storage.latestGalleryRow.detail} · ${new Date(data.storage.latestGalleryRow.at).toLocaleString()}`
                      : data.storage.latestGalleryRow.detail
                  }
                />
              </div>
            </details>
          ) : null}

          {/* Env Checklist Collapsed */}
          {data.envChecklist?.length ? (
            <details className='rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
              <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
                <span>Environmental Environment Checklist</span>
                <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Details</span>
              </summary>
              <div className="mt-5 pt-5 border-t border-white/5 space-y-3">
                <p className='text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-2'>
                  Required keys define core operations; optional keys unlock secondary email/SMS notifications.
                </p>
                {data.envChecklist.map((row) => (
                  <div
                    key={row.key}
                    className='flex flex-col gap-1 rounded-xl border border-white/5 bg-zinc-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'
                  >
                    <div>
                      <p className='text-sm font-semibold text-zinc-200'>{row.key}</p>
                      <p className='mt-1 text-xs text-zinc-500'>{row.detail}</p>
                      <p className='mt-1 text-[9px] uppercase tracking-wider text-zinc-600 font-bold'>{row.tier}</p>
                    </div>
                    <span className={row.ok ? 'text-sm font-bold text-emerald-400' : 'text-sm font-bold text-amber-400'}>
                      {row.ok ? 'Set' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {/* Supabase Core Collapsed */}
          <details className='rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
            <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
              <span>Supabase Database Connection</span>
              <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Details</span>
            </summary>
            <div className="mt-5 pt-5 border-t border-white/5 space-y-3">
              <Row label='Database reachable (RLS session)' ok={data.supabase.databaseReachable} detail={data.supabase.databaseError} />
              <Row label='NEXT_PUBLIC_SUPABASE_URL' ok={data.env.nextPublicSupabaseUrl} />
              <Row label='NEXT_PUBLIC_SUPABASE_ANON_KEY' ok={data.env.nextPublicSupabaseAnonKey} />
              <Row label='SUPABASE_SERVICE_ROLE_KEY' ok={data.env.supabaseServiceRoleKey} />
            </div>
          </details>

          {/* Stripe Core Collapsed */}
          <details className='rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
            <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
              <span>Stripe Gateway Configurations</span>
              <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Details</span>
            </summary>
            <div className="mt-5 pt-5 border-t border-white/5 space-y-3">
              <Row label='Secret API Key Configured' ok={data.stripe.secretConfigured} detail={`Source: ${data.stripe.keySource}`} />
              <Row label='Webhook Signing Secret' ok={data.stripe.webhookSecretConfigured} />
              <Row label='Publishable Key Configured' ok={data.stripe.publishableConfigured} />
              <div className='flex justify-between items-center rounded-xl border border-white/5 bg-zinc-950/40 px-4 py-3'>
                <p className='text-xs font-black uppercase text-zinc-400'>Stripe Operating Mode</p>
                <span className='rounded bg-gold/15 border border-gold/20 px-2.5 py-1 text-xs font-black uppercase tracking-wider text-gold-soft'>{data.stripe.mode}</span>
              </div>
            </div>
          </details>

          {/* Resend & Email Branding */}
          <details className='rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
            <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
              <span>Email Courier Services (Resend)</span>
              <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Details</span>
            </summary>
            <div className="mt-5 pt-5 border-t border-white/5 space-y-4">
              <div className='space-y-3'>
                <Row label='RESEND_API_KEY' ok={data.resend.apiKeyConfigured} />
                <Row label='RESEND_FROM_EMAIL' ok={data.resend.fromEmailConfigured} />
                {typeof data.resend.ready === 'boolean' ? (
                  <Row label='Transactional Mail Ready' ok={data.resend.ready} detail='Both API key and Sender are active.' />
                ) : null}
              </div>
              <p className='text-[10px] text-zinc-500 font-medium'>
                Templates confirming signups, resets, and checks reside in <code className='text-zinc-300 font-mono'>docs/email-templates</code>. Configure these templates in your Supabase Auth Console.
              </p>
              <div className='grid gap-3 sm:grid-cols-2 mt-3'>
                <Row label='NEXT_PUBLIC_APP_URL' ok={Boolean(data.env.nextPublicAppUrl && !data.env.nextPublicAppUrl.includes('localhost'))} detail={data.env.nextPublicAppUrl ?? 'Set domain in Vercel to allow login redirects.'} />
                <Row label='Verified Sending Domain' ok={Boolean(data.resend.ready)} detail='Ensure the sending domain is verified in Resend.' />
              </div>
            </div>
          </details>



          {/* Twilio SMS Core */}
          <details className='rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
            <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
              <span>SMS Dispatch Settings (Twilio)</span>
              <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Details</span>
            </summary>
            <div className="mt-5 pt-5 border-t border-white/5 space-y-3">
              {data.twilio ? (
                <>
                  <Row label='TWILIO_ACCOUNT_SID' ok={data.twilio.accountSidConfigured} />
                  <Row label='TWILIO_AUTH_TOKEN' ok={data.twilio.authTokenConfigured} />
                  <Row
                    label='TWILIO_MESSAGING_SERVICE_SID'
                    ok={Boolean((data.twilio as any).messagingServiceConfigured)}
                  />
                  <Row label='TWILIO_FROM_NUMBER (fallback)' ok={data.twilio.fromNumberConfigured} />
                  {typeof data.twilio.ready === 'boolean' ? (
                    <Row label='SMS Queue Active' ok={data.twilio.ready} detail='Credentials and messaging service valid.' />
                  ) : null}
                </>
              ) : (
                <p className='text-xs text-zinc-500'>Twilio environment configuration is not detected.</p>
              )}
            </div>
          </details>

          {/* App URLs and Webhook Hints */}
          <details className='rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
            <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
              <span>Webhook Routing Coordinates</span>
              <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40">Toggle Details</span>
            </summary>
            <div className="mt-5 pt-5 border-t border-white/5 space-y-3">
              <Row
                label='NEXT_PUBLIC_APP_URL'
                ok={Boolean(data.env.nextPublicAppUrl)}
                detail={data.env.nextPublicAppUrl ?? 'Sets origin parameter for webhook checks.'}
              />
              <div className='rounded-xl border border-white/5 bg-zinc-950/40 px-4 py-3.5'>
                <p className='text-xs font-black uppercase text-zinc-400'>Stripe Webhook canonical Endpoint</p>
                <p className='mt-2 break-all font-mono text-xs text-gold-soft'>{data.webhooks.primaryUrlHint}</p>
              </div>
              {data.webhooks.legacyUrlHint ? (
                <div className='rounded-xl border border-white/5 bg-zinc-950/40 px-4 py-3.5'>
                  <p className='text-xs font-black uppercase text-zinc-400'>Legacy webhook path</p>
                  <p className='mt-2 break-all font-mono text-xs text-zinc-500'>{data.webhooks.legacyUrlHint}</p>
                </div>
              ) : null}
            </div>
          </details>
        </div>
      ) : null}
    </DashboardShell>
  );
}
