import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanInventoryClient } from '@/components/titan/titan-inventory-client';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { loadInventoryItems } from '@/lib/titan/inventory';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanInventoryPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const inventory = await loadInventoryItems(admin);

  return (
    <DashboardShell
      title='Inventory Operator'
      subtitle='Chemicals, towels, supplies — reorder before jobs stall'
      role={session.profile!.role as 'admin' | 'super_admin'}
      titanMode
    >
      {!inventory.tablesReady ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Apply migration <code className='text-gold-soft'>000105_titan_phase2_foundation.sql</code> in Supabase to enable inventory tracking.
        </p>
      ) : (
        <TitanInventoryClient initialItems={inventory.items} lowStockCount={inventory.lowStock.length} />
      )}
    </DashboardShell>
  );
}
