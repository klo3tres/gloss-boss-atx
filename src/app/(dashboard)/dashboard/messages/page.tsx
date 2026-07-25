import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerMessagesClient } from '@/components/dashboard/customer-messages-client';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { getSessionWithProfile } from '@/lib/auth/session';
import { GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export default async function CustomerMessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ appointment?: string }>;
}) {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login');
  if (!canAccessCustomerPortal(session.profile?.role)) redirect('/login');
  const params = await searchParams;
  const appointmentId = typeof params.appointment === 'string' ? params.appointment.trim() : '';

  return (
    <DashboardShell
      title='Messages'
      subtitle={`Messages go directly to Gloss Boss ATX support at ${GLOSS_BOSS_SUPPORT_EMAIL}.`}
      role='customer'
    >
      <CustomerMessagesClient customerEmail={session.user.email ?? ''} initialAppointmentId={appointmentId || undefined} />
    </DashboardShell>
  );
}
