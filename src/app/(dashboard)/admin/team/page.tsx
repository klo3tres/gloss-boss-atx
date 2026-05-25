import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { CreateStaffClient, StaffRowSuperClient } from './team-super-client';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  role: string;
  created_at: string;
  active: boolean;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function mapProfileRow(raw: Record<string, unknown>): ProfileRow | null {
  const id = String(raw.id ?? '').trim();
  if (!id) return null;
  return {
    id,
    full_name: typeof raw.full_name === 'string' ? raw.full_name : null,
    display_name: typeof raw.display_name === 'string' ? raw.display_name : null,
    email: typeof raw.email === 'string' ? raw.email : null,
    role: String(raw.role ?? 'customer'),
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
    active: raw.active === false ? false : true,
  };
}

function displayName(p: ProfileRow): string {
  const dn = p.display_name?.trim();
  if (dn) return dn;
  const fn = p.full_name?.trim();
  if (fn) return fn;
  const em = p.email?.trim();
  if (em) return em.split('@')[0] || em;
  return 'Team member';
}

export default async function AdminTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const roleOk = firstParam(sp.roleOk);
  const roleErr = firstParam(sp.roleErr);
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let staff: ProfileRow[] = [];
  let err: string | null = null;

  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const db = tryCreateAdminSupabase() ?? supabase;
    const full = await db
      .from('profiles')
      .select('*')
      .in('role', ['super_admin', 'admin', 'technician'])
      .order('role', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200);

    if (full.error) {
      const lean = await db
        .from('profiles')
        .select('id, role, created_at, full_name, display_name, email')
        .in('role', ['super_admin', 'admin', 'technician'])
        .order('role', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(200);
      if (lean.error) {
        err = lean.error.message;
        console.warn('[CRM_DEBUG_DB]', 'team_roster', lean.error.message);
      } else {
        staff = (lean.data ?? [])
          .map((r) => mapProfileRow(r as Record<string, unknown>))
          .filter((x): x is ProfileRow => x != null);
      }
    } else {
      staff = (full.data ?? [])
        .map((r) => mapProfileRow(r as Record<string, unknown>))
        .filter((x): x is ProfileRow => x != null);
    }

    if (staff.length <= 1 && isAdminLevel(session.profile?.role ?? null)) {
      const adminClient = tryCreateAdminSupabase();
      if (adminClient) {
        const svc = await adminClient
          .from('profiles')
          .select('*')
          .in('role', ['super_admin', 'admin', 'technician'])
          .order('role', { ascending: true })
          .limit(200);
        if (!svc.error && (svc.data?.length ?? 0) > staff.length) {
          staff = (svc.data ?? [])
            .map((r) => mapProfileRow(r as Record<string, unknown>))
            .filter((x): x is ProfileRow => x != null);
        }
      }
    }
  }

  const isSuper = session.profile?.role === 'super_admin';

  return (
    <DashboardShell title='Team roster' subtitle='Staff profiles, roles, and technician accounts.' role='admin'>
      {roleOk ? (
        <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100' role='status'>
          Role updated.
        </p>
      ) : null}
      {roleErr ? (
        <p className='mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100' role='alert'>
          {decodeURIComponent(roleErr)}
        </p>
      ) : null}
      {err ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>Could not load team: {err}</p>
      ) : null}

      <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-sm text-zinc-400'>
          Technicians and admins appear here. Super admins can <span className='text-gold-soft'>assign roles</span>,{' '}
          <span className='text-gold-soft'>reset passwords</span>, <span className='text-gold-soft'>edit display names</span>, and{' '}
          <span className='text-gold-soft'>create staff</span> below — feedback is shown inline (no page redirects).
        </p>
        <div className='gb-admin-table-wrap mt-4'>
          <table className='w-full min-w-[720px] border-collapse text-left text-sm'>
            <thead>
              <tr className='border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500'>
                <th className='py-2 pr-3'>Name</th>
                <th className='py-2 pr-3'>Role</th>
                <th className='py-2 pr-3'>Profile ID</th>
                <th className='py-2 pr-3'>Active</th>
                <th className='py-2 pr-3'>Since</th>
                {isSuper ? <th className='py-2'>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id} className='border-b border-white/5 text-zinc-200'>
                  <td className='py-2 pr-3 font-medium text-white'>
                    <Link href={`/admin/team/${encodeURIComponent(p.id)}`} className='hover:text-gold-soft hover:underline'>
                      {displayName(p)}
                    </Link>
                  </td>
                  <td className='py-2 pr-3'>
                    <span className='rounded-full border border-gold/30 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft'>{p.role}</span>
                  </td>
                  <td className='py-2 pr-3 font-mono text-xs text-zinc-500'>{p.id}</td>
                  <td className='py-2 pr-3 text-xs'>
                    {p.active ? (
                      <span className='rounded-full border border-emerald-500/40 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300'>
                        Active
                      </span>
                    ) : (
                      <span className='rounded-full border border-rose-500/40 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-200'>
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className='py-2 pr-3 text-xs text-zinc-500'>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                  {isSuper ? (
                    <td className='py-2 align-top'>
                      <StaffRowSuperClient
                        profileId={p.id}
                        initialRole={p.role}
                        initialDisplayName={displayName(p)}
                        initialActive={p.active}
                        currentUserId={session.user?.id ?? ''}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          {staff.length === 0 && !err ? <p className='mt-4 text-sm text-zinc-500'>No staff profiles found.</p> : null}
        </div>
        {isSuper ? (
          <section className='mt-8 rounded-2xl border border-gold/25 bg-black/40 p-5'>
            <h2 className='text-sm font-bold uppercase tracking-wider text-gold-soft'>Create technician (or admin)</h2>
            <p className='mt-2 text-xs text-zinc-500'>
              Creates a Supabase auth user, assigns role on profile, and allows immediate login (or invite fallback). Password must be at least 8 characters.
            </p>
            <CreateStaffClient />
          </section>
        ) : null}

        {isSuper ? (
          <Link href='/admin/super' className='mt-6 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
            Open command center (metrics)
          </Link>
        ) : null}
      </div>

      <Link href='/admin' className='mt-8 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
