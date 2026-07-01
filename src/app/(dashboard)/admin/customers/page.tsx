import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isAdminLevel } from '@/lib/auth/roles';
import { createCustomerAction, deleteCustomerAction, archiveCustomerAction } from '@/app/(dashboard)/admin/customer-actions';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { backfillAllAppointmentVehicles } from '@/lib/crm-vehicle-sync';
import { ConfirmSubmitButton } from '@/components/ui/confirm-submit-button';
import { AdminTitanHero } from '@/components/titan/admin-titan-hero';
import { calculateLoyaltyStatus } from '@/lib/loyalty-ledger';
import { User, Mail, Phone, Calendar, Award, Star } from 'lucide-react';

export const dynamic = 'force-dynamic';

type CustomerRow = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  archived?: boolean | null;
  customer_memberships?: Array<{
    status: string;
    membership_plans: {
      name: string;
      tier: string;
    } | null;
  }>;
  loyalty_stamps?: Array<{
    stamp_count: number;
    voided?: boolean | null;
    voided_at?: string | null;
  }>;
};

export default async function AdminCustomersPage() {
  const session = await getSessionWithProfile();
  const supabase = await createSupabaseServerClient();

  let rows: CustomerRow[] = [];
  let qErr: string | null = null;
  if (supabase && session.user && isAdminLevel(session.profile?.role ?? null)) {
    const client = tryCreateAdminSupabase() ?? supabase;
    const { count: vehicleCount } = await client.from('vehicles').select('id', { count: 'exact', head: true });
    if ((vehicleCount ?? 0) < 3) {
      await backfillAllAppointmentVehicles(client);
    }
    
    const full = await client
      .from('customers')
      .select('id, email, full_name, phone, created_at, archived')
      .or('archived.is.null,archived.eq.false')
      .order('created_at', { ascending: false })
      .limit(200);

    if (full.error) {
      qErr = full.error.message;
      console.warn('[CRM_DEBUG_DB]', 'customers_list', full.error.message);
    } else {
      rows = (full.data ?? []) as unknown as CustomerRow[];
      const customerIds = rows.map((row) => row.id);
      if (customerIds.length > 0) {
        const [membershipsRes, plansRes, stampsRes] = await Promise.all([
          client
            .from('customer_memberships')
            .select('customer_id, membership_plan_id, status')
            .in('customer_id', customerIds),
          client
            .from('membership_plans')
            .select('id, name, tier')
            .limit(100),
          client
            .from('loyalty_stamps')
            .select('customer_id, stamp_count, voided, voided_at')
            .in('customer_id', customerIds),
        ]);

        if (membershipsRes.error) console.warn('[CRM_DEBUG_DB]', 'customer_memberships_list', membershipsRes.error.message);
        if (plansRes.error) console.warn('[CRM_DEBUG_DB]', 'membership_plans_list', plansRes.error.message);
        if (stampsRes.error) console.warn('[CRM_DEBUG_DB]', 'loyalty_stamps_list', stampsRes.error.message);

        const plansById = new Map(
          ((plansRes.data ?? []) as Array<{ id: string; name: string; tier: string }>).map((plan) => [plan.id, plan]),
        );
        const membershipsByCustomer = new Map<string, CustomerRow['customer_memberships']>();
        for (const membership of (membershipsRes.data ?? []) as Array<{ customer_id: string; membership_plan_id: string | null; status: string }>) {
          const list = membershipsByCustomer.get(membership.customer_id) ?? [];
          const plan = membership.membership_plan_id ? plansById.get(membership.membership_plan_id) ?? null : null;
          list.push({
            status: membership.status,
            membership_plans: plan ? { name: plan.name, tier: plan.tier } : null,
          });
          membershipsByCustomer.set(membership.customer_id, list);
        }
        const stampsByCustomer = new Map<string, CustomerRow['loyalty_stamps']>();
        for (const stamp of (stampsRes.data ?? []) as Array<{ customer_id: string; stamp_count: number | null; voided?: boolean | null; voided_at?: string | null }>) {
          const list = stampsByCustomer.get(stamp.customer_id) ?? [];
          list.push({ stamp_count: stamp.stamp_count ?? 1, voided: stamp.voided ?? null, voided_at: stamp.voided_at ?? null });
          stampsByCustomer.set(stamp.customer_id, list);
        }
        rows = rows.map((row) => ({
          ...row,
          customer_memberships: membershipsByCustomer.get(row.id) ?? [],
          loyalty_stamps: stampsByCustomer.get(row.id) ?? [],
        }));
      }
    }
  }

  const isSuper = session.profile?.role === 'super_admin';
  const memberCount = rows.filter((r) => (r.customer_memberships ?? []).some((m) => m.status === 'active')).length;

  return (
    <DashboardShell title="Customers" subtitle="Profiles, loyalty, and contact directory." role="admin">
      <AdminTitanHero
        title="Customers"
        sentence="Every profile, membership, and loyalty stamp in one place — ready for outreach."
        kpi={rows.length}
        kpiHint={`${memberCount} active members · search, add, and archive below`}
        primaryHref="/admin/messages"
        primaryLabel="Message center"
        secondaryLinks={[
          { href: '/admin', label: '← Briefing' },
          { href: '/book', label: 'New booking' },
        ]}
      />
      {qErr ? (
        <p className='mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100'>
          Could not load customers: {qErr}
        </p>
      ) : null}

      {/* Add Customer Form Collapsed */}
      <details className='mb-6 rounded-3xl border border-gold/15 bg-black/45 p-5 group'>
        <summary className="cursor-pointer font-bold text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-gold-soft transition select-none flex items-center justify-between">
          <span className="flex items-center gap-2">
            <User className="h-4 w-4 text-gold-soft" />
            <span>Add New Customer CRM Profile</span>
          </span>
          <span className="text-[10px] text-zinc-500 font-normal py-1 px-3 border border-white/10 rounded-lg bg-zinc-950/40 hover:bg-zinc-900">Toggle Form</span>
        </summary>
        <div className="mt-5 pt-5 border-t border-white/5 space-y-4">
          <p className='text-xs text-zinc-500'>Creates a new CRM profile row. Customers can later sign up using the same email to link their account.</p>
          <form action={createCustomerAction} className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
            <label className='block text-xs text-zinc-400 sm:col-span-2'>
              Email Address
              <input name='email' type='email' placeholder='name@domain.com' required className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white focus:border-gold/50 focus:ring-1 focus:ring-gold/50 outline-none transition' />
            </label>
            <label className='block text-xs text-zinc-400'>
              Full Name
              <input name='full_name' placeholder='First Last' className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white focus:border-gold/50 focus:ring-1 focus:ring-gold/50 outline-none transition' />
            </label>
            <label className='block text-xs text-zinc-400'>
              Phone Number
              <input name='phone' placeholder='(512) 555-0199' className='mt-1.5 w-full rounded-xl border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white focus:border-gold/50 focus:ring-1 focus:ring-gold/50 outline-none transition' />
            </label>
            <div className='flex items-end sm:col-span-2 lg:col-span-4 mt-2'>
              <button type='submit' className='rounded-xl bg-gradient-to-r from-gold via-gold-soft to-gold px-6 py-3 text-xs font-black uppercase tracking-wider text-black shadow-md hover:brightness-110 transition'>
                Create CRM Profile
              </button>
            </div>
          </form>
        </div>
      </details>

      {/* Directory Grid */}
      <section className='mt-8 rounded-3xl border border-gold/20 bg-zinc-950/60 p-6'>
        <div className='flex justify-between items-center mb-6'>
          <div>
            <h2 className='text-sm font-black uppercase text-gold-soft tracking-wider'>Customer Directory</h2>
            <p className='text-xs text-zinc-500 mt-1'>Showing up to 200 of the latest active customer records.</p>
          </div>
          <span className='rounded-full bg-white/5 border border-white/10 px-3 py-1 text-xs text-zinc-400 font-bold'>
            {rows.length} Profiles
          </span>
        </div>

        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
          {rows.map((c) => {
            const initials = String(c.full_name ?? c.email)
              .split(' ')
              .map((n) => n[0])
              .join('')
              .toUpperCase()
              .slice(0, 2);

            // Resolve active membership
            const activeMembership = c.customer_memberships?.find((m) => m.status === 'active');
            const tier = activeMembership?.membership_plans?.tier || 'default';
            const tierName = activeMembership?.membership_plans?.name || null;

            // Resolve stamp count
            const loyaltyStatus = calculateLoyaltyStatus(c.loyalty_stamps ?? []);
            const stampsCount = loyaltyStatus.totalStamps;
            const currentPunchCardStamps = loyaltyStatus.progressStamps;

            return (
              <div 
                key={c.id} 
                className='relative group flex flex-col justify-between rounded-2xl border border-white/5 bg-zinc-950/40 p-5 hover:border-gold/30 hover:shadow-[0_0_24px_rgba(212,175,55,0.08)] transition duration-300'
              >
                <div>
                  <div className='flex items-start justify-between gap-3'>
                    {/* Customer Profile Link clickable */}
                    <Link href={`/admin/customers/${c.id}`} className='flex items-center gap-3 min-w-0 group-hover:text-gold-soft transition'>
                      <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold/10 border border-gold/20 text-gold-soft font-black text-sm group-hover:border-gold/50 transition'>
                        {initials}
                      </div>
                      <div className='min-w-0'>
                        <h3 className='font-bold text-white group-hover:text-gold-soft transition truncate leading-snug'>
                          {c.full_name || 'Unnamed Client'}
                        </h3>
                        <p className='text-xs text-zinc-500 truncate mt-0.5'>{c.email}</p>
                      </div>
                    </Link>

                    {/* Tier badge */}
                    {tierName && (
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase border shrink-0 ${
                        tier === 'gold' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                        tier === 'silver' ? 'bg-zinc-400/10 text-zinc-300 border-zinc-500/20' :
                        'bg-orange-700/10 text-orange-400 border-orange-700/30'
                      }`}>
                        {tierName}
                      </span>
                    )}
                  </div>

                  <div className='mt-4 space-y-2 border-t border-white/5 pt-3.5 text-xs text-zinc-400'>
                    {c.phone && (
                      <div className='flex items-center gap-2'>
                        <Phone className='h-3.5 w-3.5 text-zinc-500' />
                        <span>{c.phone}</span>
                      </div>
                    )}
                    <div className='flex items-center gap-2 justify-between'>
                      <div className='flex items-center gap-2'>
                        <Star className='h-3.5 w-3.5 text-gold fill-gold/10' />
                        <span>
                          Stamps count: <strong className='text-white'>{stampsCount}</strong> ({loyaltyStatus.rewardReady ? 'reward ready' : `${currentPunchCardStamps}/5 active`})
                        </span>
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <Calendar className='h-3.5 w-3.5 text-zinc-500' />
                      <span>Registered: {new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className='mt-5 flex items-center justify-between gap-2 border-t border-white/5 pt-3'>
                  <Link 
                    href={`/admin/customers/${c.id}`} 
                    className='text-xs font-black uppercase text-gold-soft hover:underline'
                  >
                    View CRM Details →
                  </Link>

                  <div className='flex gap-2'>
                    <form action={archiveCustomerAction}>
                      <input type='hidden' name='id' value={c.id} />
                      <ConfirmSubmitButton 
                        message={`Archive customer ${c.full_name || c.email}?`}
                        className='rounded px-2.5 py-1 text-[9px] font-black uppercase border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition'
                      >
                        Archive
                      </ConfirmSubmitButton>
                    </form>
                    {isSuper && (
                      <form action={deleteCustomerAction}>
                        <input type='hidden' name='id' value={c.id} />
                        <ConfirmSubmitButton 
                          message={`PERMANENTLY delete customer ${c.full_name || c.email}?`}
                          className='rounded px-2.5 py-1 text-[9px] font-black uppercase border border-red-500/35 text-red-400 hover:bg-red-500/10 transition'
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {rows.length === 0 && !qErr ? (
          <p className='mt-4 text-center text-sm text-zinc-500 py-12 border border-dashed border-white/10 rounded-2xl'>
            No customers registered in CRM directory yet.
          </p>
        ) : null}
      </section>

      <Link href='/admin' className='mt-8 inline-block text-xs font-bold uppercase tracking-wider text-gold-soft underline'>
        ← Admin overview
      </Link>
    </DashboardShell>
  );
}
