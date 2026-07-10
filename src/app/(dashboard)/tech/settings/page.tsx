import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LockKeyhole, Shield } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { DashboardRoleGate } from '@/components/auth/dashboard-role-gate';
import { AppearanceSettingsPanel } from '@/components/theme/appearance-settings-panel';
import { StaffNotificationSettingsPanel } from '@/components/tech/staff-notification-settings-panel';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { parseUserUiPreferences } from '@/lib/user-ui-preferences';
import { parseStaffNotificationPreferences } from '@/lib/staff-notification-preferences';
import { getVapidPublicKey, webPushConfigured } from '@/lib/web-push-send';
import { resendConfigured, twilioConfigured } from '@/lib/email-send';

export const dynamic = 'force-dynamic';

function str(v: unknown) {
  return v == null ? '' : String(v).trim();
}

export default async function TechSettingsPage() {
  const session = await getSessionWithProfile();
  if (!session.user) notFound();

  const profile = session.profile;
  const role = profile?.role ?? 'technician';
  const email = session.user.email ?? '—';
  const name = profile?.full_name ?? 'Team member';

  const admin = tryCreateAdminSupabase();
  let uiPreferences = parseUserUiPreferences(null);
  let staffPrefs = parseStaffNotificationPreferences(null);
  let phone = '';
  let pushoverKey = '';

  if (admin && session.user.id) {
    const { data: profileRow } = await admin
      .from('profiles')
      .select('theme_preference, ui_accent, ui_sidebar_density, ui_dashboard_density, staff_notification_preferences, phone, pushover_user_key')
      .eq('id', session.user.id)
      .maybeSingle();

    uiPreferences = parseUserUiPreferences(profileRow as Record<string, unknown> | null);
    staffPrefs = parseStaffNotificationPreferences(
      (profileRow as { staff_notification_preferences?: unknown } | null)?.staff_notification_preferences,
    );
    phone = str((profileRow as { phone?: string } | null)?.phone);
    pushoverKey = str((profileRow as { pushover_user_key?: string } | null)?.pushover_user_key);
  }

  return (
    <DashboardRoleGate variant='tech'>
      <DashboardShell title='Account settings' subtitle='Alerts, profile, and security.' role='technician'>
        <section className='rounded-3xl border border-gold/20 bg-card/40 p-5 mb-4'>
          <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
            <Shield className='h-4 w-4' /> Profile
          </p>
          <dl className='mt-4 grid gap-4 sm:grid-cols-3 text-sm'>
            <div>
              <dt className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>Name</dt>
              <dd className='mt-1 font-semibold text-foreground'>{name}</dd>
            </div>
            <div>
              <dt className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>Role</dt>
              <dd className='mt-1 font-semibold capitalize text-gold-soft'>{role.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className='text-[10px] font-black uppercase tracking-wider text-muted-foreground'>Email</dt>
              <dd className='mt-1 text-foreground'>{email}</dd>
            </div>
          </dl>
        </section>

        <section className='mb-4'>
          <StaffNotificationSettingsPanel
            initialPrefs={staffPrefs}
            initialPhone={phone}
            initialEmail={email}
            initialPushoverKey={pushoverKey}
            pushConfigured={webPushConfigured()}
            vapidPublicKey={getVapidPublicKey()}
            twilioConfigured={twilioConfigured()}
            resendConfigured={resendConfigured()}
          />
        </section>

        <section className='rounded-3xl border border-gold/20 bg-card/40 p-5'>
          <AppearanceSettingsPanel initial={uiPreferences} />
        </section>

        <section className='mt-4 grid gap-4 md:grid-cols-2'>
          <div className='rounded-3xl border border-gold/20 bg-card/40 p-5'>
            <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
              <LockKeyhole className='h-4 w-4' /> Password
            </p>
            <p className='mt-3 text-sm text-muted-foreground'>Request a secure reset link by email.</p>
            <Link href='/forgot-password' className='mt-5 inline-flex rounded-xl bg-gold px-5 py-2 text-xs font-black uppercase text-black'>
              Reset password
            </Link>
          </div>
          <div className='rounded-3xl border border-border bg-card/40 p-5'>
            <p className='text-xs font-black uppercase tracking-[0.22em] text-muted-foreground'>Sign out</p>
            <p className='mt-3 text-sm text-muted-foreground'>End your session on this device.</p>
            <Link href='/login?signout=1' className='mt-5 inline-flex rounded-xl border border-border px-5 py-2 text-xs font-black uppercase text-muted-foreground'>
              Sign out
            </Link>
          </div>
        </section>
      </DashboardShell>
    </DashboardRoleGate>
  );
}
