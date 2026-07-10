import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { FleetScannerClient } from '@/components/admin/fleet-scanner-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

export default async function FleetScannerPage() {
  const session = await getSessionWithProfile();
  if (!session.user || !isStaffRole(session.profile?.role)) notFound();

  return (
    <DashboardShell title="Fleet Scanner" subtitle="Commercial prospect discovery for Gloss Boss ATX" role={session.profile!.role as 'admin' | 'super_admin' | 'technician'}>
      <p className="mb-4 text-xs text-muted-foreground">
        <Link href="/admin/fleet" className="text-gold-soft hover:underline">
          ← Fleet hub
        </Link>
      </p>
      <FleetScannerClient />
    </DashboardShell>
  );
}
