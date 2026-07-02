import { Suspense } from 'react';
import { OwnerProfileSettingsForm } from '@/components/admin/owner-profile-settings';
import { GoogleCalendarConnectPanel } from '@/components/admin/google-calendar-connect-panel';
import { PushoverSetupPanel } from '@/components/admin/pushover-setup-panel';
import { NotificationSettingsPanel } from '@/components/admin/notification-settings-panel';
import { TwilioTestSmsPanel } from '@/components/admin/twilio-test-sms-panel';
import { PostDeployQaChecklist, TitanOnboardingChecklistPanel } from '@/components/titan/titan-onboarding-panels';
import { WebsiteIntelligenceSetupCard } from '@/components/titan/website-intelligence-setup-card';
import { loadWebsiteIntelligenceBundle, summarizeWebsiteIntelligence } from '@/lib/titan/website-intelligence';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { loadOwnerNotificationPreferences } from '@/lib/titan/notification-preferences';
import { pushoverConfigured } from '@/lib/pushover';
import { buildIntegrationStatusRows } from '@/lib/integration-status';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, CheckCircle2, CircleDashed } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { MEDIA_REGISTRY_ITEMS, normalizeMediaRegistry } from '@/lib/media-registry';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

type Readiness = {
  title: string;
  area: string;
  ok: boolean;
  important: boolean;
  detail: string;
  action: string;
  href: string;
};

