'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  X, 
  Award, 
  Sparkles, 
  Percent, 
  HelpCircle, 
  DollarSign, 
  Calendar, 
  Zap, 
  ShieldCheck, 
  PlusCircle, 
  Bookmark, 
  Layers, 
  Clock, 
  FileText 
} from 'lucide-react';
import { saveMembershipPlanAction } from '@/app/(dashboard)/admin/memberships/actions';

type PlanProps = {
  id: string;
  name: string | null;
  slug: string | null;
  tier: string | null;
  price_cents: number | null;
  price_weekly_cents: number | null;
  price_biweekly_cents: number | null;
  price_monthly_cents: number | null;
  price_yearly_cents: number | null;
  billing_interval: string | null;
  discount_percent: number | null;
  punch_multiplier: number | null;
  bonus_punches: number | null;
  reward_threshold: number | null;
  reward_description: string | null;
  gold_60day_upgrade_credit_cents: number | null;
  credit_expiration_months: number | null;
  benefits: string[] | null;
  included_services: string[] | null;
  show_on_homepage: boolean | null;
  show_on_services: boolean | null;
  archived: boolean | null;
};

export function MembershipPlansManager({ publicPlans }: { publicPlans: PlanProps[] }) {
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);

  const activePlan = publicPlans.find(p => p.id === editingPlanId);

  const getTierColorClass = (tier: string | null) => {
    const t = String(tier ?? '').toLowerCase();
    if (t === 'gold') return { border: 'border-amber-500/35 hover:border-amber-500/70', bg: 'from-amber-950/20 via-zinc-950 to-black', text: 'text-amber-400', glow: 'shadow-[0_0_24px_rgba(212,175,55,0.06)]' };
    if (t === 'silver') return { border: 'border-zinc-500/35 hover:border-zinc-500/70', bg: 'from-zinc-900/10 via-zinc-950 to-black', text: 'text-zinc-300', glow: 'shadow-[0_0_24px_rgba(255,255,255,0.03)]' };
    if (t === 'bronze') return { border: 'border-orange-700/35 hover:border-orange-700/70', bg: 'from-orange-950/10 via-zinc-950 to-black', text: 'text-orange-400', glow: 'shadow-[0_0_24px_rgba(194,120,3,0.04)]' };
    return { border: 'border-white/5 hover:border-white/20', bg: 'from-zinc-950 via-zinc-950 to-black', text: 'text-zinc-400', glow: '' };
  };

  return (
    <div className="space-y-6">
      {/* Tier Plans Grid */}
      <section className="grid gap-6 md:grid-cols-3">
        {publicPlans.map((p) => {
          const tc = getTierColorClass(p.tier);
          const monthlyPrice = p.price_monthly_cents ?? p.price_cents ?? 0;
          
          return (
            <div
              key={p.id}
              className={`rounded-3xl border bg-gradient-to-br ${tc.bg} ${tc.border} ${tc.glow} p-6 flex flex-col justify-between transition-all duration-300 group`}
            >
              <div className="space-y-4">
                {/* Plan Header */}
                <div className="flex items-center justify-between border-b border-white/5 pb-3.5">
                  <div>
                    <h3 className="font-black text-white text-base uppercase tracking-wider">{p.name || 'Unnamed Tier'}</h3>
                    <p className={`text-[10px] font-black uppercase tracking-wider font-mono mt-0.5 ${tc.text}`}>
                      {p.tier || 'default'} tier
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingPlanId(p.id)}
                    className="p-2 bg-zinc-900/60 border border-white/5 group-hover:border-gold/30 rounded-xl text-zinc-400 hover:text-white transition duration-200"
                  >
                    <Settings className="h-4 w-4" />
                  </button>
                </div>

                {/* Pricing / Key Statistics Badge */}
                <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Monthly Billing</p>
                    <p className="text-xl font-black text-white mt-1 font-mono">
                      ${(monthlyPrice / 100).toFixed(0)}<span className="text-xs text-zinc-500 font-normal">/mo</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Discount</p>
                    <p className="text-lg font-black text-gold-soft mt-1 font-mono flex items-center justify-end gap-0.5">
                      <Percent className="h-3.5 w-3.5" />{p.discount_percent ?? 0}%
                    </p>
                  </div>
                </div>

                {/* Loyalty Rules summary */}
                <div className="grid grid-cols-2 gap-3 text-[11px] bg-zinc-900/20 border border-white/5 p-3 rounded-xl">
                  <div>
                    <span className="text-zinc-500 block">Punch Multiplier</span>
                    <strong className="text-zinc-200 font-mono">x{p.punch_multiplier ?? 1.0}</strong>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Reward Threshold</span>
                    <strong className="text-zinc-200 font-mono">{p.reward_threshold ?? 5} punches</strong>
                  </div>
                </div>

                {/* Benefits Bullet Points */}
                {p.benefits && p.benefits.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Benefits & Inclusions</p>
                    <ul className="space-y-1.5 text-xs text-zinc-400">
                      {p.benefits.slice(0, 4).map((b, idx) => (
                        <li key={idx} className="flex gap-2 items-start leading-relaxed">
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold-soft" />
                          <span>{b}</span>
                        </li>
                      ))}
                      {p.benefits.length > 4 && (
                        <li className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider pl-3.5">
                          + {p.benefits.length - 4} more benefits
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>

              {/* Bottom Quick Configure Action */}
              <div className="pt-6 mt-6 border-t border-white/5 flex gap-2">
                <button
                  onClick={() => setEditingPlanId(p.id)}
                  className="w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider bg-zinc-900 border border-white/5 text-zinc-300 hover:border-zinc-700 hover:text-white transition duration-200"
                >
                  Configure Tier Settings
                </button>
              </div>
            </div>
          );
        })}
      </section>

      {/* PLAN SLIDE-OUT EDIT DRAWER */}
      <AnimatePresence>
        {activePlan && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPlanId(null)}
              className="fixed inset-0 z-50 bg-black"
            />

            {/* Slide-over Drawer Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)]"
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">Configure Membership</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Customize properties and rules for {activePlan.name}.</p>
                </div>
                <button
                  onClick={() => setEditingPlanId(null)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Drawer Configuration Form */}
              <form
                action={async (fd) => {
                  await saveMembershipPlanAction(fd);
                  setEditingPlanId(null);
                }}
                className="flex-1 overflow-y-auto py-5 space-y-5 pr-1 scrollbar-thin scrollbar-thumb-zinc-900"
              >
                <input type="hidden" name="id" value={activePlan.id} />

                {/* Tier Metadata */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Plan Display Name</label>
                    <input
                      name="name"
                      defaultValue={activePlan.name ?? ''}
                      required
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Tier identifier</label>
                    <input
                      name="tier"
                      defaultValue={activePlan.tier ?? ''}
                      required
                      placeholder="e.g. gold, silver"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 font-mono"
                    />
                  </div>
                </div>

                {/* Pricing Structure */}
                <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-gold-soft flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5" /> Pricing Configurations
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Weekly rate ($)</label>
                      <input
                        name="price_weekly"
                        type="number"
                        step="0.01"
                        defaultValue={((activePlan.price_weekly_cents ?? 0) / 100).toFixed(2)}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Bi-Weekly rate ($)</label>
                      <input
                        name="price_biweekly"
                        type="number"
                        step="0.01"
                        defaultValue={((activePlan.price_biweekly_cents ?? 0) / 100).toFixed(2)}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Monthly rate ($)</label>
                      <input
                        name="price_monthly"
                        type="number"
                        step="0.01"
                        defaultValue={((activePlan.price_monthly_cents ?? activePlan.price_cents ?? 0) / 100).toFixed(2)}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Yearly rate ($)</label>
                      <input
                        name="price_yearly"
                        type="number"
                        step="0.01"
                        defaultValue={((activePlan.price_yearly_cents ?? 0) / 100).toFixed(2)}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Discount Percent (%)</label>
                      <input
                        name="discount_percent"
                        type="number"
                        defaultValue={activePlan.discount_percent ?? 0}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Billing Interval</label>
                      <select
                        name="billing_interval"
                        defaultValue={activePlan.billing_interval ?? 'monthly'}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2 py-2 text-white"
                      >
                        <option value="weekly">Weekly</option>
                        <option value="bi-weekly">Bi-weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="one-time">One-time</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Loyalty Card Rules */}
                <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-gold-soft flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" /> Loyalty & Punches Rules
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Multiplier</label>
                      <input
                        name="punch_multiplier"
                        type="number"
                        step="0.05"
                        defaultValue={activePlan.punch_multiplier ?? 1.0}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Bonus Punches</label>
                      <input
                        name="bonus_punches"
                        type="number"
                        defaultValue={activePlan.bonus_punches ?? 0}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Threshold</label>
                      <input
                        name="reward_threshold"
                        type="number"
                        defaultValue={activePlan.reward_threshold ?? 5}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[9px] uppercase font-bold text-zinc-500">Reward Description Text</label>
                    <input
                      name="reward_description"
                      defaultValue={activePlan.reward_description ?? 'Complete 5 services, unlock 6th wash/free reward.'}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-white"
                    />
                  </div>
                </div>

                {/* Upgrade & Credits Settings */}
                <div className="bg-black/30 border border-white/5 p-4 rounded-2xl space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-gold-soft flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" /> Upgrade Credits Configurations
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Gold Upgrade Credit ($)</label>
                      <input
                        name="gold_60day_upgrade_credit"
                        type="number"
                        step="0.01"
                        defaultValue={((activePlan.gold_60day_upgrade_credit_cents ?? 0) / 100).toFixed(2)}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] uppercase font-bold text-zinc-500">Credit Expiration (Months)</label>
                      <input
                        name="credit_expiration_months"
                        type="number"
                        defaultValue={activePlan.credit_expiration_months ?? 12}
                        className="w-full text-xs rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-white font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Benefits & Inclusions Textareas */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Benefits List (one per line)</label>
                    <textarea
                      name="benefits"
                      rows={3}
                      defaultValue={Array.isArray(activePlan.benefits) ? activePlan.benefits.join('\n') : ''}
                      placeholder="e.g. 15% off all details&#10;Priority dispatch scheduling&#10;Complimentary water bottles"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Included Services List (one per line)</label>
                    <textarea
                      name="included_services"
                      rows={2}
                      defaultValue={Array.isArray(activePlan.included_services) ? activePlan.included_services.join('\n') : ''}
                      placeholder="e.g. Ceramic coating wash&#10;Paint correction review"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
                    />
                  </div>
                </div>

                {/* Visibility Flags */}
                <div className="border-t border-white/5 pt-4 flex flex-wrap gap-4 text-xs text-zinc-300">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      name="show_on_homepage" 
                      defaultChecked={activePlan.show_on_homepage !== false} 
                      className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4.5 w-4.5" 
                    />
                    <span>Show on Homepage</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      name="show_on_services" 
                      defaultChecked={activePlan.show_on_services !== false} 
                      className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4.5 w-4.5" 
                    />
                    <span>Show on Services</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      name="archived" 
                      defaultChecked={activePlan.archived === true} 
                      className="rounded border-zinc-700 bg-black text-gold focus:ring-gold/30 h-4.5 w-4.5" 
                    />
                    <span>Archive Plan</span>
                  </label>
                </div>

                {/* Action buttons */}
                <div className="pt-5 border-t border-white/5 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingPlanId(null)}
                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
