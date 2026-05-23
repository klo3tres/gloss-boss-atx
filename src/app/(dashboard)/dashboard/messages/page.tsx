import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { CustomerMessagesClient } from '@/components/dashboard/customer-messages-client';
import { canAccessCustomerPortal } from '@/lib/auth/customer-portal';
import { getSessionWithProfile } from '@/lib/auth/session';
import { GLOSS_BOSS_SUPPORT_EMAIL } from '@/lib/branding';

export const dynamic = 'force-dynamic';

export default async function CustomerMessagesPage() {
  const session = await getSessionWithProfile();
  if (!session.user) redirect('/login');
  if (!canAccessCustomerPortal(session.profile?.role)) redirect('/login');

  return (
    <DashboardShell
      title='Messages'
      subtitle={`Messages go directly to Gloss Boss ATX support at ${GLOSS_BOSS_SUPPORT_EMAIL}.`}
      role='customer'
    >
      <CustomerMessagesClient customerEmail={session.user.email ?? ''} />
    </DashboardShell>
  );
}