export default async function OwnerSetupCenterPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const [stripe, mediaRes, serviceRes, reviewRes, lifecycleProbe, exceptionProbe, syncRunsProbe, closeoutProbe, estimatesProbe, followUpsProbe, titanProbe, growthProbe, discoveryProbe, productProbe, widgetProbe, opportunityProbe] = await Promise.all([
    getStripeSecrets(admin),
    admin.from('site_settings').select('value').eq('key', 'media_registry').maybeSingle(),
    admin.from('services').select('id', { count: 'exact', head: true }).eq('active', true),
    admin.from('site_settings').select('value').eq('key', 'google_review_url').maybeSingle(),
    admin.from('appointments').select('lifecycle_stage').limit(1),
    admin.from('business_exceptions').select('id', { count: 'exact', head: true }),
    admin.from('exception_sync_runs').select('id', { count: 'exact', head: true }),
    admin.from('financial_closeouts').select('id', { count: 'exact', head: true }),
    admin.from('service_estimates').select('id', { count: 'exact', head: true }),
    admin.from('customer_follow_ups').select('id', { count: 'exact', head: true }),
    admin.from('titan_nightly_runs').select('id', { count: 'exact', head: true }),
    admin.from('titan_prospects').select('id', { count: 'exact', head: true }),
    admin.from('titan_discovery_runs').select('id', { count: 'exact', head: true }),
    admin.from('titan_workspace_settings').select('workspace_key', { count: 'exact', head: true }),
    admin.from('titan_widget_events').select('id', { count: 'exact', head: true }),
    admin.from('titan_opportunities').select('id', { count: 'exact', head: true }),
  ]);

  const registry = normalizeMediaRegistry(mediaRes.data?.value ?? null);
  const bookingKeys = MEDIA_REGISTRY_ITEMS.filter((item) => item.group === 'Booking Wizard').map((item) => item.key);
  const serviceKeys = MEDIA_REGISTRY_ITEMS.filter((item) => item.group === 'Services').map((item) => item.key);
  const bookingMediaCount = bookingKeys.filter((key) => Boolean(registry[key])).length;
  const serviceMediaCount = serviceKeys.filter((key) => Boolean(registry[key])).length;
  const integrationRows = buildIntegrationStatusRows();
  const twilioConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim() && process.env.TWILIO_PHONE_NUMBER?.trim());
  const twilioTrialLikely = integrationRows.find((r) => r.id === 'twilio')?.level === 'trial';
  const wsSettings = await loadTitanWorkspace(admin);
  const notifyPrefs = await loadOwnerNotificationPreferences(admin);
  const websiteIntelBundle = await loadWebsiteIntelligenceBundle(admin);
  const websiteIntelSummary = summarizeWebsiteIntelligence(websiteIntelBundle);
  const pushoverReady = pushoverConfigured();
  const resendConfigured = Boolean(process.env.RESEND_API_KEY?.trim());
  const weatherConfigured = Boolean(process.env.OPENWEATHER_API_KEY?.trim() && (process.env.BUSINESS_HOME_BASE_ADDRESS?.trim() || (process.env.BUSINESS_LAT?.trim() && process.env.BUSINESS_LNG?.trim())));
  const reviewConfigured = Boolean(String(reviewRes.data?.value ?? '').trim());
  const financialMigrationsReady = !exceptionProbe.error && !lifecycleProbe.error && !syncRunsProbe.error && !closeoutProbe.error && !estimatesProbe.error && !followUpsProbe.error && !titanProbe.error && !growthProbe.error && !discoveryProbe.error && !productProbe.error && !widgetProbe.error && !opportunityProbe.error;

  const checks: Readiness[] = [
    {
      area: 'Payments',
      title: 'Stripe checkout and webhook',
      ok: Boolean(stripe.secretKey && stripe.webhookSecret),
      important: true,
      detail: stripe.secretKey && stripe.webhookSecret ? 'Stripe server key and webhook signing secret are configured.' : 'Customers may pay, but payment events cannot be trusted until both Stripe secrets are configured.',
      action: 'Open Stripe control',
      href: '/admin/stripe-sync',
    },
    {
      area: 'Database',
      title: 'Financial truth and lifecycle migrations',
      ok: financialMigrationsReady,
      important: true,
      detail: financialMigrationsReady ? 'Titan workspace, widget, territory, Opportunity Scanner, Growth OS, and ops tables are available.' : 'Apply Supabase migrations 000079 through 000093 before production deployment.',
      action: 'Open system diagnostics',
      href: '/admin/system-diagnostics',
    },
    {
      area: 'Booking',
      title: 'Bookable service catalog',
      ok: (serviceRes.count ?? 0) > 0,
      important: true,
      detail: `${serviceRes.count ?? 0} active service package(s) are available to customers.`,
      action: 'Manage services and prices',
      href: '/admin/services',
    },
    {
      area: 'Branding',
      title: 'Booking vehicle card images',
      ok: bookingMediaCount === bookingKeys.length,
      important: false,
      detail: `${bookingMediaCount} of ${bookingKeys.length} booking image slots have owner-uploaded images; remaining slots use defaults.`,
      action: 'Upload vehicle images',
      href: '/admin/media#media-booking-wizard',
    },
    {
      area: 'Branding',
      title: 'Service package images',
      ok: serviceMediaCount === serviceKeys.length,
      important: false,
      detail: `${serviceMediaCount} of ${serviceKeys.length} service image slots have owner-uploaded images.`,
      action: 'Upload service images',
      href: '/admin/media#media-services',
    },
    {
      area: 'Communication',
      title: 'Customer email delivery',
      ok: resendConfigured,
      important: true,
      detail: resendConfigured ? 'Resend email delivery is configured.' : 'Booking confirmations, receipts, and lifecycle emails need RESEND_API_KEY.',
      action: 'Open integrations',
      href: '/admin/integrations',
    },
    {
      area: 'Communication',
      title: 'Customer SMS delivery',
      ok: twilioConfigured,
      important: true,
      detail: integrationRows.find((r) => r.id === 'twilio')?.detail ?? (twilioConfigured ? 'Twilio SMS credentials are configured.' : 'Appointment reminders and owner alerts need Twilio credentials.'),
      action: 'Open integrations',
      href: '/admin/integrations',
    },
    {
      area: 'Dispatch',
      title: 'Weather readiness',
      ok: weatherConfigured,
      important: false,
      detail: weatherConfigured ? 'OpenWeather and business location are configured.' : 'Add OPENWEATHER_API_KEY plus business address or coordinates.',
      action: 'Open integrations',
      href: '/admin/integrations#weather',
    },
    {
      area: 'Reputation',
      title: 'Google review collection',
      ok: reviewConfigured,
      important: false,
      detail: reviewConfigured ? 'A public Google review link is saved.' : 'Save the public review URL so completed customers can leave reviews.',
      action: 'Configure reviews',
      href: '/admin/cms?tab=hours',
    },
  ];

  const required = checks.filter((check) => check.important);
  const requiredDone = required.filter((check) => check.ok).length;
  const percentage = Math.round((requiredDone / required.length) * 100);

  return (
    <DashboardShell title='Owner Setup Center' subtitle='Plain-language business readiness, prioritized for a safe customer launch.' role='admin'>
      <section className='rounded-3xl border border-gold/25 bg-black/55 p-6'>
        <p className='text-[10px] font-black uppercase tracking-[0.2em] text-gold-soft'>Required launch systems</p>
        <div className='mt-3 flex items-end justify-between gap-4'><p className='text-4xl font-black text-white'>{percentage}% ready</p><p className='text-xs text-zinc-400'>{requiredDone} of {required.length} required systems</p></div>
        <div className='mt-4 h-2 overflow-hidden rounded-full bg-white/10'><div className='h-full bg-gold' style={{ width: `${percentage}%` }} /></div>
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-black/55 p-6">
        <h2 className="text-sm font-black uppercase text-white">Owner profile</h2>
        <div className="mt-4">
          <OwnerProfileSettingsForm
            tablesReady={wsSettings.tablesReady}
            initial={{
              ownerDisplayName: wsSettings.ownerDisplayName ?? '',
              ownerEmail: wsSettings.ownerEmail ?? '',
              ownerPhone: wsSettings.ownerPhone ?? '',
              businessName: wsSettings.businessName,
            }}
          />
        </div>
      </section>

      <section className="mt-6">
        <Suspense fallback={<div className="rounded-2xl border border-white/10 bg-black/45 p-5 text-xs text-zinc-500">Loading calendar…</div>}>
          <GoogleCalendarConnectPanel />
        </Suspense>
      </section>

      <TitanOnboardingChecklistPanel />
      <PostDeployQaChecklist />

      <section className="mt-6">
        <WebsiteIntelligenceSetupCard summary={websiteIntelSummary} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <PushoverSetupPanel configured={pushoverReady} />
        <NotificationSettingsPanel prefs={notifyPrefs} />
      </section>

      <section className="mt-6 rounded-3xl border border-white/10 bg-black/55 p-6">
        <h2 className="text-sm font-black uppercase text-white">Integration status (accurate)</h2>
        <p className="mt-1 text-xs text-zinc-500">Google Places ≠ Google Maps render. Twilio trial sends SMS to verified numbers only — owner alerts also email via Resend when configured.</p>
        <ul className="mt-4 space-y-2">
          {integrationRows.map((row) => (
            <li key={row.id} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-white">{row.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${row.level === 'ready' ? 'bg-emerald-500/15 text-emerald-200' : row.level === 'trial' ? 'bg-amber-500/15 text-amber-200' : row.level === 'optional' ? 'bg-zinc-700 text-zinc-300' : 'bg-rose-500/15 text-rose-200'}`}>
                  {row.level}
                </span>
              </div>
              <p className="mt-1 text-zinc-500">{row.detail}</p>
            </li>
          ))}
        </ul>
        <Link href="/admin/integrations" className="mt-4 inline-flex rounded-xl border border-gold/30 px-4 py-2 text-[10px] font-black uppercase text-gold-soft">
          Test integrations →
        </Link>
        <div className="mt-4">
          <TwilioTestSmsPanel configured={twilioConfigured} trialLikely={twilioTrialLikely} />
        </div>
        <p className="mt-3 text-[10px] text-zinc-600">Owner test alerts: use buttons on Admin → Integrations (email/SMS test send).</p>
      </section>

      <section className='mt-6 grid gap-3 lg:grid-cols-2'>
        {checks.map((check) => (
          <article key={check.title} className={`rounded-2xl border p-5 ${check.ok ? 'border-white/10 bg-black/45' : check.important ? 'border-red-500/30 bg-red-500/5' : 'border-gold/20 bg-black/45'}`}>
            <div className='flex items-start gap-3'>
              {check.ok ? <CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-emerald-300' /> : check.important ? <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-red-300' /> : <CircleDashed className='mt-0.5 h-5 w-5 shrink-0 text-gold-soft' />}
              <div className='min-w-0 flex-1'><p className='text-[9px] font-black uppercase tracking-wider text-zinc-500'>{check.area} · {check.important ? 'Required' : 'Recommended'}</p><h2 className='mt-1 text-sm font-black uppercase text-white'>{check.title}</h2><p className='mt-2 text-xs leading-5 text-zinc-400'>{check.detail}</p><Link href={check.href} className='mt-4 inline-flex rounded-xl border border-gold/30 px-3 py-2 text-[10px] font-black uppercase text-gold-soft hover:bg-gold/10'>{check.action} →</Link></div>
            </div>
          </article>
        ))}
      </section>
    </DashboardShell>
  );
}
