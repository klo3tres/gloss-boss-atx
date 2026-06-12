'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Settings, 
  X, 
  Tag, 
  Percent, 
  Calendar, 
  Archive, 
  Clock, 
  AlertCircle, 
  CheckCircle,
  HelpCircle,
  FolderOpen
} from 'lucide-react';
import { savePromoCodeAction, archivePromoCodeAction } from '@/app/(dashboard)/admin/promotions/promo-code-actions';

type PromoRow = Record<string, any>;

export function PromotionsManager({ otherRows }: { otherRows: PromoRow[] }) {
  const [activeTab, setActiveTab] = useState<'active' | 'scheduled' | 'expired'>('active');
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const now = new Date();

  // Categorize promo codes
  const categorized = useMemo(() => {
    const active: PromoRow[] = [];
    const scheduled: PromoRow[] = [];
    const expired: PromoRow[] = [];

    for (const r of otherRows) {
      const isEnabled = r.enabled === true;
      const start = r.starts_at ? new Date(r.starts_at) : null;
      const end = r.ends_at ? new Date(r.ends_at) : null;
      
      const inPast = end && end < now;
      const inFuture = start && start > now;

      if (!isEnabled || inPast) {
        expired.push(r);
      } else if (inFuture) {
        scheduled.push(r);
      } else {
        active.push(r);
      }
    }

    return { active, scheduled, expired };
  }, [otherRows, now]);

  const activePromo = otherRows.find(r => String(r.id) === editingPromoId) ?? null;

  const rulesJson = (r: PromoRow) => {
    if (r.rules && typeof r.rules === 'object') return JSON.stringify(r.rules, null, 2);
    return '{"appliesTo":"order"}';
  };

  const serviceRestrictionsText = (v: any) => {
    if (Array.isArray(v)) return v.join(', ');
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed.join(', ');
      } catch {
        return v;
      }
    }
    return '';
  };

  return (
    <div className="space-y-6">
      {/* Top Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/40 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex rounded-xl bg-black/60 border border-white/10 p-1">
          {[
            { id: 'active', label: `Active (${categorized.active.length})`, color: 'text-emerald-400' },
            { id: 'scheduled', label: `Scheduled (${categorized.scheduled.length})`, color: 'text-purple-400' },
            { id: 'expired', label: `Expired/Paused (${categorized.expired.length})`, color: 'text-zinc-400' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                activeTab === t.id 
                  ? 'bg-gold/15 text-gold-soft border border-gold/25' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300 shadow-[0_4px_20px_rgba(212,175,55,0.15)]"
        >
          <Plus className="h-4 w-4 stroke-[3]" />
          Create Promo Code
        </button>
      </div>

      {/* Grid List */}
      <div className="relative min-h-[200px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div className="grid gap-6 md:grid-cols-2">
              {categorized[activeTab].map((r) => {
                const discountClassLabel = 
                  r.discount_type === 'percent' ? `${r.discount_value}% Off` :
                  r.discount_type === 'amount' ? `$${(Number(r.discount_value) || 0).toFixed(2)} Off` :
                  'Comp / Free';

                return (
                  <div
                    key={String(r.id)}
                    className={`rounded-2xl border border-white/5 bg-zinc-950/40 p-5 flex flex-col justify-between hover:border-gold/20 transition duration-300 relative group`}
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-base font-black text-white font-mono uppercase tracking-tight group-hover:text-gold-soft transition">
                            {String(r.code)}
                          </h3>
                          <p className="text-xs text-zinc-400 mt-1">{String(r.description || '(No description)')}</p>
                        </div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                          activeTab === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          activeTab === 'scheduled' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                          'bg-zinc-800 text-zinc-500'
                        }`}>
                          {discountClassLabel}
                        </span>
                      </div>

                      {/* Info lines */}
                      <div className="border-t border-white/5 pt-3 space-y-1.5 text-[11px] text-zinc-400">
                        {r.service_restrictions && serviceRestrictionsText(r.service_restrictions) && (
                          <p className="truncate">
                            <span className="text-zinc-500">Applies to:</span>{' '}
                            <strong className="text-zinc-300 font-medium">
                              {serviceRestrictionsText(r.service_restrictions)}
                            </strong>
                          </p>
                        )}
                        {r.starts_at && (
                          <p>
                            <span className="text-zinc-500">Starts:</span>{' '}
                            <strong className="text-zinc-300 font-mono font-normal">
                              {new Date(r.starts_at).toLocaleDateString()}
                            </strong>
                          </p>
                        )}
                        {r.ends_at && (
                          <p>
                            <span className="text-zinc-500">Ends:</span>{' '}
                            <strong className="text-zinc-300 font-mono font-normal">
                              {new Date(r.ends_at).toLocaleDateString()}
                            </strong>
                          </p>
                        )}
                        {r.max_uses != null && (
                          <p>
                            <span className="text-zinc-500">Limits:</span>{' '}
                            <strong className="text-zinc-300 font-mono font-normal">
                              {r.max_uses} max uses
                            </strong>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-4 mt-4 border-t border-white/5 flex justify-between items-center">
                      <button
                        onClick={() => setEditingPromoId(String(r.id))}
                        className="text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white transition flex items-center gap-1 bg-zinc-900 border border-white/5 px-2.5 py-1.5 rounded-lg"
                      >
                        <Settings className="h-3.5 w-3.5 text-gold-soft" /> Configure
                      </button>

                      <form
                        action={async (fd) => {
                          if (!window.confirm(`Archive promotion code ${r.code}?`)) return;
                          await archivePromoCodeAction(fd);
                          window.location.reload();
                        }}
                      >
                        <input type="hidden" name="id" value={String(r.id)} />
                        <button type="submit" className="text-[10px] font-black uppercase text-rose-400/80 hover:text-rose-300 transition flex items-center gap-1.5 bg-rose-500/5 border border-rose-500/10 px-2.5 py-1.5 rounded-lg">
                          <Archive className="h-3.5 w-3.5" /> Archive
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
              {categorized[activeTab].length === 0 && (
                <div className="col-span-2 py-16 text-center rounded-2xl border border-dashed border-white/5 flex flex-col items-center justify-center p-4">
                  <FolderOpen className="h-7 w-7 text-zinc-800 mb-1" />
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">No Promotions In This State</p>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* CREATE NEW PROMO CODE DRAWER */}
      <AnimatePresence>
        {isCreateOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
              className="fixed inset-0 z-50 bg-black"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">Create Promotion</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Generate a new custom promotion code.</p>
                </div>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                action={async (fd) => {
                  await savePromoCodeAction(fd);
                  setIsCreateOpen(false);
                  window.location.reload();
                }}
                className="flex-1 overflow-y-auto py-5 space-y-4 pr-1 scrollbar-thin scrollbar-thumb-zinc-900"
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Promo Code (Uppercase letters/numbers)</label>
                  <input
                    name="code"
                    required
                    placeholder="e.g. SUMMER20"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white font-bold uppercase focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Description / Label</label>
                  <input
                    name="description"
                    placeholder="e.g. 20% off summer mobile wash details"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Discount Type</label>
                    <select
                      name="discountType"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition"
                    >
                      <option value="percent">Percent (%) Discount</option>
                      <option value="amount">Fixed Dollar ($) Discount</option>
                      <option value="comp">Comp / Free (100%)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Value (Rate or cents)</label>
                    <input
                      name="discountValue"
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="e.g. 20 or 15.00"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Service Restrictions (Optional, comma-separated slugs)</label>
                  <input
                    name="serviceRestrictions"
                    placeholder="e.g. ceramic-coating, full-detail"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Starts At</label>
                    <input
                      name="startsAt"
                      type="datetime-local"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Ends At</label>
                    <input
                      name="endsAt"
                      type="datetime-local"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Max Uses Limit</label>
                    <input
                      name="maxUses"
                      type="number"
                      min="0"
                      placeholder="e.g. 100"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Rules JSON Configuration</label>
                    <input
                      name="rulesJson"
                      defaultValue='{"appliesTo":"order"}'
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 focus:ring-1 focus:ring-gold/30 outline-none transition font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-black/40 border border-white/5 p-4 rounded-2xl">
                  <input
                    name="enabled"
                    type="checkbox"
                    id="new_promo_enabled"
                    defaultChecked
                    className="h-4.5 w-4.5 accent-gold cursor-pointer"
                  />
                  <label htmlFor="new_promo_enabled" className="text-xs font-bold text-zinc-200 cursor-pointer">
                    Code is active immediately
                  </label>
                </div>

                <div className="pt-4 border-t border-white/5 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300"
                  >
                    Save Promotion
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* EDIT PROMO CODE DRAWER */}
      <AnimatePresence>
        {activePromo && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingPromoId(null)}
              className="fixed inset-0 z-50 bg-black"
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">Configure Promotion</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Edit parameters for code: {String(activePromo.code)}</p>
                </div>
                <button
                  onClick={() => setEditingPromoId(null)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                action={async (fd) => {
                  await savePromoCodeAction(fd);
                  setEditingPromoId(null);
                  window.location.reload();
                }}
                className="flex-1 overflow-y-auto py-5 space-y-4 pr-1 scrollbar-thin scrollbar-thumb-zinc-900"
              >
                <input type="hidden" name="id" value={String(activePromo.id)} />

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Promo Code</label>
                  <input
                    name="code"
                    defaultValue={String(activePromo.code)}
                    required
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white font-bold uppercase focus:border-gold/40 transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Description / Label</label>
                  <input
                    name="description"
                    defaultValue={String(activePromo.description ?? '')}
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Discount Type</label>
                    <select
                      name="discountType"
                      defaultValue={String(activePromo.discount_type ?? 'percent')}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition"
                    >
                      <option value="percent">Percent (%) Discount</option>
                      <option value="amount">Fixed Dollar ($) Discount</option>
                      <option value="comp">Comp / Free (100%)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Value (Rate or cents)</label>
                    <input
                      name="discountValue"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={String(activePromo.discount_value ?? '')}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Service Restrictions (Optional, comma-separated slugs)</label>
                  <input
                    name="serviceRestrictions"
                    defaultValue={serviceRestrictionsText(activePromo.service_restrictions)}
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Starts At</label>
                    <input
                      name="startsAt"
                      type="datetime-local"
                      defaultValue={activePromo.starts_at ? String(activePromo.starts_at).slice(0, 16) : ''}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Ends At</label>
                    <input
                      name="endsAt"
                      type="datetime-local"
                      defaultValue={activePromo.ends_at ? String(activePromo.ends_at).slice(0, 16) : ''}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Max Uses Limit</label>
                    <input
                      name="maxUses"
                      type="number"
                      min="0"
                      defaultValue={activePromo.max_uses ? String(activePromo.max_uses) : ''}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Rules JSON Configuration</label>
                    <input
                      name="rulesJson"
                      defaultValue={rulesJson(activePromo)}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:border-gold/40 transition font-mono"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2.5 bg-black/40 border border-white/5 p-4 rounded-2xl">
                  <input
                    name="enabled"
                    type="checkbox"
                    id="edit_promo_enabled"
                    defaultChecked={activePromo.enabled === true}
                    className="h-4.5 w-4.5 accent-gold cursor-pointer"
                  />
                  <label htmlFor="edit_promo_enabled" className="text-xs font-bold text-zinc-200 cursor-pointer">
                    Code is active and enabled
                  </label>
                </div>

                <div className="pt-4 border-t border-white/5 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingPromoId(null)}
                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300"
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
