import { notFound, redirect } from 'next/navigation';
import { BookingConfirmationExperience } from '@/components/booking/booking-confirmation-experience';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadBookingConfirmationSummary } from '@/lib/booking-confirmation-summary';
import { verifyOwnerPreviewToken } from '@/lib/owner-preview-token';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function PrivateCustomerPreviewPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login');
  if (!isAdminLevel(session.profile?.role)) notFound();
  const payload = verifyOwnerPreviewToken((await params).token, session.user.id);
  if (!payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-white">
        <div className="max-w-md rounded-3xl border border-amber-400/30 bg-amber-500/10 p-6 text-center">
          <h1 className="text-xl font-black">Preview link expired</h1>
          <p className="mt-2 text-sm text-zinc-300">Return to the work order and open a fresh private preview.</p>
        </div>
      </main>
    );
  }
  const admin = tryCreateAdminSupabase();
  if (!admin) throw new Error('Preview is temporarily unavailable.');
  const summary = await loadBookingConfirmationSummary(admin, payload.appointmentId);
  if (!summary) notFound();
  return (
    <BookingConfirmationExperience
      appointmentId={payload.appointmentId}
      initialSummary={summary}
      previewMode
    />
  );
}
