import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { SuperAdminDashboard } from '@/components/dashboard/super-admin-dashboard';
import { TitanCommandCenter } from '@/components/admin/titan-command-center';
import { getSessionWithProfile } from '@/lib/auth/session';
import { loadTitanBriefing } from '@/lib/titan-briefing';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function SuperAdminDashboardPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || session.profile?.role !== 'super_admin' || !admin) notFound();

  const ownerName = session.profile?.full_name ?? session.user.email?.split('@')[0] ?? null;
  const briefing = await loadTitanBriefing(admin, ownerName);

  return (
    <DashboardShell
      title="Super admin command center"
      subtitle="Titan Beta — the operating system running Gloss Boss ATX."
      role="super_admin"
    >
      <TitanCommandCenter briefing={briefing} />
      <div className="my-10 border-t border-white/5 pt-10">
        <p className="mb-6 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">Platform diagnostics</p>
        <SuperAdminDashboard />
      </div>
    </DashboardShell>
  );
}
