import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getStripeSecrets } from '@/lib/stripe/stripeService';
import { loadTitanSystemHealth } from '@/lib/titan/system-health';

export const dynamic = 'force-dynamic';

type Check = {
  id: string;
  label: string;
  status: 'live' | 'partial' | 'manual' | 'broken';
  affects: string;
  fix: string;
  href: string;
  testHref?: string;
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

  const [stripe, health, bookingProbe, reviewProbe, placesKey] = await Promise.all([
    getStripeSecrets(admin),
    loadTitanSystemHealth(admin),
    admin.from('appointments').select('id').limit(1),
    admin.from('customer_reviews').select('id').eq('published', true).limit(1),
    Promise.resolve(process.env.GOOGLE_PLACES_API_KEY?.trim() || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || ''),
  ]);

  const openWeather = Boolean(process.env.OPENWEATHER_API_KEY?.trim() || process.env.OPENWEATHER_API_KE?.trim());
  const twilio = Boolean(process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_AUTH_TOKEN?.trim());

  const checks: Check[] = [
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
      fix: 'Add manual reviews or configure Google review URL.',
      href: '/admin/reviews',
      testHref: '/',
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
      id: 'places',
      label: 'Google Places',
      status: placesKey ? 'live' : 'manual',
      affects: 'Lead Radar auto-discovery disabled',
      fix: 'Set GOOGLE_PLACES_API_KEY — manual prospect mode still works.',
      href: '/admin/super',
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
      <div className="space-y-4">
        {checks.map((c) => (
          <article key={c.id} className="rounded-2xl border border-white/10 bg-black/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-black text-white">{c.label}</h2>
              <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${badge(c.status)}`}>{c.status}</span>
            </div>
            <p className="mt-2 text-xs text-zinc-500"><strong className="text-zinc-400">Affects:</strong> {c.affects}</p>
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
