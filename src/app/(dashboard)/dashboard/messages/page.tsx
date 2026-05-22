import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerMessagesClient } from '@/components/dashboard/customer-messages-client';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { getSessionWithProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function CustomerMessagesPage() {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login');
  if (!canAccessCustomerPortal(session.profile?.role)) redirect('/login');

  return (
    <DashboardShell title='Messages' subtitle='Contact Gloss Boss ATX — replies appear here.' role='customer'>
      <CustomerMessagesClient customerEmail={session.user.email ?? ''} />
    </DashboardShell>
  );
}
