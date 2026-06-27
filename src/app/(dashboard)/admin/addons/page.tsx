import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { isAdminLevel } from '@/lib/auth/roles';
import { AddonsAdminClient, type AddonRow } from '@/components/admin/addons-admin-client';
import { normalizeAddonForPublic } from '@/lib/addons-shared';

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
    let raw: Record<string, unknown>[] | null = null;
    const full = await admin.from('addons').select('*').order('sort_order', { ascending: true });
    if (!full.error && full.data) {
      raw = full.data as Record<string, unknown>[];
    } else if (full.error && /label|name|schema cache|Could not find|column/i.test(full.error.message)) {
      const slim = await admin
        .from('addons')
        .select('id, slug, name, price_cents, active, sort_order')
        .order('sort_order', { ascending: true });
      raw = slim.error ? null : ((slim.data ?? []) as Record<string, unknown>[]);
    }
    rows = (raw ?? []).map((r) => {
      const n = normalizeAddonForPublic(r);
      return {
        id: n.id,
        slug: n.slug,
        label: n.label,
        price_cents: n.price_cents,
        active: Boolean(r.active),
        sort_order: typeof r.sort_order === 'number' ? r.sort_order : n.sort_order,
        estimated_min_minutes: typeof r.estimated_min_minutes === 'number' ? r.estimated_min_minutes : 0,
        estimated_max_minutes: typeof r.estimated_max_minutes === 'number' ? r.estimated_max_minutes : 0,
      };
    });
  }

  return (
    <DashboardShell
      title='Booking add-ons'
      subtitle='Engine bay, pet hair, odor, clay bar — prices and duration estimates sync to booking slots.'
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
