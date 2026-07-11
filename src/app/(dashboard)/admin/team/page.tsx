import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { CreateStaffClient, StaffInviteClient, PendingInvitesClient, StaffRowSuperClient } from './team-super-client';
import { listStaffInvites } from '@/lib/staff-invites';

export const dynamic = 'force-dynamic';

type ProfileRow = {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
  phone: string | null;
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
    phone: typeof raw.phone === 'string' ? raw.phone : null,
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
  const isSuper = session.profile?.role === 'super_admin';

  let staff: ProfileRow[] = [];
  let err: string | null = null;
  let pendingInvites: Awaited<ReturnType<typeof listStaffInvites>> = [];

  const staffRoles = ['super_admin', 'admin', 'dispatcher', 'technician', 'viewer'];

  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const db = tryCreateAdminSupabase() ?? supabase;
    const full = await db
      .from('profiles')
      .select('*')
      .in('role', staffRoles)
      .order('role', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(200);

    if (full.error) {
      const lean = await db
        .from('profiles')
        .select('id, role, created_at, full_name, display_name, email, phone')
        .in('role', staffRoles)
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
          .in('role', staffRoles)
          .order('role', { ascending: true })
          .limit(200);
        if (!svc.error && (svc.data?.length ?? 0) > staff.length) {
          staff = (svc.data ?? [])
            .map((r) => mapProfileRow(r as Record<string, unknown>))
            .filter((x): x is ProfileRow => x != null);
        }
      }
    }

    if (isSuper) {
      const adminClient = tryCreateAdminSupabase();
      if (adminClient) pendingInvites = await listStaffInvites(adminClient);
    }
  }

  const pendingByEmail = new Map(
    pendingInvites
      .filter((i) => i.status === 'pending' && i.email)
      .map((i) => [i.email!.trim().toLowerCase(), i.id] as const),
  );

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

      <div className='space-y-6'>
        {/* CRM Info Banner */}
        <div className='gb-premium-card rounded-3xl border border-white/5 bg-zinc-950/45 p-5 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4'>
          <div className='max-w-xl'>
            <p className='text-xs font-black uppercase tracking-[0.25em] text-gold-soft'>Team Management Panel</p>
            <p className='mt-2 text-xs text-zinc-400 leading-relaxed'>
              Configure access tokens, set roles, adjust display profiles, and review active technician assignments. 
              Changes persist instantly inside active database session logs.
            </p>
          </div>
          <span className="rounded-full bg-white/5 border border-white/10 px-3.5 py-1 text-xs text-zinc-300 font-bold shrink-0 self-start md:self-center">
            {staff.length} Active Staff Members
          </span>
        </div>

        {/* Profile cards grid */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {staff.map((p) => {
            const initials = displayName(p)
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            return (
              <div 
                key={p.id}
                className='relative group flex flex-col justify-between rounded-2xl border border-white/5 bg-zinc-950/40 p-5 hover:border-gold/30 hover:shadow-[0_0_24px_rgba(212,175,55,0.06)] transition duration-300'
              >
                <div>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='flex items-center gap-3 min-w-0'>
                      <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/10 border border-gold/20 text-gold-soft font-black text-sm group-hover:border-gold/40 transition'>
                        {initials}
                      </div>
                      <div className='min-w-0'>
                        <h3 className='font-bold text-white group-hover:text-gold-soft transition truncate leading-snug'>
                          {displayName(p)}
                        </h3>
                        <p className='text-xs text-zinc-500 truncate mt-0.5'>{p.email}</p>
                      </div>
                    </div>

                    <span className='rounded-full border border-gold/30 px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-gold-soft shrink-0'>
                      {p.role.replace('_', ' ')}
                    </span>
                  </div>

                  <div className='mt-4 space-y-2 border-t border-white/5 pt-3.5 text-xs text-zinc-400'>
                    <div className='flex items-center justify-between'>
                      <span className='text-zinc-500'>Profile Status</span>
                      {p.active ? (
                        <span className='rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[8px] font-black uppercase text-emerald-300 tracking-wider'>
                          Active Duty
                        </span>
                      ) : (
                        <span className='rounded-full bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 text-[8px] font-black uppercase text-rose-300 tracking-wider'>
                          Suspended
                        </span>
                      )}
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-zinc-500'>Since</span>
                      <span className='text-zinc-300 font-medium'>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</span>
                    </div>
                    <div className='flex items-center justify-between'>
                      <span className='text-zinc-500'>Internal ID</span>
                      <span className='font-mono text-[10px] text-zinc-500'>{p.id.slice(0, 12)}…</span>
                    </div>
                  </div>
                </div>

                {/* Super-admin account actions toggler */}
                {isSuper && (
                  <details className='mt-4 pt-3 border-t border-white/5 text-xs group'>
                    <summary className='cursor-pointer text-[10px] font-black uppercase tracking-wider text-zinc-500 hover:text-gold-soft transition flex items-center justify-between select-none'>
                      <span>System Credentials</span>
                      <span className='rounded-md border border-white/10 px-2 py-0.5 text-[8px] bg-zinc-950/40 group-open:bg-zinc-900 transition'>Manage User</span>
                    </summary>
                    <div className='mt-3 pt-3 border-t border-white/5'>
                      <StaffRowSuperClient
                        profileId={p.id}
                        initialRole={p.role}
                        initialDisplayName={displayName(p)}
                        initialActive={p.active}
                        currentUserId={session.user?.id ?? ''}
                        profileEmail={p.email}
                        profilePhone={p.phone}
                        pendingInviteId={p.email ? pendingByEmail.get(p.email.trim().toLowerCase()) ?? null : null}
                      />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>

        {staff.length === 0 && !err ? (
          <p className='py-12 text-center text-sm text-zinc-500 border border-dashed border-white/10 rounded-2xl'>
            No administrative staff or field technicians registered in roster.
          </p>
        ) : null}

        {/* Collapsible creation drawer */}
        {isSuper && (
          <>
            <details open className="rounded-3xl border border-gold/20 bg-black/45 p-6 group">
              <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.25em] text-gold-soft select-none">
                Invite employee (recommended)
              </summary>
              <p className="mt-3 text-xs text-zinc-500">
                Send a secure link by SMS and/or email. They choose their password and land in the right portal.
              </p>
              <StaffInviteClient />
            </details>

            <div className="rounded-3xl border border-white/10 bg-zinc-950/40 p-6">
              <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-400">Pending invites</p>
              <div className="mt-4">
                <PendingInvitesClient initialInvites={pendingInvites} />
              </div>
            </div>

            <details className="rounded-3xl border border-gold/15 bg-black/45 p-6 group">
              <summary className='cursor-pointer font-bold text-xs uppercase tracking-[0.25em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between'>
                <span>Create New Staff Profile (legacy)</span>
                <span className='text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40 hover:bg-zinc-900 transition'>Toggle Form</span>
              </summary>
              <div className='mt-5 pt-5 border-t border-white/5'>
                <p className='text-xs text-zinc-500 mb-4'>
                  Manual account creation with temporary password. Prefer team invite above for SMS/email onboarding.
                </p>
                <CreateStaffClient />
              </div>
            </details>
          </>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-white/5 flex gap-4">
        <Link href='/admin' className='text-xs font-bold uppercase tracking-widest text-gold-soft hover:underline'>
          ← Admin Overview
        </Link>
        {isSuper && (
          <Link href='/admin/super' className='text-xs font-bold uppercase tracking-widest text-gold-soft hover:underline'>
            Command center metrics
          </Link>
        )}
      </div>
    </DashboardShell>
  );
}
