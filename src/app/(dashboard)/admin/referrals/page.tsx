import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminTitanHero } from '@/components/titan/admin-titan-hero';
import { ReferralsAdminClient } from '@/components/admin/referrals-admin-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { loadReferralProgramSettings } from '@/lib/referral/referral-codes';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AdminReferralsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role ?? null) || !admin) notFound();

  const settings = await loadReferralProgramSettings(admin);
  const [{ data: events }, { data: rewards }, { count: codeCount }] = await Promise.all([
    admin.from('referral_events').select('*').order('created_at', { ascending: false }).limit(50),
    admin.from('referral_rewards').select('*').order('created_at', { ascending: false }).limit(50),
    admin.from('customer_referral_codes').select('id', { count: 'exact', head: true }),
  ]);

  const completed = (events ?? []).filter((e) => e.status === 'completed' || e.status === 'reward_issued').length;
  const booked = (events ?? []).filter((e) => e.status === 'booked' || e.status === 'completed' || e.status === 'reward_issued').length;

  return (
    <DashboardShell title="Referrals" subtitle="Reward customers for sending business." role="admin">
      <AdminTitanHero
        title="Referral & review rewards"
        sentence="Configure referrer rewards, track referrals, and issue rewards when jobs complete."
        kpi={codeCount ?? 0}
        kpiHint={`${booked} booked · ${completed} completed · ${(rewards ?? []).length} rewards logged`}
        primaryHref="/admin/customers"
        primaryLabel="Customers"
      />
      <ReferralsAdminClient settings={settings} events={(events ?? []) as Record<string, unknown>[]} rewards={(rewards ?? []) as Record<string, unknown>[]} />
    </DashboardShell>
  );
}
