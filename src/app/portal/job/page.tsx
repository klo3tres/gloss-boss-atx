import Link from 'next/link';
import { redirect } from 'next/navigation';
import { verifyPortalAccess } from '@/lib/customer-portal-access';

export const dynamic = 'force-dynamic';

function LegacyLinkRecovery({ message }: { message: string }) {
  return (
    <main className='gb-luxury-page flex min-h-screen items-center justify-center px-4 py-20 text-foreground'>
      <section className='w-full max-w-lg rounded-3xl border border-gold/25 bg-black/60 p-8 text-center'>
        <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>Gloss Boss ATX</p>
        <h1 className='mt-4 text-2xl font-black text-white'>We couldn’t open this booking link</h1>
        <p className='mt-3 text-sm leading-6 text-zinc-300'>{message}</p>
        <div className='mt-6 grid gap-3 sm:grid-cols-2'>
          <a href='tel:+15124812319' className='rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black'>
            Call (512) 481-2319
          </a>
          <a href='sms:+15124812319' className='rounded-xl border border-gold/40 px-5 py-3 text-xs font-black uppercase text-gold-soft'>
            Request updated link
          </a>
          <Link href='/book' className='rounded-xl border border-white/15 px-5 py-3 text-xs font-black uppercase text-zinc-200 sm:col-span-2'>
            Start new booking
          </Link>
        </div>
      </section>
    </main>
  );
}

export default async function LegacyPortalJobPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment_id?: string; token?: string }>;
}) {
  const sp = await searchParams;
  const appointmentId = String(sp.appointment_id ?? '').trim();
  const token = String(sp.token ?? '').trim();
  if (!appointmentId || !token) {
    return <LegacyLinkRecovery message='The link is incomplete. Request an updated secure link and we’ll reconnect you to the appointment.' />;
  }

  const verified = await verifyPortalAccess(appointmentId, token);
  if (!verified.ok) {
    return <LegacyLinkRecovery message={verified.error} />;
  }
  redirect(`/booking/${encodeURIComponent(token)}?source=legacy_portal_link`);
}
