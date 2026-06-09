import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bell, LockKeyhole, Mail, MessageSquare } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { SMS_CONSENT_COPY } from '@/lib/sms-consent';
import { cancelCustomerMembershipAction, updateCustomerSmsPreferencesAction } from './actions';

export const dynamic = 'force-dynamic';

export default async function CustomerSettingsPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  const email = session.user?.email?.trim().toLowerCase();
  if (!session.user || !email) notFound();

  const { data: customer } = admin
    ? await admin
        .from('customers')
        .select('id, full_name, email, phone, sms_consent, sms_status')
        .ilike('email', email)
        .maybeSingle()
    : { data: null };

  const row = customer as
    | { id?: string | null; full_name?: string | null; email?: string | null; phone?: string | null; sms_consent?: boolean | null; sms_status?: string | null }
    | null;
  const { data: membershipRows } =
    admin && row?.id
      ? await admin
          .from('customer_memberships')
          .select('id, status, started_at, ends_at, stripe_subscription_id, stripe_checkout_session_id, membership_plans(name,tier)')
          .eq('customer_id', row.id)
          .order('created_at', { ascending: false })
          .limit(10)
      : { data: [] };
  const memberships = (membershipRows ?? []) as Array<{
    id: string;
    status: string;
    started_at?: string | null;
    ends_at?: string | null;
    stripe_subscription_id?: string | null;
    stripe_checkout_session_id?: string | null;
    membership_plans?: { name?: string | null; tier?: string | null } | null;
  }>;

  return (
    <DashboardShell title='Settings' subtitle='Communication preferences, account access, and customer profile controls.' role='customer'>
      <section className='grid gap-4 lg:grid-cols-3'>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-5 lg:col-span-2'>
          <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
            <MessageSquare className='h-4 w-4' /> SMS preferences
          </p>
          <p className='mt-3 text-sm leading-6 text-zinc-300'>{SMS_CONSENT_COPY}</p>
          <form action={updateCustomerSmsPreferencesAction} className='mt-5 rounded-2xl border border-white/10 bg-black/35 p-4'>
            <label className='flex items-start gap-3 text-sm text-zinc-200'>
              <input
                name='sms_consent'
                type='checkbox'
                defaultChecked={row?.sms_consent === true && row?.sms_status !== 'opted_out'}
                className='mt-1 h-4 w-4 accent-[var(--gold)]'
              />
              <span>
                Send me appointment reminders, service status updates, invoices, payment links, and review requests by text.
                <span className='mt-1 block text-xs text-zinc-500'>You can reply STOP to any text to opt out automatically.</span>
              </span>
            </label>
            <button className='mt-4 rounded-xl bg-gold px-5 py-2 text-xs font-black uppercase text-black'>Save SMS preference</button>
          </form>
        </div>

        <div className='rounded-3xl border border-white/10 bg-black/45 p-5'>
          <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-zinc-400'>
            <Bell className='h-4 w-4 text-gold-soft' /> Current status
          </p>
          <p className='mt-4 text-2xl font-black text-white'>{row?.sms_consent === true && row?.sms_status !== 'opted_out' ? 'Opted in' : 'Opted out'}</p>
          <p className='mt-2 text-xs text-zinc-500'>{row?.phone || 'No phone number saved on your customer profile.'}</p>
        </div>
      </section>

      <section className='grid gap-4 md:grid-cols-2'>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
            <Mail className='h-4 w-4' /> Email preferences
          </p>
          <p className='mt-3 text-sm text-zinc-300'>
            Booking confirmations, receipts, signed agreements, and essential account messages are sent to {row?.email || email}.
          </p>
          <p className='mt-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2 text-xs text-zinc-500'>
            Marketing email controls will appear here once a dedicated email-preference field is added to the customer table.
          </p>
        </div>
        <div className='rounded-3xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-gold-soft'>
            <LockKeyhole className='h-4 w-4' /> Password management
          </p>
          <p className='mt-3 text-sm text-zinc-300'>Use the secure password reset flow tied to your Supabase account email.</p>
          <Link href='/forgot-password' className='mt-5 inline-flex rounded-xl bg-gold px-5 py-2 text-xs font-black uppercase text-black'>
            Reset password
          </Link>
        </div>
      </section>

      <section className='rounded-3xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-[0.2em] text-gold-soft'>Membership subscription</p>
        {memberships.length === 0 ? (
          <p className='mt-3 text-sm text-zinc-400'>No membership is attached to this customer profile yet.</p>
        ) : (
          <div className='mt-4 grid gap-3'>
            {memberships.map((m) => {
              const active = ['active', 'trialing', 'past_due'].includes(String(m.status).toLowerCase());
              const isPending = ['pending', 'pending_payment', 'incomplete'].includes(String(m.status).toLowerCase());
              return (
                <div key={m.id} className='rounded-2xl border border-white/10 bg-black/35 p-4'>
                  <div className='flex flex-col gap-3'>
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                      <div>
                        <p className='font-black text-white'>{m.membership_plans?.name ?? 'Gloss Boss membership'}</p>
                        <p className='mt-1 text-xs text-zinc-500'>
                          Status:{' '}
                          <span className={`font-semibold ${isPending ? 'text-amber-400' : active ? 'text-emerald-400' : 'text-zinc-400'}`}>
                            {m.status}
                          </span>
                          {m.ends_at ? ` · Ends ${new Date(m.ends_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      {active ? (
                        <form action={cancelCustomerMembershipAction}>
                          <input type='hidden' name='membershipId' value={m.id} />
                          <button className='rounded-xl border border-red-500/40 px-4 py-2 text-xs font-black uppercase text-red-200 hover:bg-red-500/10 transition'>
                            Cancel renewal
                          </button>
                        </form>
                      ) : null}
                    </div>

                    {isPending ? (
                      <div className='mt-3 rounded-xl border border-gold/30 bg-gold/5 p-4'>
                        <p className='text-xs font-bold uppercase tracking-wider text-gold-soft mb-1'>Next Action Required</p>
                        <p className='text-xs leading-relaxed text-zinc-300'>
                          Your membership subscription setup is incomplete or awaiting payment.
                        </p>
                        <ul className='mt-2 list-disc list-inside text-xs text-zinc-400 space-y-1'>
                          <li>Check your email inbox for the Stripe checkout session link.</li>
                          <li>If you just completed payment, it may take a few moments to sync.</li>
                          <li>If you are paying in person or using a custom fleet account, our admin team will manually review and activate your subscription.</li>
                        </ul>
                        <div className='mt-3 flex gap-2'>
                          <Link href='/memberships' className='inline-flex rounded-lg bg-gold px-3 py-1.5 text-[10px] font-black uppercase text-black hover:bg-gold-soft transition'>
                            View membership options
                          </Link>
                          <a href='mailto:support@glossbossatx.com?subject=Gloss%20Boss%20Membership%20Activation' className='inline-flex rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-[10px] font-black uppercase text-zinc-300 hover:bg-white/10 transition'>
                            Contact support
                          </a>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
