import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { FollowUpEngineClient } from '@/components/admin/follow-up-engine-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { loadFollowUpDashboard } from '@/lib/follow-up-engine';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminFollowUpsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const dashboard = await loadFollowUpDashboard(admin);

  return (
    <DashboardShell
      title="Follow-up engine"
      subtitle="Automated 30 / 60 / 90-day maintenance and win-back messages — the revenue loop that runs without you."
      role="admin"
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/admin/leads"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
        >
          Leads
        </Link>
        <Link
          href="/admin/customers"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
        >
          Customers
        </Link>
        <Link
          href="/admin/notifications"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
        >
          Notification log
        </Link>
        <Link
          href="/admin/exceptions"
          className="rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:border-gold/50"
        >
          Exception inbox
        </Link>
      </div>
      <FollowUpEngineClient dashboard={dashboard} />
    </DashboardShell>
  );
}
