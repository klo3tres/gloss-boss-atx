import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { loadTitanSystemHealth } from '@/lib/titan/system-health';
import {
  buildMapsDiscoveryProbes,
  placesDiscoveryConfigured,
  googleMapsRenderConfigured,
  appleMapKitCredentialsPresent,
} from '@/lib/integrations/maps-discovery-status';
import { loadDomainHealthReport } from '@/lib/domain-health';
import { validateAppUrlConfig, CANONICAL_ORIGIN, EXPECTED_APP_URL } from '@/lib/env/canonical-domain';
import { LaunchReadinessHostDebug } from '@/components/admin/launch-readiness-host-debug';

export const dynamic = 'force-dynamic';

type Check = {
  id: string;
  label: string;
  status: 'live' | 'partial' | 'manual' | 'broken';
  affects: string;
  fix: string;
  href: string;
  testHref?: string;
  disabledFeatures?: string[];
};

function badge(status: Check['status']) {
  const map = {
    live: 'bg-emerald-500/20 text-emerald-200',
    partial: 'bg-amber-500/20 text-amber-200',
    manual: 'bg-blue-500/20 text-blue-200',
    broken: 'bg-red-500/20 text-red-200',
  };
  return map[status];
}

export default async function LaunchReadinessPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const [stripe, health, bookingProbe, reviewProbe, mapProbes, domainHealth] = await Promise.all([
    getStripeSecrets(admin),
    loadTitanSystemHealth(admin),
    admin.from('appointments').select('id').limit(1),
    admin.from('customer_reviews').select('id').eq('published', true).limit(1),
    Promise.resolve(buildMapsDiscoveryProbes()),
    loadDomainHealthReport(),
  ]);

  const appUrlCheck = validateAppUrlConfig();

  const placesProbe = mapProbes.find((p) => p.id === 'google_places')!;
  const mapsProbe = mapProbes.find((p) => p.id === 'google_maps')!;
  const appleProbe = mapProbes.find((p) => p.id === 'apple_mapkit')!;

  const openWeather = Boolean(process.env.OPENWEATHER_API_KEY?.trim() || process.env.OPENWEATHER_API_KE?.trim());
  const twilio = Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());

  const checks: Check[] = [
    {
      id: 'domain_ssl_apex',
      label: 'HTTPS certificate (glossbossatx.com)',
      status: domainHealth.apex.ok ? 'live' : 'broken',
      affects: 'Browser security warnings — site flagged as unsafe / phishing',
      fix: domainHealth.apex.error
        ? `Apex TLS failed: ${domainHealth.apex.error}. Add glossbossatx.com in Vercel Domains with Valid Configuration.`
        : 'Verify glossbossatx.com in Vercel → Settings → Domains.',
      href: 'https://vercel.com/dashboard',
      testHref: CANONICAL_ORIGIN,
    },
    {
      id: 'domain_ssl_www',
      label: 'HTTPS certificate (www)',
      status: domainHealth.www.ok ? 'live' : 'broken',
      affects: 'Visitors using www may see certificate errors',
      fix: 'Add www.glossbossatx.com in Vercel; CNAME www → cname.vercel-dns.com.',
      href: 'https://vercel.com/dashboard',
      testHref: `https://www.glossbossatx.com`,
    },
    {
      id: 'domain_redirect',
      label: 'Apex → www redirect (Vercel only)',
      status: domainHealth.apexRedirectsToWww ? 'live' : domainHealth.apexRedirectsToWww === false ? 'broken' : 'manual',
      affects: 'Redirect loops if app also redirects www ↔ apex',
      fix: domainHealth.apexRedirectsToWww
        ? 'glossbossatx.com redirects to www in Vercel — app must NOT add host redirects in middleware or vercel.json.'
        : 'Configure glossbossatx.com → https://www.glossbossatx.com in Vercel Domains only. Remove app-level redirects.',
      href: 'https://vercel.com/dashboard',
      testHref: '/api/debug/host',
    },
    {
      id: 'domain_app_url',
      label: 'NEXT_PUBLIC_APP_URL',
      status: appUrlCheck.ok ? 'live' : process.env.VERCEL_ENV === 'production' ? 'broken' : 'partial',
      affects: 'Stripe return URLs, webhooks, emails, and auth redirects use wrong domain',
      fix: appUrlCheck.issues[0] ?? `Set NEXT_PUBLIC_APP_URL=${EXPECTED_APP_URL} in Vercel Production env.`,
      href: '/admin/integrations',
    },
    {
      id: 'domain_https',
      label: 'HTTP → HTTPS',
      status: domainHealth.httpApexRedirectsToHttps ? 'live' : domainHealth.httpApexRedirectsToHttps === false ? 'broken' : 'manual',
      affects: 'Insecure HTTP connections before redirect',
      fix: 'Vercel enables HTTPS automatically when domain SSL is valid.',
      href: 'https://vercel.com/dashboard',
    },
    {
      id: 'booking',
      label: 'Booking',
      status: bookingProbe.error ? 'broken' : 'live',
      affects: 'Customers cannot book online',
      fix: 'Run migrations, verify services + availability in CMS.',
      href: '/admin/booking-health',
      testHref: '/book',
    },
    {
      id: 'stripe',
      label: 'Stripe',
      status: stripe.secretKey ? 'live' : 'broken',
      affects: 'Deposits and payments fail',
      fix: 'Add Stripe keys in Admin → Stripe settings.',
      href: '/admin/settings/stripe',
    },
    {
      id: 'reviews',
      label: 'Reviews',
      status: (reviewProbe.data?.length ?? 0) > 0 ? 'live' : 'manual',
      affects: 'Homepage social proof empty',
      fix: 'Set GOOGLE_PLACES_API_KEY in Vercel and sync reviews in Admin → CMS, or add manual reviews.',
      href: '/admin/reviews',
      testHref: '/',
    },
    {
      id: 'google_places',
      label: 'Google Places',
      status: placesDiscoveryConfigured() ? 'live' : 'broken',
      affects: 'Lead Radar cannot discover prospects — Run discovery now disabled',
      fix: 'Set GOOGLE_PLACES_API_KEY and enable Places API (New) with billing.',
      href: '/admin/integrations',
      disabledFeatures: placesProbe.disabledFeatures,
    },
    {
      id: 'google_maps',
      label: 'Google Maps',
      status: googleMapsRenderConfigured() ? 'live' : 'broken',
      affects: 'Map view and routing preview disabled in Lead Radar',
      fix: 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY and enable Maps JavaScript API.',
      href: '/admin/integrations',
      disabledFeatures: mapsProbe.disabledFeatures,
    },
    {
      id: 'apple_mapkit',
      label: 'Apple Maps / MapKit',
      status: appleMapKitCredentialsPresent() ? 'live' : 'manual',
      affects: appleMapKitCredentialsPresent()
        ? 'Optional alternative map layer available'
        : 'Apple map toggle unavailable — Google Maps or list-only still works',
      fix: 'Optional — APPLE_MAPKIT_JS_TOKEN or APPLE_MAPS_TEAM_ID + KEY_ID + PRIVATE_KEY. Does not replace Google Places discovery.',
      href: '/admin/integrations',
      disabledFeatures: appleProbe.disabledFeatures,
    },
    {
      id: 'weather',
      label: 'Weather',
      status: openWeather ? 'live' : 'manual',
      affects: 'Job cards and calendar lack weather context',
      fix: 'Set OPENWEATHER_API_KEY in environment.',
      href: '/admin/integrations',
    },
    {
      id: 'twilio',
      label: 'Twilio SMS',
      status: twilio ? 'live' : 'manual',
      affects: 'Titan uses copy/paste outreach until Twilio is connected',
      fix: 'Configure Twilio in integrations — manual send is OK for launch.',
      href: '/admin/integrations',
    },
    {
      id: 'customer',
      label: 'Customer dashboard',
      status: 'live',
      affects: 'Customers manage bookings and messages',
      fix: 'Verify /dashboard loads for a test customer account.',
      href: '/dashboard',
      testHref: '/dashboard',
    },
    {
      id: 'tech',
      label: 'Tech dashboard',
      status: 'live',
      affects: 'Field workflow and job completion',
      fix: 'Verify /tech loads for technician role.',
      href: '/tech',
      testHref: '/tech',
    },
    {
      id: 'titan',
      label: 'Titan',
      status: health.migrationReady ? 'live' : 'partial',
      affects: 'Daily manager and attribution may not persist',
      fix: `Apply Titan migrations through ${health.latestMigration}.`,
      href: '/admin/titan',
    },
    {
      id: 'media',
      label: 'Image publish',
      status: health.tables.find((t) => t.id === 'titan_workspace_settings')?.status === 'ok' ? 'live' : 'partial',
      affects: 'Booking wizard images may not save',
      fix: 'Run migration 000097 for site_settings.updated_at.',
      href: '/admin/media',
    },
  ];

  return (
    <DashboardShell title="Launch Readiness" subtitle="What is live, manual, or broken before customers hit the site" role={session.profile!.role as 'admin' | 'super_admin'}>
      {!appUrlCheck.ok ? (
        <div className="mb-6 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">NEXT_PUBLIC_APP_URL mismatch</p>
          <p className="mt-2 text-sm text-amber-100">
            Must be exactly <code className="text-amber-200">{EXPECTED_APP_URL}</code>
            {appUrlCheck.configured ? ` — currently ${appUrlCheck.configured}` : ' — not set in production'}.
          </p>
        </div>
      ) : null}
      {domainHealth.criticalIssue ? (
        <div className="mb-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-red-300">Domain security — fix before sharing the public site</p>
          <p className="mt-2 text-sm text-red-100">{domainHealth.criticalIssue}</p>
          <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-red-200/90">
            {domainHealth.fixSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <LaunchReadinessHostDebug />
      <div className="mt-6 space-y-4">
        {checks.map((c) => (
          <article key={c.id} className="rounded-2xl border border-white/10 bg-black/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black text-white">{c.label}</h2>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${badge(c.status)}`}>{c.status}</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500"><strong className="text-zinc-400">Affects:</strong> {c.affects}</p>
            {c.disabledFeatures && c.disabledFeatures.length > 0 ? (
              <p className="mt-1 text-xs text-amber-300/90">
                <strong className="text-amber-200">Disabled Titan features:</strong> {c.disabledFeatures.join(' · ')}
              </p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-500"><strong className="text-zinc-400">Fix:</strong> {c.fix}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={c.href} className="rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft">Open settings</Link>
              {c.testHref ? (
                <Link href={c.testHref} target="_blank" className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400">Test</Link>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </DashboardShell>
  );
}
