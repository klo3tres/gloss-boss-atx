import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { OperationsFoundation } from '@/components/admin/operations-foundation';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { loadOperationsSnapshot } from '@/lib/operations-snapshot';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminDailyOperationsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const snapshot = await loadOperationsSnapshot(admin);

  return (
    <DashboardShell
      title="Daily Operations"
      subtitle="Today, tomorrow, and this week — every metric is actionable."
      role="admin"
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Link href="/admin" className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white">
          Owner dashboard
        </Link>
        <Link href="/admin/exceptions" className="rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:border-gold/50">
          Exception inbox
        </Link>
        <Link href="/admin/calendar" className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white">
          Calendar
        </Link>
        <Link href="/admin/dispatch" className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white">
          Dispatch
        </Link>
      </div>
      <OperationsFoundation snapshot={snapshot} mode="daily-ops" />
    </DashboardShell>
  );
}
