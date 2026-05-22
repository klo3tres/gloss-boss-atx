import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerMessagesClient } from '@/components/dashboard/customer-messages-client';
import { getSessionWithProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function CustomerMessagesPage() {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login');
  if (session.profile?.role !== 'customer') redirect('/dashboard');

  return (
    <DashboardShell title='Messages' subtitle='Contact Gloss Boss ATX — replies appear here.' role='customer'>
      <CustomerMessagesClient customerEmail={session.user.email ?? ''} />
    </DashboardShell>
  );
}
