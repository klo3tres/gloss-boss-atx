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

const PUBLIC_TIERS = ['bronze', 'silver', 'gold'] as const;

function normalizeTier(plan: Record<string, unknown>) {
  const hay = `${plan.tier ?? ''} ${plan.name ?? ''} ${plan.slug ?? ''}`.toLowerCase();
  return PUBLIC_TIERS.find((tier) => hay.includes(tier)) ?? null;
}

function planHasPrice(plan: Record<string, unknown>) {
  return Boolean(
    Number(plan.price_monthly_cents ?? 0) ||
    Number(plan.price_biweekly_cents ?? 0) ||
    Number(plan.price_yearly_cents ?? 0) ||
    Number(plan.price_cents ?? 0),
  );
}

function canonicalMembershipPlans(rows: Record<string, unknown>[]) {
  const byTier = new Map<string, Record<string, unknown>>();
  for (const plan of rows) {
    const tier = normalizeTier(plan);
    if (!tier) continue;
    const current = byTier.get(tier);
    if (!current) {
      byTier.set(tier, plan);
      continue;
    }
    const score = (p: Record<string, unknown>) => {
      let value = 0;
      if (p.archived !== true) value += 100;
      if (p.show_on_homepage !== false || p.show_on_services !== false) value += 25;
      if (planHasPrice(p)) value += 50;
      value += Date.parse(String(p.updated_at ?? p.created_at ?? 0)) / 100000000000;
      return value;
    };
    if (score(plan) > score(current)) byTier.set(tier, plan);
  }
  return PUBLIC_TIERS.map((tier) => byTier.get(tier)).filter((plan): plan is Record<string, unknown> => Boolean(plan));
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
  const publicPlans = canonicalMembershipPlans(plans);
  const hiddenPlanCount = Math.max(0, plans.length - publicPlans.length);
  const rules = (rulesRes.data ?? []) as Record<string, unknown>[];
  const customers = (customersRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[];

  return (
    <DashboardShell title='Memberships & loyalty' subtitle='Manage plans, benefits, tier rules, rewards, and customer membership status.' role='admin'>
      <section className='rounded-3xl border border-gold/20 bg-gradient-to-br from-gold/10 via-zinc-950 to-black p-6'>
        <p className='text-xs font-black uppercase tracking-[0.24em] text-gold-soft'>Plan Manager</p>
        <p className='mt-2 max-w-2xl text-sm text-zinc-300'>Edit public membership offers. Plans marked Homepage or Services appear on public sales surfaces.</p>
      </section>
      {hiddenPlanCount > 0 ? (
        <div className='rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-50'>
          Showing the canonical Bronze, Silver, and Gold plans only. {hiddenPlanCount} duplicate or non-public plan row{hiddenPlanCount === 1 ? '' : 's'} are hidden from the main manager and left untouched in the database.
        </div>
      ) : null}
      <section className='grid gap-4 lg:grid-cols-3'>
        {publicPlans.map((p: any) => (
          <form key={String(p.id)} action={saveMembershipPlanAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
            <input type='hidden' name='id' value={String(p.id)} />
            <div className='flex gap-2 mb-3'>
              <input name='name' defaultValue={String(p.name ?? '')} placeholder="Plan Name" className='flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white font-bold' />
              <input name='tier' defaultValue={String(p.tier ?? '')} placeholder="Tier" className='w-28 rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
            </div>
            
            <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft mb-1'>Interval Pricing ($)</p>
            <div className='grid grid-cols-2 gap-2 mb-3'>
              <label className='text-[10px] text-zinc-400'>
                Weekly
                <input name='price_weekly' type='number' step='0.01' defaultValue={((Number(p.price_weekly_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white' />
              </label>
              <label className='text-[10px] text-zinc-400'>
                Bi-Weekly
                <input name='price_biweekly' type='number' step='0.01' defaultValue={((Number(p.price_biweekly_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white' />
              </label>
              <label className='text-[10px] text-zinc-400'>
                Monthly
                <input name='price_monthly' type='number' step='0.01' defaultValue={((Number(p.price_monthly_cents ?? p.price_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white' />
              </label>
              <label className='text-[10px] text-zinc-400'>
                Yearly
                <input name='price_yearly' type='number' step='0.01' defaultValue={((Number(p.price_yearly_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white' />
              </label>
            </div>

            <div className='grid grid-cols-2 gap-2 mb-3'>
              <label className='text-[10px] text-zinc-400'>
                Discount %
                <input name='discount_percent' type='number' defaultValue={Number(p.discount_percent ?? 0)} className='w-full mt-1 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white' />
              </label>
              <label className='text-[10px] text-zinc-400'>
                Legacy Interval
                <select name='billing_interval' defaultValue={String(p.billing_interval ?? 'monthly')} className='w-full mt-1 rounded-lg border border-zinc-700 bg-black px-3 py-1.5 text-xs text-white'>
                  <option value='weekly'>Weekly</option>
                  <option value='bi-weekly'>Bi-weekly</option>
                  <option value='monthly'>Monthly</option>
                  <option value='yearly'>Yearly</option>
                  <option value='one-time'>One-time</option>
                </select>
              </label>
            </div>

            <label className='mt-3 block text-xs text-zinc-400'>
              Benefits (one per line)
              <textarea name='benefits' rows={4} defaultValue={Array.isArray(p.benefits) ? p.benefits.join('\n') : ''} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
            </label>
            <label className='mt-3 block text-xs text-zinc-400'>
              Included Services (one per line)
              <textarea name='included_services' rows={3} defaultValue={Array.isArray(p.included_services) ? p.included_services.join('\n') : ''} className='mt-1 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-white' />
            </label>
            <div className='mt-3 flex flex-wrap gap-3 text-xs text-zinc-300'>
              <label><input type='checkbox' name='show_on_homepage' defaultChecked={p.show_on_homepage !== false} className='mr-2 accent-[var(--gold)]' />Homepage</label>
              <label><input type='checkbox' name='show_on_services' defaultChecked={p.show_on_services !== false} className='mr-2 accent-[var(--gold)]' />Services</label>
              <label><input type='checkbox' name='archived' defaultChecked={p.archived === true} className='mr-2 accent-[var(--gold)]' />Archived</label>
            </div>
            <button className='mt-4 w-full rounded-lg bg-gold px-4 py-2.5 text-xs font-black uppercase text-black hover:bg-gold-soft transition'>Save {String(p.name ?? 'plan')}</button>
            <p className='mt-2 text-center text-[10px] text-zinc-500'>
              Monthly: {money(p.price_monthly_cents ?? p.price_cents)} · Weekly: {money(p.price_weekly_cents)} · Yearly: {money(p.price_yearly_cents)}
            </p>
          </form>
        ))}
      </section>

      <section className='mt-6 grid gap-4 lg:grid-cols-2'>
        <form action={saveLoyaltyRuleAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Loyalty Rules</p>
          <p className='mt-1 text-xs text-zinc-500'>Configure the punch-card reward shown on customer dashboards.</p>
          <input type='hidden' name='id' value={String(rules[0]?.id ?? '')} />
          <input name='name' defaultValue={String(rules[0]?.name ?? 'Default punch card')} className='mt-3 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <input name='services_required' type='number' defaultValue={Number(rules[0]?.services_required ?? 5)} className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <textarea name='reward_description' defaultValue={String(rules[0]?.reward_description ?? 'Complete 5 services, unlock 6th wash/free reward.')} className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <label className='mt-2 block text-xs text-zinc-300'><input type='checkbox' name='active' defaultChecked={rules[0]?.active !== false} className='mr-2 accent-[var(--gold)]' />Active</label>
          <button className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Save loyalty rule</button>
        </form>

        <form action={assignCustomerMembershipAction} className='rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
          <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Assign Customer Membership</p>
          <p className='mt-1 text-xs text-zinc-500'>Search support is coming next; start typing in the browser select to find a customer by name/email.</p>
          <select name='customer_id' className='mt-3 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email || c.id}</option>)}
          </select>
          <select name='membership_plan_id' className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white'>
            {publicPlans.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
          </select>
          <textarea name='notes' placeholder='Optional internal note' className='mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white' />
          <button className='mt-3 rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Assign</button>
        </form>
      </section>

      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Active Customer Memberships</p>
        <div className='mt-3 grid gap-2'>
          {((membershipsRes.data ?? []) as any[]).map((m) => (
            <div key={m.id} className='rounded-lg border border-white/10 px-3 py-2 text-sm text-zinc-300'>
              {m.customers?.full_name || m.customers?.email || 'Customer'} - {m.membership_plans?.name || 'Plan'} - {m.status}
            </div>
          ))}
        </div>
      </section>
      <section className='mt-6 rounded-2xl border border-gold/20 bg-zinc-950 p-5'>
        <p className='text-xs font-black uppercase tracking-wider text-gold-soft'>Public Preview</p>
        <p className='mt-2 text-sm text-zinc-300'>Review the live sales page customers see.</p>
        <a href='/memberships' target='_blank' rel='noreferrer' className='mt-3 inline-block rounded-lg bg-gold px-4 py-2 text-xs font-black uppercase text-black'>Open public memberships</a>
      </section>
    </DashboardShell>
  );
}
