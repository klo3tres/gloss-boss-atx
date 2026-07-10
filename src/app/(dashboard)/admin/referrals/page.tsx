import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { AdminTitanHero } from '@/components/titan/admin-titan-hero';
import { ReferralsAdminClient } from '@/components/admin/referrals-admin-client';
import { ReferralLeaderboardPanel, type ReferralLeaderboardRow } from '@/components/admin/referral-leaderboard-panel';
import { ReferralTreePanel, type ReferralTreeNode } from '@/components/admin/referral-tree-panel';
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

  const leaderboardMap = new Map<string, ReferralLeaderboardRow>();
  for (const ev of events ?? []) {
    const row = ev as Record<string, unknown>;
    const cid = String(row.referrer_customer_id ?? '');
    if (!cid) continue;
    const existing = leaderboardMap.get(cid) ?? {
      customerId: cid,
      name: String(row.referrer_name ?? 'Customer'),
      completedReferrals: 0,
      pendingReferrals: 0,
      rewardsEarnedCents: 0,
    };
    const status = String(row.status ?? '');
    if (status === 'completed' || status === 'reward_issued') existing.completedReferrals += 1;
    else if (status === 'booked' || status === 'pending') existing.pendingReferrals += 1;
    leaderboardMap.set(cid, existing);
  }
  for (const rw of rewards ?? []) {
    const row = rw as Record<string, unknown>;
    const cid = String(row.customer_id ?? '');
    if (!cid) continue;
    const existing = leaderboardMap.get(cid) ?? {
      customerId: cid,
      name: 'Customer',
      completedReferrals: 0,
      pendingReferrals: 0,
      rewardsEarnedCents: 0,
    };
    existing.rewardsEarnedCents += Number(row.reward_value ?? 0) * (String(row.reward_type) === 'dollar' ? 100 : 0);
    leaderboardMap.set(cid, existing);
  }
  const leaderboard = [...leaderboardMap.values()]
    .sort((a, b) => b.completedReferrals - a.completedReferrals || b.rewardsEarnedCents - a.rewardsEarnedCents)
    .slice(0, 10);

  const treeNodes: ReferralTreeNode[] = (events ?? []).slice(0, 40).map((ev) => {
    const row = ev as Record<string, unknown>;
    const referrerEmail = String(row.referrer_email ?? '').toLowerCase();
    const referredEmail = String(row.referred_email ?? row.referee_email ?? '').toLowerCase();
    const fraudFlags: string[] = [];
    if (referrerEmail && referredEmail && referrerEmail === referredEmail) fraudFlags.push('Same email on referrer and friend');
    if (referrerEmail && referredEmail && referrerEmail.split('@')[1] === referredEmail.split('@')[1] && referrerEmail.split('@')[0] === referredEmail.split('@')[0]) {
      fraudFlags.push('Possible self-referral pattern');
    }
    if (String(row.status) === 'pending' && row.created_at && Date.now() - new Date(String(row.created_at)).getTime() > 90 * 86400000) {
      fraudFlags.push('Pending over 90 days — may be expired');
    }
    return {
      id: String(row.id),
      referrerName: String(row.referrer_name ?? 'Customer'),
      referredName: String(row.referred_name ?? row.referee_name ?? ''),
      status: String(row.status ?? 'pending'),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      rewardCents: Number(row.reward_value_cents ?? 0),
      fraudFlags,
    };
  });

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
      <section className="mb-6 rounded-3xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Referral tree</p>
        <p className="mt-1 text-xs text-muted-foreground">Pending, completed, and flagged referrals.</p>
        <div className="mt-3">
          <ReferralTreePanel nodes={treeNodes} />
        </div>
      </section>
      <section className="mb-6 rounded-3xl border border-border bg-card p-5">
        <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft">Referral leaderboard</p>
        <div className="mt-3">
          <ReferralLeaderboardPanel rows={leaderboard} />
        </div>
      </section>
      <ReferralsAdminClient settings={settings} events={(events ?? []) as Record<string, unknown>[]} rewards={(rewards ?? []) as Record<string, unknown>[]} />
    </DashboardShell>
  );
}
