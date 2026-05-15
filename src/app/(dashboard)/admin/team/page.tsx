import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { submitCreateStaffForm } from '@/lib/admin/staff-create-actions';
import { submitPromoteRoleFromTeamForm } from '@/lib/admin/super-team-actions';
import { submitResetStaffPasswordForm } from '@/lib/admin/staff-password-actions';

export const dynamic = 'force-dynamic';

type ProfileRow = { id: string; full_name: string | null; email: string | null; role: string; created_at: string };

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
    email: typeof raw.email === 'string' ? raw.email : null,
    role: String(raw.role ?? 'customer'),
    created_at: typeof raw.created_at === 'string' ? raw.created_at : '',
  };
}

function displayName(p: ProfileRow): string {
  const fn = p.full_name?.trim();
  if (fn) return fn;
  const em = p.email?.trim();
  if (em) return em.split('@')[0] || em;
  return 'Team member';
}

export default async function AdminTeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const staffOk = firstParam(sp.staffOk);
  const staffErr = firstParam(sp.staffErr);
  const pwdOk = firstParam(sp.pwdOk);
  const pwdErr = firstParam(sp.pwdErr);
  const roleOk = firstParam(sp.roleOk);
  const roleErr = firstParam(sp.roleErr);
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let staff: ProfileRow[] = [];
  let err: string | null = null;

  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const full = await supabase
      .from('profiles')
      .select('*')
      .in('role', ['super_admin', 'admin', 'technician'])
      .order('role', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200);

    if (full.error) {
      const lean = await supabase
        .from('profiles')
        .select('id, role, created_at')
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
      {staffOk === '1' ? (
        <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100' role='status'>
          Staff account created. They can sign in with the email and temporary password you set. Ask them to change the password after first login.
        </p>
      ) : null}
      {staffOk === 'invite' ? (
        <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100' role='status'>
          Invitation sent. The teammate completes signup from their email link; their role is already assigned in profiles.
        </p>
      ) : null}
      {staffErr ? (
        <p className='mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100' role='alert'>
          {decodeURIComponent(staffErr)}
        </p>
      ) : null}
      {pwdOk ? (
        <p className='mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-100' role='status'>
          Password reset. Share the new temporary password securely with the teammate.
        </p>
      ) : null}
      {pwdErr ? (
        <p className='mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100' role='alert'>
          {decodeURIComponent(pwdErr)}
        </p>
      ) : null}
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
          <span className='text-gold-soft'>reset passwords</span>, and <span className='text-gold-soft'>create technicians</span> below.
        </p>
        <div className='mt-4 overflow-x-auto'>
          <table className='w-full min-w-[720px] border-collapse text-left text-sm'>
            <thead>
              <tr className='border-b border-white/10 text-xs uppercase tracking-wider text-zinc-500'>
                <th className='py-2 pr-3'>Name</th>
                <th className='py-2 pr-3'>Role</th>
                <th className='py-2 pr-3'>Profile ID</th>
                <th className='py-2 pr-3'>Since</th>
                {isSuper ? <th className='py-2'>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.id} className='border-b border-white/5 text-zinc-200'>
                  <td className='py-2 pr-3 font-medium text-white'>{displayName(p)}</td>
                  <td className='py-2 pr-3'>
                    <span className='rounded-full border border-gold/30 px-2 py-0.5 text-[10px] font-bold uppercase text-gold-soft'>{p.role}</span>
                  </td>
                  <td className='py-2 pr-3 font-mono text-xs text-zinc-500'>{p.id}</td>
                  <td className='py-2 pr-3 text-xs text-zinc-500'>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                  {isSuper ? (
                    <td className='py-2 align-top'>
                      <div className='flex min-w-[220px] flex-col gap-2'>
                        <form action={submitPromoteRoleFromTeamForm} className='flex flex-wrap items-center gap-1'>
                          <input type='hidden' name='profileId' value={p.id} />
                          <select name='role' defaultValue={p.role} className='rounded border border-zinc-700 bg-black px-2 py-1 text-[11px] text-white'>
                            <option value='technician'>technician</option>
                            <option value='admin'>admin</option>
                            <option value='super_admin'>super_admin</option>
                            <option value='customer'>customer</option>
                          </select>
                          <button type='submit' className='rounded border border-gold/40 px-2 py-1 text-[10px] font-bold uppercase text-gold-soft'>
                            Assign role
                          </button>
                        </form>
                        <form action={submitResetStaffPasswordForm} className='flex flex-wrap items-center gap-1'>
                          <input type='hidden' name='userId' value={p.id} />
                          <input
                            name='password'
                            type='password'
                            minLength={8}
                            placeholder='New temp password'
                            autoComplete='new-password'
                            className='min-w-0 flex-1 rounded border border-zinc-700 bg-black px-2 py-1 text-[11px] text-white'
                          />
                          <button type='submit' className='rounded border border-white/20 px-2 py-1 text-[10px] font-bold uppercase text-zinc-200'>
                            Reset
                          </button>
                        </form>
                      </div>
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
            <p className='mt-2 text-xs text-zinc-500'>Creates a Supabase auth user, assigns role on profile, and allows immediate login (or invite fallback).</p>
            <form action={submitCreateStaffForm} className='mt-4 grid gap-3 sm:grid-cols-2'>
              <label className='block text-xs text-zinc-400 sm:col-span-2'>
                Work email
                <input
                  name='email'
                  type='email'
                  required
                  autoComplete='off'
                  className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                />
              </label>
              <label className='block text-xs text-zinc-400 sm:col-span-2'>
                Temporary password (min 8 characters)
                <input
                  name='password'
                  type='password'
                  required
                  minLength={8}
                  autoComplete='new-password'
                  className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'
                />
              </label>
              <label className='block text-xs text-zinc-400 sm:col-span-2'>
                Role
                <select name='role' required className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
                  <option value='technician'>Technician</option>
                  <option value='admin'>Admin</option>
                  <option value='super_admin'>Super admin</option>
                </select>
              </label>
              <button
                type='submit'
                className='sm:col-span-2 rounded-lg bg-gold px-4 py-3 text-xs font-black uppercase tracking-wider text-black'
              >
                Create staff account
              </button>
            </form>
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
