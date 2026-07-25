import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { BookingConfirmationExperience } from '@/components/booking/booking-confirmation-experience';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { loadBookingConfirmationSummary } from '@/lib/booking-confirmation-summary';
import { claimPortalAppointmentForUser, ensurePortalAccessExpiry } from '@/lib/customer-portal-access';
import { recordCustomerPortalEvent } from '@/lib/customer-portal-tracking';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

function Recovery({ temporary = false }: { temporary?: boolean }) {
  return (
    <main className='gb-luxury-page flex min-h-screen items-center justify-center px-4 py-20 text-foreground'>
      <section className='w-full max-w-lg rounded-3xl border border-gold/25 bg-black/60 p-8 text-center'>
        <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='mt-4 text-2xl font-black text-white'>
          {temporary ? 'Your booking is temporarily unavailable' : 'We couldn’t open this booking link'}
        </h1>
        <p className='mt-3 text-sm leading-6 text-zinc-300'>
          {temporary
            ? 'Your booking is still safe. Retry now, or contact us and we’ll help immediately.'
            : 'The secure link may be incomplete or no longer match a booking. Request an updated link or start a new booking.'}
        </p>
        <div className='mt-6 grid gap-3 sm:grid-cols-2'>
          <a href='' className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>
            Retry
          </a>
          <a href='tel:+15124812319' className='rounded-xl border border-gold/40 px-5 py-3 text-xs font-black uppercase text-gold-soft'>
            Call (512) 481-2319
          </a>
          <a href='sms:+15124812319' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase text-zinc-200'>
            Request updated link
          </a>
          <Link href='/book' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase text-zinc-200'>
            Start new booking
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function CanonicalBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const token = String((await params).token ?? '').trim();
  if (!token) return <Recovery />;

  const admin = tryCreateAdminSupabase();
  if (!admin) return <Recovery temporary />;

  const { data: appointment, error } = await admin
    .from('appointments')
    .select('id, customer_id, guest_email, guest_name, scheduled_start, portal_access_expires_at')
    .eq('access_token', token)
    .maybeSingle();
  if (error) return <Recovery temporary />;
  if (!appointment?.id) return <Recovery />;

  await ensurePortalAccessExpiry(admin, String(appointment.id), appointment.scheduled_start);
  const session = await getSessionWithProfile();
  const requestHeaders = await headers();
  const source = String((await searchParams).source ?? 'canonical_booking_link').slice(0, 100);
  const staffPreview = Boolean(session.user && isStaffRole(session.profile?.role));

  if (staffPreview) {
    await recordCustomerPortalEvent(admin, {
      appointmentId: String(appointment.id),
      customerId: appointment.customer_id ? String(appointment.customer_id) : null,
      token,
      eventType: 'admin_preview_opened',
      headers: requestHeaders,
      role: session.profile?.role,
      adminPreview: true,
      channelSource: source,
    });
  } else if (session.user?.id && session.user.email) {
    const claim = await claimPortalAppointmentForUser(admin, {
      appointmentId: String(appointment.id),
      token,
      authUserId: session.user.id,
      email: session.user.email,
      fullName: session.profile?.full_name ?? appointment.guest_name,
    });
    if (claim.ok && claim.dashboardUrl) {
      await recordCustomerPortalEvent(admin, {
        appointmentId: String(appointment.id),
        customerId: claim.customerId ?? (appointment.customer_id ? String(appointment.customer_id) : null),
        token,
        eventType: claim.accountLinkedNow ? 'account_created' : 'portal_rendered',
        headers: requestHeaders,
        role: session.profile?.role,
        channelSource: source,
      });
      redirect(claim.dashboardUrl);
    }
  } else {
    await admin
      .from('appointments')
      .update({ account_claim_status: 'offered', updated_at: new Date().toISOString() })
      .eq('id', appointment.id)
      .eq('account_claim_status', 'not_offered');
    await recordCustomerPortalEvent(admin, {
      appointmentId: String(appointment.id),
      customerId: appointment.customer_id ? String(appointment.customer_id) : null,
      token,
      eventType: 'portal_rendered',
      headers: requestHeaders,
      role: session.profile?.role,
      channelSource: source,
    });
  }

  const summary = await loadBookingConfirmationSummary(admin, String(appointment.id));
  if (!summary) return <Recovery temporary />;

  return (
    <BookingConfirmationExperience
      appointmentId={String(appointment.id)}
      accessToken={token}
      initialSummary={summary}
      previewMode={staffPreview}
    />
  );
}
