import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bell, LockKeyhole, Mail, Phone, Shield } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardRoleGate } from '@/components/auth/dashboard-role-gate';
import { getSessionWithProfile } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

export default async function TechSettingsPage() {
  const session = await getSessionWithProfile();
  if (!session.user) notFound();

  const profile = session.profile;
  const role = profile?.role ?? 'technician';
  const email = session.user.email ?? '—';
  const phone = (profile as { phone?: string | null } | null)?.phone ?? '—';
  const name = profile?.full_name ?? 'Technician';

  return (
    <DashboardRoleGate variant='tech'>
      <DashboardShell title='Account settings' subtitle='Your profile, access, and security controls.' role='technician'>
        <section className='grid gap-4 lg:grid-cols-3'>
          <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-5 lg:col-span-2'>
            <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
              <Shield className='h-4 w-4' /> Profile
            </p>
            <dl className='mt-5 grid gap-4 sm:grid-cols-2 text-sm'>
              <div>
                <dt className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Name</dt>
                <dd className='mt-1 font-semibold text-white'>{name}</dd>
              </div>
              <div>
                <dt className='text-[10px] font-black uppercase tracking-wider text-zinc-500'>Role</dt>
                <dd className='mt-1 font-semibold capitalize text-gold-soft'>{role.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className='flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500'>
                  <Mail className='h-3 w-3' /> Email
                </dt>
                <dd className='mt-1 text-zinc-200'>{email}</dd>
              </div>
              <div>
                <dt className='flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-zinc-500'>
                  <Phone className='h-3 w-3' /> Phone on file
                </dt>
                <dd className='mt-1 text-zinc-200'>{phone}</dd>
              </div>
            </dl>
            <p className='mt-4 text-xs text-zinc-500'>
              Contact an admin to update your phone number or role. Admins can manage team accounts from Setup → Team.
            </p>
          </div>

          <div className='rounded-3xl border border-white/10 bg-black/45 p-5'>
            <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-zinc-400'>
              <Bell className='h-4 w-4 text-gold-soft' /> Notifications
            </p>
            <p className='mt-4 text-sm text-zinc-300'>
              Job dispatch alerts and account security messages are sent to your email and phone on file when configured.
            </p>
          </div>
        </section>

        <section className='mt-4 grid gap-4 md:grid-cols-2'>
          <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-5'>
            <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
              <LockKeyhole className='h-4 w-4' /> Password
            </p>
            <p className='mt-3 text-sm text-zinc-300'>Request a secure reset link by email. You will land here to set a new password.</p>
            <Link href='/forgot-password' className='mt-5 inline-flex rounded-xl bg-gold px-5 py-2 text-xs font-black uppercase text-black'>
              Reset password
            </Link>
          </div>
          <div className='rounded-3xl border border-white/10 bg-zinc-950 p-5'>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-zinc-400'>Sign out</p>
            <p className='mt-3 text-sm text-zinc-400'>End your session on this device.</p>
            <Link href='/login?signout=1' className='mt-5 inline-flex rounded-xl border border-white/15 px-5 py-2 text-xs font-black uppercase text-zinc-200'>
              Sign out
            </Link>
          </div>
        </section>
      </DashboardShell>
    </DashboardRoleGate>
  );
}
