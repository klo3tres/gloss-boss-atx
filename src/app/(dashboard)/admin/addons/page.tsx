import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { isAdminLevel } from '@/lib/auth/roles';
import { AddonsAdminClient, type AddonRow } from '@/components/admin/addons-admin-client';

export const dynamic = 'force-dynamic';

export default async function AdminAddonsPage() {
  const session = await getSessionWithProfile();
  if (!session.supabaseConfigured || !isAdminLevel(session.profile?.role ?? null)) {
    return (
      <DashboardShell title='Add-ons' subtitle='Admin access required.' role='admin'>
        <p className='text-sm text-zinc-400'>Sign in as admin to manage booking add-ons.</p>
      </DashboardShell>
    );
  }

  const admin = tryCreateAdminSupabase();
  let rows: AddonRow[] = [];
  if (admin) {
    const { data } = await admin.from('addons').select('id, slug, label, price_cents, active, sort_order').order('sort_order', { ascending: true });
    rows = (data ?? []).map((r: Record<string, unknown>) => ({
      id: String(r.id),
      slug: String(r.slug ?? ''),
      label: String(r.label ?? ''),
      price_cents: typeof r.price_cents === 'number' ? r.price_cents : 0,
      active: Boolean(r.active),
      sort_order: typeof r.sort_order === 'number' ? r.sort_order : 0,
    }));
  }

  return (
    <DashboardShell
      title='Booking add-ons'
      subtitle='Engine bay, pet hair, odor, clay bar — prices sync to public booking and field quotes.'
      role='admin'
    >
      {!admin ? (
        <p className='rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Service role client unavailable. Set <code className='text-gold-soft'>SUPABASE_SERVICE_ROLE_KEY</code> to edit add-ons.
        </p>
      ) : (
        <AddonsAdminClient initialRows={rows} />
      )}
      <Link href='/admin' className='mt-8 inline-block text-xs font-bold uppercase text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
