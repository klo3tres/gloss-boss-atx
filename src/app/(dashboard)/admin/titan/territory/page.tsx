import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { TitanPageGuide, TITAN_GUIDES } from '@/components/titan/titan-page-guide';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';

export const dynamic = 'force-dynamic';

export default async function TitanTerritoryPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isAdminLevel(session.profile?.role) || !admin) notFound();

  const [{ data: territories, error: tErr }, { data: locations, error: lErr }] = await Promise.all([
    admin.from('titan_territories').select('*').order('name', { ascending: true }),
    admin.from('titan_territory_locations').select('*').order('updated_at', { ascending: false }).limit(200),
  ]);

  const tablesReady = !tErr && !lErr;

  return (
    <DashboardShell title="Territory Tracker" subtitle="Door knocking & neighborhood outreach — mobile-first" role={session.profile!.role as 'admin' | 'super_admin'} titanMode>
      <div className="space-y-6">
        <TitanPageGuide config={TITAN_GUIDES.territory} />
        {!tablesReady ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            Apply migration <code className="text-gold-soft">000106_titan_polish_foundation.sql</code>.
          </p>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase text-zinc-500">Neighborhoods</p>
                <p className="mt-2 text-3xl font-black text-white">{territories?.length ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase text-zinc-500">Locations tracked</p>
                <p className="mt-2 text-3xl font-black text-white">{locations?.length ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-gold/20 bg-black/45 p-4">
                <p className="text-[10px] font-black uppercase text-gold-soft">Next step</p>
                <p className="mt-2 text-sm text-zinc-300">Add a neighborhood, then log door outcomes from your phone.</p>
              </div>
            </div>
            <ul className="space-y-2">
              {(locations ?? []).slice(0, 30).map((loc) => {
                const r = loc as Record<string, unknown>;
                return (
                  <li key={String(r.id)} className="rounded-xl border border-white/8 bg-black/40 px-4 py-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-white">{String(r.address ?? 'Address')}</span>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-300">{String(r.status ?? 'not_visited')}</span>
                    </div>
                    {r.no_soliciting === true || r.do_not_return === true ? (
                      <p className="mt-1 text-rose-300">DNR / No soliciting</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {(locations ?? []).length === 0 ? (
              <p className="text-sm text-zinc-500">No locations yet — seed a territory in Supabase or add via API (UI form coming next).</p>
            ) : null}
          </>
        )}
        <Link href="/admin/titan" className="inline-block text-xs font-black uppercase text-gold-soft underline">
          ← Titan home
        </Link>
      </div>
    </DashboardShell>
  );
}
