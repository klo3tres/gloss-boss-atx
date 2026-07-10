import { redirect } from 'next/navigation';
import { PortalJobGateClient } from '@/components/portal/portal-job-gate-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import {
  claimPortalAppointmentForUser,
  isPortalAccessExpired,
  loadPortalAccessContext,
  verifyPortalAccess,
} from '@/lib/customer-portal-access';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

function whenChicago(iso: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function serviceLabel(slug: string) {
  const s = slug.replace(/-/g, ' ');
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Mobile detail';
}

type Props = {
  searchParams: Promise<{ appointment_id?: string; token?: string }>;
};

export default async function PortalJobPage({ searchParams }: Props) {
  const sp = await searchParams;
  const appointmentId = str(sp.appointment_id);
  const token = str(sp.token);
  const portalPath = `/portal/job?appointment_id=${encodeURIComponent(appointmentId)}&token=${encodeURIComponent(token)}`;

  if (!appointmentId || !token) {
    return (
      <main className="gb-luxury-page flex min-h-screen items-center justify-center px-4 py-20">
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-200">
          Invalid portal link. Check your confirmation email or SMS for the correct link.
        </p>
      </main>
    );
  }

  const verified = await verifyPortalAccess(appointmentId, token);
  if (!verified.ok) {
    return (
      <main className="gb-luxury-page flex min-h-screen items-center justify-center px-4 py-20">
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-200">{verified.error}</p>
      </main>
    );
  }

  const admin = tryCreateAdminSupabase();
  if (!admin) {
    return (
      <main className="gb-luxury-page flex min-h-screen items-center justify-center px-4 py-20">
        <p className="text-sm text-zinc-400">Portal is temporarily unavailable. Please try again shortly.</p>
      </main>
    );
  }

  const loaded = await loadPortalAccessContext(admin, appointmentId);
  if (!loaded.ok) {
    return (
      <main className="gb-luxury-page flex min-h-screen items-center justify-center px-4 py-20">
        <p className="rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-200">{loaded.error}</p>
      </main>
    );
  }

  await admin
    .from('appointments')
    .update({ portal_link_last_opened_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

  const session = await getSessionWithProfile();
  const expired = verified.expired || isPortalAccessExpired(loaded.ctx.expiresAt);

  if (session.user?.id && session.user.email) {
    const claim = await claimPortalAppointmentForUser(admin, {
      appointmentId,
      token,
      authUserId: session.user.id,
      email: session.user.email,
      fullName: session.profile?.full_name ?? loaded.ctx.guestName,
    });
    if (claim.ok && claim.dashboardUrl) {
      redirect(claim.dashboardUrl);
    }
  }

  const { data: job } = await admin
    .from('appointments')
    .select('scheduled_start, service_slug')
    .eq('id', appointmentId)
    .maybeSingle();
  const row = job as { scheduled_start?: string; service_slug?: string } | null;

  const { data: socialSettings } = await admin
    .from('site_settings')
    .select('key, value')
    .in('key', ['social_instagram_url', 'social_tiktok_url', 'social_youtube_url', 'social_facebook_url']);
  const socialRows = socialSettings ?? [];
  const socialLinks = {
    instagramUrl: String(socialRows.find((r) => r.key === 'social_instagram_url')?.value ?? ''),
    tiktokUrl: String(socialRows.find((r) => r.key === 'social_tiktok_url')?.value ?? ''),
    youtubeUrl: String(socialRows.find((r) => r.key === 'social_youtube_url')?.value ?? ''),
    facebookUrl: String(socialRows.find((r) => r.key === 'social_facebook_url')?.value ?? ''),
  };

  return (
    <PortalJobGateClient
      guestName={loaded.ctx.guestName}
      guestEmail={loaded.ctx.guestEmail}
      whenLabel={whenChicago(str(row?.scheduled_start) || new Date().toISOString())}
      service={serviceLabel(str(row?.service_slug))}
      portalPath={portalPath}
      expired={expired}
      socialLinks={socialLinks}
    />
  );
}
