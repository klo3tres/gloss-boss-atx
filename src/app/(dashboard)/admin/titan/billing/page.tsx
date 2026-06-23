import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanBillingClient } from '@/components/titan/titan-billing-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadTitanWorkspace } from '@/lib/titan/workspace';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanBillingPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const workspace = await loadTitanWorkspace(admin);

  const { data: plans } = await admin
    .from('titan_subscription_plans')
    .select('*')
    .order('sort_order', { ascending: true });

  const mapped = (plans ?? []).map((p) => {
    const row = p as Record<string, unknown>;
    const features = row.features;
    return {
      id: String(row.id),
      name: String(row.name),
      priceCents: Number(row.price_cents ?? 0),
      features: Array.isArray(features) ? features.map(String) : [],
    };
  });

  const fallback = [
    { id: 'starter', name: 'Titan Starter', priceCents: 4900, features: ['Daily Manager', 'Outreach Engine', 'Goal Engine'] },
    { id: 'growth', name: 'Titan Growth', priceCents: 14900, features: ['Everything in Starter', 'Deal Room', 'Attribution', 'Territory'] },
    { id: 'scale', name: 'Titan Scale', priceCents: 29900, features: ['Everything in Growth', 'Fleet Engine', 'Multi-user', 'White label'] },
  ];

  return (
    <DashboardShell title="Titan Billing" subtitle="Subscription plans" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <TitanBillingClient
        currentTier={workspace.subscriptionTier}
        subscriptionStatus={workspace.subscriptionStatus}
        plans={mapped.length ? mapped : fallback}
      />
    </DashboardShell>
  );
}
