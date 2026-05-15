import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';

export const dynamic = 'force-dynamic';

type ProfileRow = { id: string; full_name: string | null; role: string; created_at: string };

export default async function AdminTeamPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let staff: ProfileRow[] = [];
  let err: string | null = null;

  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, role, created_at')
      .in('role', ['super_admin', 'admin', 'technician'])
      .order('role', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      err = error.message;
      console.warn('[CRM_DEBUG_DB]', 'team_roster', error.message);
    } else {
      staff = (data ?? []) as ProfileRow[];
    }
  }

  return (
    <DashboardShell title='Team roster' subtitle='Staff profiles (roles managed from Super command center).' role='admin'>
      {err ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>Could not load team: {err}</p>
      ) : null}

      <div className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-sm text-zinc-400'>
          Technicians and admins appear here. To <span className='text-gold-soft'>promote or demote roles</span>, use the Super admin command center.
        </p>
        <div className='mt-4 overflow-x-auto'>
          <table className='w-full min-w-[560px] border-collapse text-left text-sm'>
            <thead>
              <tr className='border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500'>
                <th className='py-2 pr-3'>Name</th>
                <th className='py-2 pr-3'>Role</th>
                <th className='py-2 pr-3'>Profile ID</th>
                <th className='py-2'>Since</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id} className='border-b border-white/5 text-zinc-200'>
                  <td className='py-2 pr-3 font-medium text-white'>{p.full_name?.trim() || '—'}</td>
                  <td className='py-2 pr-3'>
                    <span className='rounded-full border border-gold/30 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft'>{p.role}</span>
                  </td>
                  <td className='py-2 pr-3 font-mono text-xs text-zinc-500'>{p.id}</td>
                  <td className='py-2 text-xs text-zinc-500'>{new Date(p.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {staff.length === 0 && !err ? <p className='mt-4 text-sm text-zinc-500'>No staff profiles found.</p> : null}
        </div>
        {session.profile?.role === 'super_admin' ? (
          <Link href='/admin/super' className='mt-6 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
            Open command center (role changes)
          </Link>
        ) : null}
      </div>

      <Link href='/admin' className='mt-8 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
