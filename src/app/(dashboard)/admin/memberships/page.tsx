import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { assignCustomerMembershipAction, saveLoyaltyRuleAction, saveMembershipPlanAction } from './actions';

export const dynamic = 'force-dynamic';

function money(cents: unknown) {
  return `$${(((typeof cents === 'number' ? cents : 0) / 100)).toFixed(2)}`;
}

export default async function MembershipsAdminPage() {
  const session = await getSessionWithProfile();
  const admin = tryCreateAdminSupabase();
  if (!session.user || !isStaffRole(session.profile?.role) || !admin) notFound();

  const [plansRes, rulesRes, customersRes, membershipsRes] = await Promise.all([
    admin.from('membership_plans').select('*').order('tier'),
    admin.from('loyalty_rules').select('*').order('created_at', { ascending: false }),
    admin.from('customers').select('id, full_name, email').order('full_name').limit(300),
    admin
      .from('customer_memberships')
      .select('id, status, started_at, customers(full_name,email), membership_plans(name,tier)')
      .order('created_at', { ascending: false })
      .limit(80),
  ]);

  const plans = (plansRes.data ?? []) as Record<string, unknown>[];
  const rules = (rulesRes.data ?? []) as Record<string, unknown>[];
  const customers = (customersRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[];

  return (
    <DashboardShell title='Memberships & loyalty' subtitle='Manage plans, benefits, tier rules, rewards, and customer membership status.' role='admin'>
      <section className='grid gap-4 lg:grid-cols-3'>
        {plans.map((p) => (
          <form key={String(p.id)} action={saveMembershipPlanAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
            <input type='hidden' name='id' value={String(p.id)} />
            <input name='name' defaultValue={String(p.name ?? '')} className='w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            <div className='mt-3 grid gap-2 sm:grid-cols-2'>
              <input name='tier' defaultValue={String(p.tier ?? '')} className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <input name='price' type='number' step='0.01' defaultValue={((Number(p.price_cents ?? 0)) / 100).toFixed(2)} className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
              <select name='billing_interval' defaultValue={String(p.billing_interval ?? 'month')} className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
                <option value='month'>Monthly</option>
                <option value='year'>Yearly</option>
                <option value='one_time'>One time</option>
              </select>
              <input name='discount_percent' type='number' defaultValue={Number(p.discount_percent ?? 0)} className='rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </div>
            <label className='mt-3 block text-xs text-zinc-400'>
              Benefits
              <textarea name='benefits' rows={4} defaultValue={Array.isArray(p.benefits) ? p.benefits.join('\n') : ''} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <label className='mt-3 block text-xs text-zinc-400'>
              Included services
              <textarea name='included_services' rows={3} defaultValue={Array.isArray(p.included_services) ? p.included_services.join('\n') : ''} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </label>
            <div className='mt-3 flex flex-wrap gap-3 text-xs text-zinc-300'>
              <label><input type='checkbox' name='show_on_homepage' defaultChecked={p.show_on_homepage !== false} className='mr-2 accent-[var(--gold)]' />Homepage</label>
              <label><input type='checkbox' name='show_on_services' defaultChecked={p.show_on_services !== false} className='mr-2 accent-[var(--gold)]' />Services</label>
              <label><input type='checkbox' name='archived' defaultChecked={p.archived === true} className='mr-2 accent-[var(--gold)]' />Archived</label>
            </div>
            <button className='mt-4 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save {String(p.name ?? 'plan')}</button>
            <p className='mt-2 text-xs text-zinc-500'>{money(p.price_cents)} / {String(p.billing_interval ?? 'month')}</p>
          </form>
        ))}
        <form action={saveMembershipPlanAction} className='rounded-2xl border border-dashed border-gold/30 bg-black/35 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>New plan</p>
          <input name='name' placeholder='Elite' className='mt-3 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='tier' placeholder='elite' className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='price' type='number' step='0.01' placeholder='99.00' className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <button className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Create plan</button>
        </form>
      </section>

      <section className='mt-6 grid gap-4 lg:grid-cols-2'>
        <form action={saveLoyaltyRuleAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Loyalty reward rule</p>
          <input type='hidden' name='id' value={String(rules[0]?.id ?? '')} />
          <input name='name' defaultValue={String(rules[0]?.name ?? 'Default punch card')} className='mt-3 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='services_required' type='number' defaultValue={Number(rules[0]?.services_required ?? 5)} className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <textarea name='reward_description' defaultValue={String(rules[0]?.reward_description ?? 'Complete 5 services, unlock 6th wash/free reward.')} className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <label className='mt-2 block text-xs text-zinc-300'><input type='checkbox' name='active' defaultChecked={rules[0]?.active !== false} className='mr-2 accent-[var(--gold)]' />Active</label>
          <button className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save loyalty rule</button>
        </form>

        <form action={assignCustomerMembershipAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Assign customer membership</p>
          <select name='customer_id' className='mt-3 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email || c.id}</option>)}
          </select>
          <select name='membership_plan_id' className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
            {plans.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
          </select>
          <textarea name='notes' placeholder='Optional internal note' className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <button className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Assign</button>
        </form>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Active customer memberships</p>
        <div className='mt-3 grid gap-2'>
          {((membershipsRes.data ?? []) as any[]).map((m) => (
            <div key={m.id} className='rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300'>
              {m.customers?.full_name || m.customers?.email || 'Customer'} - {m.membership_plans?.name || 'Plan'} - {m.status}
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  );
}
