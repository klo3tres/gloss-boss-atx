import { notFound } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard/dashboard-shell';
import { getSessionWithProfile } from '@/lib/auth/session';
import { isStaffRole } from '@/lib/auth/roles';
import { tryCreateAdminSupabase } from '@/lib/supabase/safeClient';
import { assignCustomerMembershipAction, saveLoyaltyRuleAction, saveMembershipPlanAction, saveLoyaltyCardDesignAction } from './actions';
import { LoyaltyCardPreviewConsole } from '@/components/admin/loyalty-card-preview-console';
import { addManualLoyaltyStampAction } from '@/app/(dashboard)/admin/customer-actions';
import { CustomerCreditsManager } from '@/components/admin/customer-credits-manager';

import { GlassCard, SectionEyebrow } from '@/components/ui/premium';

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

  const [plansRes, rulesRes, customersRes, membershipsRes, designsRes] = await Promise.all([
    admin.from('membership_plans').select('*').order('tier'),
    admin.from('loyalty_rules').select('*').order('created_at', { ascending: false }),
    admin.from('customers').select('id, full_name, email').order('full_name').limit(300),
    admin
      .from('customer_memberships')
      .select('id, status, started_at, customer_id, customers(id,full_name,email), membership_plans(name,tier)')
      .order('created_at', { ascending: false })
      .limit(80),
    admin.from('loyalty_card_designs').select('*').order('created_at', { ascending: false }),
  ]);

  const plans = (plansRes.data ?? []) as Record<string, unknown>[];
  const publicPlans = canonicalMembershipPlans(plans);
  const hiddenPlanCount = Math.max(0, plans.length - publicPlans.length);
  const rules = (rulesRes.data ?? []) as Record<string, unknown>[];
  const customers = (customersRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[];
  const designs = (designsRes.data ?? []) as any[];

  return (
    <DashboardShell title='Memberships & Loyalty' subtitle='Manage subscription plans, benefits, tier rules, and customer membership statuses.' role='admin'>
      <GlassCard className="bg-gradient-to-br from-gold/10 via-zinc-950/80 to-black border-gold/15 mb-6 relative overflow-hidden" glow>
        <div className="absolute top-0 right-0 h-32 w-32 bg-gold/5 rounded-full blur-3xl pointer-events-none" />
        <SectionEyebrow>Plan Manager</SectionEyebrow>
        <p className="mt-2 max-w-2xl text-xs text-zinc-300 leading-relaxed">
          Configure public membership plans. Active plans checked as Homepage or Services will automatically populate on sales surfaces.
        </p>
      </GlassCard>

      {hiddenPlanCount > 0 ? (
        <div className='rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4 text-xs text-amber-200 mb-6'>
          Showing canonical Bronze, Silver, and Gold plans. {hiddenPlanCount} non-public plan row{hiddenPlanCount === 1 ? '' : 's'} are currently hidden.
        </div>
      ) : null}

      {/* PLAN DETAILS CARDS */}
      <section className='grid gap-6 lg:grid-cols-3 mb-8'>
        {publicPlans.map((p: any) => (
          <GlassCard key={String(p.id)} className="border-white/10 bg-zinc-950/40 hover:border-gold/30 transition duration-300 flex flex-col justify-between">
            <form action={saveMembershipPlanAction} className="space-y-4">
              <input type='hidden' name='id' value={String(p.id)} />
              
              <div className='flex gap-2 items-center'>
                <input 
                  name='name' 
                  defaultValue={String(p.name ?? '')} 
                  placeholder="Plan Name" 
                  required
                  className='flex-1 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white font-black uppercase tracking-wide focus:border-gold/50 outline-none transition' 
                />
                <input 
                  name='tier' 
                  defaultValue={String(p.tier ?? '')} 
                  placeholder="Tier" 
                  required
                  className='w-24 rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-zinc-300 font-mono focus:border-gold/50 outline-none transition' 
                />
              </div>
              
              <div className="border-t border-white/5 pt-3">
                <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft mb-2'>Pricing Config ($)</p>
                <div className='grid grid-cols-2 gap-2'>
                  <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                    Weekly
                    <input name='price_weekly' type='number' step='0.01' defaultValue={((Number(p.price_weekly_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white' />
                  </label>
                  <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                    Bi-Weekly
                    <input name='price_biweekly' type='number' step='0.01' defaultValue={((Number(p.price_biweekly_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white' />
                  </label>
                  <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                    Monthly
                    <input name='price_monthly' type='number' step='0.01' defaultValue={((Number(p.price_monthly_cents ?? p.price_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white' />
                  </label>
                  <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                    Yearly
                    <input name='price_yearly' type='number' step='0.01' defaultValue={((Number(p.price_yearly_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white' />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
                <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                  Discount %
                  <input name='discount_percent' type='number' defaultValue={Number(p.discount_percent ?? 0)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white' />
                </label>
                <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                  Billing Interval
                  <select name='billing_interval' defaultValue={String(p.billing_interval ?? 'monthly')} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-white'>
                    <option value='weekly'>Weekly</option>
                    <option value='bi-weekly'>Bi-weekly</option>
                    <option value='monthly'>Monthly</option>
                    <option value='yearly'>Yearly</option>
                    <option value='one-time'>One-time</option>
                  </select>
                </label>
              </div>

              <div className="border-t border-white/5 pt-3">
                <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft mb-2'>Loyalty rules</p>
                <div className='grid grid-cols-3 gap-2'>
                  <label className='text-[9px] text-zinc-500 font-bold uppercase'>
                    Multiplier
                    <input name='punch_multiplier' type='number' step='0.05' defaultValue={Number(p.punch_multiplier ?? 1.0)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-white font-mono' />
                  </label>
                  <label className='text-[9px] text-zinc-500 font-bold uppercase'>
                    Bonus stamps
                    <input name='bonus_punches' type='number' defaultValue={Number(p.bonus_punches ?? 0)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-white font-mono' />
                  </label>
                  <label className='text-[9px] text-zinc-500 font-bold uppercase'>
                    Reward Thr.
                    <input name='reward_threshold' type='number' defaultValue={Number(p.reward_threshold ?? 5)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-white font-mono' />
                  </label>
                </div>
              </div>

              <label className='block text-[10px] text-zinc-500 font-bold uppercase border-t border-white/5 pt-3'>
                Reward Description
                <input name='reward_description' defaultValue={String(p.reward_description ?? 'Complete 5 services, unlock 6th wash/free reward.')} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-xs text-white' />
              </label>

              <div className='grid grid-cols-2 gap-2 border-t border-white/5 pt-3'>
                <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                  Upgrade Credit ($)
                  <input name='gold_60day_upgrade_credit' type='number' step='0.01' defaultValue={((Number(p.gold_60day_upgrade_credit_cents ?? 0)) / 100).toFixed(2)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white font-mono' />
                </label>
                <label className='text-[10px] text-zinc-500 font-bold uppercase'>
                  Credit Expire (Mo)
                  <input name='credit_expiration_months' type='number' defaultValue={Number(p.credit_expiration_months ?? 12)} className='w-full mt-1.5 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white font-mono' />
                </label>
              </div>

              <label className='block text-[10px] text-zinc-500 font-bold uppercase border-t border-white/5 pt-3'>
                Benefits (One per line)
                <textarea name='benefits' rows={3} defaultValue={Array.isArray(p.benefits) ? p.benefits.join('\n') : ''} className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white font-medium' />
              </label>
              <label className='block text-[10px] text-zinc-500 font-bold uppercase'>
                Included Services (One per line)
                <textarea name='included_services' rows={2} defaultValue={Array.isArray(p.included_services) ? p.included_services.join('\n') : ''} className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white font-medium' />
              </label>
              
              <div className='mt-3 flex flex-wrap gap-4 text-xs text-zinc-300 border-t border-white/5 pt-3'>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type='checkbox' name='show_on_homepage' defaultChecked={p.show_on_homepage !== false} className='accent-gold' />Homepage</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type='checkbox' name='show_on_services' defaultChecked={p.show_on_services !== false} className='accent-gold' />Services</label>
                <label className="flex items-center gap-1.5 cursor-pointer"><input type='checkbox' name='archived' defaultChecked={p.archived === true} className='accent-gold' />Archived</label>
              </div>

              <button className='w-full rounded-xl bg-gold py-3 text-xs font-black uppercase text-black hover:brightness-110 transition mt-2'>
                Save {String(p.name ?? 'Plan')} Configuration
              </button>
              
              <p className='text-center text-[9px] text-zinc-500 font-mono'>
                Monthly: {money(p.price_monthly_cents ?? p.price_cents)} · Weekly: {money(p.price_weekly_cents)} · Yearly: {money(p.price_yearly_cents)}
              </p>
            </form>
          </GlassCard>
        ))}
      </section>

      {/* THREE INTERACTIVE PANELS GRID */}
      <section className='grid gap-6 lg:grid-cols-3 mb-8'>
        {/* LOYALTY RULES */}
        <GlassCard className="border-white/10 bg-zinc-950/40 flex flex-col justify-between">
          <form action={saveLoyaltyRuleAction} className="space-y-4">
            <div>
              <SectionEyebrow>Loyalty Rules</SectionEyebrow>
              <p className='mt-1 text-xs text-zinc-500'>Set reward card parameters for dashboard views.</p>
            </div>
            <input type='hidden' name='id' value={String(rules[0]?.id ?? '')} />
            
            <label className="block text-xs text-zinc-400">
              Rule Name
              <input name='name' defaultValue={String(rules[0]?.name ?? 'Default punch card')} className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white' />
            </label>
            <label className="block text-xs text-zinc-400">
              Punches Required
              <input name='services_required' type='number' defaultValue={Number(rules[0]?.services_required ?? 5)} className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white font-mono' />
            </label>
            <label className="block text-xs text-zinc-400">
              Reward Description Text
              <textarea name='reward_description' defaultValue={String(rules[0]?.reward_description ?? 'Complete 5 services, unlock 6th wash/free reward.')} className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white' rows={3} />
            </label>
            
            <label className='flex items-center gap-2 text-xs text-zinc-300 cursor-pointer pt-1'>
              <input type='checkbox' name='active' defaultChecked={rules[0]?.active !== false} className='accent-gold' />
              Rule is active
            </label>
            
            <button className='w-full rounded-xl bg-gold py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition'>
              Save Loyalty Rule
            </button>
          </form>
        </GlassCard>

        {/* ASSIGN MEMBERSHIP */}
        <GlassCard className="border-white/10 bg-zinc-950/40 flex flex-col justify-between">
          <form action={assignCustomerMembershipAction} className="space-y-4">
            <div>
              <SectionEyebrow>Assign Customer Membership</SectionEyebrow>
              <p className='mt-1 text-xs text-zinc-500'>Manually allocate a tier level plan to a customer.</p>
            </div>
            
            <label className="block text-xs text-zinc-400">
              Select Customer
              <select name='customer_id' className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white'>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email || c.id}</option>)}
              </select>
            </label>
            
            <label className="block text-xs text-zinc-400">
              Select Plan
              <select name='membership_plan_id' className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white'>
                {publicPlans.map((p) => <option key={String(p.id)} value={String(p.id)}>{String(p.name)}</option>)}
              </select>
            </label>
            
            <label className="block text-xs text-zinc-400">
              Notes
              <textarea name='notes' placeholder='Optional internal note...' className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white' rows={3} />
            </label>
            
            <button className='w-full rounded-xl bg-gold py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition mt-2'>
              Assign Membership
            </button>
          </form>
        </GlassCard>

        {/* MANUAL LOYALTY STAMPS */}
        <GlassCard className="border-white/10 bg-zinc-950/40 flex flex-col justify-between">
          <form action={addManualLoyaltyStampAction} className="space-y-4">
            <div>
              <SectionEyebrow>Manual Punch Controls</SectionEyebrow>
              <p className='mt-1 text-xs text-zinc-500'>Credit or void customer loyalty punches manually.</p>
            </div>
            
            <label className="block text-xs text-zinc-400">
              Select Customer
              <select name='customerId' required className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-xs text-white'>
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.full_name || c.email || c.id}</option>)}
              </select>
            </label>
            
            <div className='grid grid-cols-2 gap-2'>
              <label className='block text-[10px] text-zinc-500 font-bold uppercase'>
                Punches Count
                <input name='stampCount' type='number' defaultValue={1} min={1} max={10} className='mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 text-xs text-white font-mono' />
              </label>
              <label className='block text-[10px] text-zinc-500 font-bold uppercase'>
                Type
                <select name='source' className='mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-xs text-white'>
                  <option value='admin_manual'>Admin Manual</option>
                  <option value='tech_manual'>Tech Manual</option>
                  <option value='membership_bonus'>Membership Bonus</option>
                  <option value='correction_void'>Correction/Void</option>
                </select>
              </label>
            </div>
            
            <label className='block text-xs text-zinc-400'>
              Note / Reason
              <input name='reason' placeholder='e.g., Makegood, referral adjustment' required className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white' />
            </label>
            
            <button type='submit' className='w-full rounded-xl bg-gold py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition mt-2'>
              Award Punches
            </button>
          </form>
        </GlassCard>
      </section>

      {/* ACTIVE MEMBERSHIPS */}
      <GlassCard className="mb-8 border-white/10 bg-zinc-950/40">
        <SectionEyebrow className="mb-4">Active Customer Memberships</SectionEyebrow>
        <div className='grid gap-3 max-h-[300px] overflow-y-auto pr-1.5'>
          {((membershipsRes.data ?? []) as any[]).map((m) => {
            const custId = m.customers?.id || m.customer_id;
            return (
              <div key={m.id} className='flex items-center justify-between gap-4 rounded-xl border border-white/5 px-4 py-3 text-xs text-zinc-300 bg-black/30 hover:border-white/10 transition'>
                <div>
                  <span className="font-bold text-white">
                    {m.customers?.full_name || m.customers?.email || 'Customer'}
                  </span>{' '}
                  — <span className="text-gold-soft font-bold">{m.membership_plans?.name || 'Plan'}</span> —{' '}
                  <span className="text-[10px] font-black uppercase text-zinc-500">{m.status}</span>
                </div>
                {custId && (
                  <CustomerCreditsManager
                    customerId={custId}
                    credits={[]}
                    redemptions={[]}
                    showCompactButtonOnly
                  />
                )}
              </div>
            );
          })}
          {((membershipsRes.data ?? []) as any[]).length === 0 && (
            <p className="text-xs text-zinc-500 italic py-4">No active customer subscriptions on record.</p>
          )}
        </div>
      </GlassCard>

      {/* LOYALTY CARD ARTWORK */}
      <GlassCard className="mb-8 border-white/10 bg-zinc-950/40 space-y-6">
        <div>
          <SectionEyebrow>Loyalty Card Designs</SectionEyebrow>
          <p className='mt-1 text-xs text-zinc-500'>Upload and configure front/back images for the interactive 3D digital cards.</p>
        </div>

        {/* Upload Form */}
        <form action={saveLoyaltyCardDesignAction} method="POST" encType="multipart/form-data" className='rounded-2xl border border-white/5 bg-black/45 p-5 space-y-4'>
          <p className='text-[10px] font-black uppercase tracking-wider text-gold-soft'>Upload New Art Design</p>
          
          <div className='grid gap-4 sm:grid-cols-3'>
            <label className='block text-xs text-zinc-400'>
              Design Name
              <input name='name' placeholder='e.g., Gloss Boss Gold Edition' required className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white' />
            </label>
            <label className='block text-xs text-zinc-400'>
              Assign to Tier
              <select name='tier' className='mt-1.5 w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-xs text-white'>
                <option value='default'>Default Loyalty Card</option>
                <option value='bronze'>Bronze Tier</option>
                <option value='silver'>Silver Tier</option>
                <option value='gold'>Gold Tier</option>
                <option value='custom'>Custom/Other Tier</option>
              </select>
            </label>
            <label className='block text-xs text-zinc-400 flex items-end'>
              <span className='flex items-center gap-2 text-zinc-300 pb-2.5 cursor-pointer'>
                <input type='checkbox' name='active' className='accent-gold h-4 w-4' />
                Set design active immediately
              </span>
            </label>
          </div>

          <div className='grid gap-4 sm:grid-cols-2'>
            <label className='block text-xs text-zinc-400'>
              Front Card Image (Recommended size: 3.5 × 2 in, 300 DPI, PNG)
              <input name='frontImage' type='file' accept='image/png, image/jpeg, image/webp' required className='mt-1.5 w-full text-xs text-zinc-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:bg-gold file:text-black file:uppercase file:cursor-pointer' />
            </label>
            <label className='block text-xs text-zinc-400'>
              Back Card Image (Recommended size: 3.5 × 2 in, 300 DPI, PNG)
              <input name='backImage' type='file' accept='image/png, image/jpeg, image/webp' required className='mt-1.5 w-full text-xs text-zinc-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:bg-gold file:text-black file:uppercase file:cursor-pointer' />
            </label>
          </div>

          <button type='submit' className='rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition'>
            Upload Card Design
          </button>
        </form>

        {/* Existing Designs Grid */}
        <div className='space-y-4'>
          <p className='text-xs font-black uppercase tracking-wider text-zinc-500'>Uploaded Card Design Assets</p>
          {designs.length === 0 ? (
            <p className='text-xs italic text-zinc-500'>No card designs uploaded yet.</p>
          ) : (
            <div className='grid gap-6 sm:grid-cols-2'>
              {designs.map((d) => (
                <div key={d.id} className='rounded-2xl border border-white/5 bg-black/30 p-5 space-y-4 flex flex-col justify-between hover:border-white/10 transition'>
                  <div>
                    <div className='flex justify-between items-start gap-2 border-b border-white/5 pb-3'>
                      <div>
                        <h4 className='text-sm font-bold text-white'>{d.name}</h4>
                        <p className='text-[9px] text-zinc-500 uppercase tracking-wider font-mono mt-0.5'>Tier: {d.tier}</p>
                      </div>
                      <div className='flex gap-1.5'>
                        {d.active && (
                          <span className='rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-0.5 text-[8px] font-black uppercase text-emerald-300'>
                            Active
                          </span>
                        )}
                        {d.archived && (
                          <span className='rounded-full bg-zinc-500/15 border border-white/10 px-2.5 py-0.5 text-[8px] font-black uppercase text-zinc-400'>
                            Archived
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Previews */}
                    <div className="mt-3">
                      <LoyaltyCardPreviewConsole design={d} />
                    </div>
                  </div>

                  {/* Actions Form */}
                  <form action={saveLoyaltyCardDesignAction} method="POST" className='flex items-center justify-between gap-3 border-t border-white/5 pt-3 mt-1 text-xs'>
                    <input type='hidden' name='id' value={d.id} />
                    <input type='hidden' name='name' value={d.name} />
                    <input type='hidden' name='tier' value={d.tier} />
                    <input type='hidden' name='front_image_url_existing' value={d.front_image_url || ''} />
                    <input type='hidden' name='front_image_path_existing' value={d.front_image_path || ''} />
                    <input type='hidden' name='back_image_url_existing' value={d.back_image_url || ''} />
                    <input type='hidden' name='back_image_path_existing' value={d.back_image_path || ''} />

                    <div className="flex gap-4">
                      <label className='flex items-center gap-1.5 text-zinc-300 cursor-pointer font-medium'>
                        <input type='checkbox' name='active' defaultChecked={d.active} className='accent-gold' />
                        Active
                      </label>
                      <label className='flex items-center gap-1.5 text-zinc-300 cursor-pointer font-medium'>
                        <input type='checkbox' name='archived' defaultChecked={d.archived} className='accent-gold' />
                        Archived
                      </label>
                    </div>

                    <button type='submit' className='rounded-lg bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-[10px] font-black uppercase text-white transition'>
                      Update Status
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      </GlassCard>

      <GlassCard className='border-white/10 bg-zinc-950/40'>
        <SectionEyebrow>Public Preview</SectionEyebrow>
        <p className='mt-2 text-xs text-zinc-400'>Inspect the memberships presentation page as viewed by customers.</p>
        <a href='/memberships' target='_blank' rel='noreferrer' className='mt-4 inline-block rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition'>
          View Public Memberships Page
        </a>
      </GlassCard>
    </DashboardShell>
  );
}
