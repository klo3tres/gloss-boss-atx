import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { FinancialCloseoutClient } from '@/components/admin/financial-closeout-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { buildCloseoutDraft, listCloseoutHistory, loadMoneyPulse } from '@/lib/financial-closeout';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function AdminFinancialCloseoutPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const [pulse, dailyDraft, monthlyDraft, history] = await Promise.all([
    loadMoneyPulse(admin),
    buildCloseoutDraft(admin, 'daily'),
    buildCloseoutDraft(admin, 'monthly'),
    listCloseoutHistory(admin, 40),
  ]);

  return (
    <DashboardShell
      title="Financial Closeout"
      subtitle="Close the day or month with a permanent money record — not another dashboard."
      role="admin"
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <Link
          href="/admin/revenue"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
        >
          Revenue detail
        </Link>
        <Link
          href="/admin/exceptions"
          className="rounded-lg border border-gold/30 px-3 py-1.5 text-[10px] font-black uppercase text-gold-soft hover:border-gold/50"
        >
          Exception inbox
        </Link>
        <Link
          href="/admin/operations"
          className="rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-400 hover:text-white"
        >
          Expenses & mileage
        </Link>
      </div>
      <FinancialCloseoutClient pulse={pulse} dailyDraft={dailyDraft} monthlyDraft={monthlyDraft} history={history} />
    </DashboardShell>
  );
}
