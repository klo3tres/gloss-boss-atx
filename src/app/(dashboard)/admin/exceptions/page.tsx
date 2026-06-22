import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { ExceptionInboxClient } from '@/components/admin/exception-inbox-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { loadOperationsSnapshot } from '@/lib/operations-snapshot';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminExceptionsPage({
  searchParams,
}: {
  searchParams?: Promise<{ category?: string }>;
}) {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const params = searchParams ? await searchParams : {};
  const snapshot = await loadOperationsSnapshot(admin);

  return (
    <DashboardShell
      title="Exception Inbox"
      subtitle="Every broken, unmatched, unpaid, or undelivered business event in one queue."
      role="admin"
    >
      <ExceptionInboxClient snapshot={snapshot} initialCategory={params.category ?? null} />
    </DashboardShell>
  );
}
