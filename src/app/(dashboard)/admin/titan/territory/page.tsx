import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanPageGuide, TITAN_GUIDES } from '@/components/titan/titan-page-guide';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

/** Territory create/edit UI is incomplete — show read-only intelligence or redirect to Hunt. */
export default async function TitanTerritoryPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const [{ data: territories, error: tErr }, { data: locations, error: lErr }] = await Promise.all([
    admin.from('titan_territories').select('*').order('name', { ascending: true }),
    admin.from('titan_territory_locations').select('*').order('updated_at', { ascending: false }).limit(200),
  ]);

  const tablesReady = !tErr && !lErr;
  const hasData = (territories?.length ?? 0) > 0 || (locations?.length ?? 0) > 0;

  if (tablesReady && !hasData) {
    redirect('/admin/titan/lead-radar');
  }

  return (
    <DashboardShell
      title="Territory Tracker"
      subtitle="Neighborhood outreach log (read-only until create UI ships)"
      role={session.profile!.role as 'admin' | 'super_admin'}
      titanMode
    >
      <div className="space-y-6">
        <TitanPageGuide config={TITAN_GUIDES.territory} />
        {!tablesReady ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
            Apply migration <code className="text-gold-soft">000106_titan_polish_foundation.sql</code>, then use{' '}
            <Link href="/admin/titan/lead-radar" className="underline">
              Lead Radar
            </Link>{' '}
            for live prospect discovery.
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Neighborhoods</p>
                <p className="mt-2 text-3xl font-black text-foreground">{territories?.length ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[10px] font-black uppercase text-muted-foreground">Locations tracked</p>
                <p className="mt-2 text-3xl font-black text-foreground">{locations?.length ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-gold/20 bg-card p-4">
                <p className="text-[10px] font-black uppercase text-gold-soft">Discover more</p>
                <Link href="/admin/titan/lead-radar" className="mt-2 inline-block text-sm font-bold text-foreground underline">
                  Open Lead Radar / Hunt →
                </Link>
              </div>
            </div>
            <ul className="space-y-2">
              {(locations ?? []).slice(0, 30).map((loc) => {
                const r = loc as Record<string, unknown>;
                return (
                  <li key={String(r.id)} className="rounded-xl border border-border bg-card px-4 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-foreground">{String(r.address ?? 'Address')}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[9px] font-black uppercase text-muted-foreground">
                        {String(r.status ?? 'not_visited')}
                      </span>
                    </div>
                    {r.no_soliciting === true || r.do_not_return === true ? (
                      <p className="mt-1 text-rose-600 dark:text-rose-300">DNR / No soliciting</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <Link href="/admin/titan?workspace=growth" className="inline-block text-xs font-black uppercase text-gold-soft underline">
          ← Titan home
        </Link>
      </div>
    </DashboardShell>
  );
}
