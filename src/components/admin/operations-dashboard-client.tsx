'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ToastActionForm } from '@/components/ui/toast-action-form';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import {
  addBusinessExpenseActionState,
  addJobMileageLogActionState,
  deleteJobMileageLogActionState,
  updateJobMileageLogActionState,
} from '@/app/(dashboard)/admin/operations/operations-actions';
import { ExpenseReceiptUpload } from '@/components/admin/expense-receipt-upload';
import { GlassCard, PremiumBadge, SectionEyebrow } from '@/components/ui/premium';
import { 
  DollarSign, 
  MapPin, 
  Calendar, 
  Plus, 
  FileText, 
  ChevronRight, 
  Fuel, 
  Wrench, 
  AlertTriangle, 
  Eye, 
  X, 
  Download, 
  TrendingDown, 
  Layers, 
  Edit3, 
  Trash2,
  Settings
} from 'lucide-react';

function money(cents: unknown) {
  const n = typeof cents === 'number' ? cents : 0;
  return `$${(n / 100).toFixed(2)}`;
}

export function OperationsDashboardClient({
  expenses,
  mileage,
  mileageSummary,
  mapsAutoNote,
  schemaReady,
}: {
  expenses: Record<string, any>[];
  mileage: Record<string, any>[];
  mileageSummary?: { today: number; month: number; year: number; lifetime: number };
  mapsAutoNote?: boolean;
  schemaReady: boolean;
}) {
  const [msg, setMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'expenses' | 'mileage'>('expenses');
  
  // Drawer states
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [isLogMileageOpen, setIsLogMileageOpen] = useState(false);
  const [editingMileageId, setEditingMileageId] = useState<string | null>(null);

  // Compute expenses stats
  const expenseStats = useMemo(() => {
    const totalCents = expenses.reduce((s, e) => s + (Number(e.amount_cents) || 0), 0);
    const count = expenses.length;
    
    // This month
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth();
    const monthCents = expenses.reduce((s, e) => {
      const dateStr = String(e.incurred_on ?? e.incurred_at ?? e.created_at ?? '');
      if (!dateStr) return s;
      const d = new Date(dateStr);
      if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
        return s + (Number(e.amount_cents) || 0);
      }
      return s;
    }, 0);

    return { totalCents, count, monthCents };
  }, [expenses]);

  // Find active mileage log details for editing
  const activeMileageLog = useMemo(() => {
    if (!editingMileageId) return null;
    return mileage.find(m => String(m.id) === editingMileageId) ?? null;
  }, [mileage, editingMileageId]);

  return (
    <div className="space-y-6">
      {/* Messages */}
      <AnimatePresence>
        {msg && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center justify-between rounded-xl border border-gold/30 bg-black/90 p-4 text-sm text-gold-soft shadow-[0_0_24px_rgba(212,175,55,0.15)]"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-gold rotate-45" />
              <span>{msg}</span>
            </div>
            <button onClick={() => setMsg(null)} className="text-zinc-400 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global Tab Selection Panel */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/40 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex rounded-xl bg-black/60 border border-white/10 p-1">
          <button
            onClick={() => setActiveTab('expenses')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === 'expenses' ? 'bg-gold/15 text-gold-soft border border-gold/25' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Expenses & Costs
          </button>
          <button
            onClick={() => setActiveTab('mileage')}
            className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === 'mileage' ? 'bg-gold/15 text-gold-soft border border-gold/25' : 'text-zinc-400 hover:text-white'
            }`}
          >
            Mileage Tracking
          </button>
        </div>

        <div className="flex items-center gap-2.5">
          {activeTab === 'expenses' ? (
            <>
              <a
                href="/api/admin/operations/expenses-export"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-white/5 hover:border-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 transition duration-200"
              >
                <Download className="h-3.5 w-3.5" /> Export Expenses
              </a>
              <button
                onClick={() => setIsAddExpenseOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300 shadow-[0_4px_20px_rgba(212,175,55,0.15)]"
              >
                <Plus className="h-4 w-4 stroke-[3]" /> Add Expense
              </button>
            </>
          ) : (
            <>
              <a
                href="/api/admin/operations/mileage-export?format=csv"
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-zinc-900 border border-white/5 hover:border-zinc-700 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 transition duration-200"
              >
                <Download className="h-3.5 w-3.5" /> Export Mileage
              </a>
              <button
                onClick={() => setIsLogMileageOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300 shadow-[0_4px_20px_rgba(212,175,55,0.15)]"
              >
                <Plus className="h-4 w-4 stroke-[3]" /> Log Travel
              </button>
            </>
          )}
        </div>
      </div>

      {schemaReady ? (
        <AnimatePresence mode="wait">
          {activeTab === 'expenses' ? (
            <motion.div
              key="expenses-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Expenses Stats */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl backdrop-blur-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-5">
                    <TrendingDown className="h-12 w-12 text-gold" />
                  </div>
                  <p className="text-xs text-zinc-500 uppercase font-black tracking-wider">Total Expenses Logs</p>
                  <p className="text-2xl font-black mt-1 font-mono text-white">{expenseStats.count}</p>
                  <p className="text-[10px] text-zinc-400 mt-1">Total transactions logged</p>
                </div>
                <div className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl backdrop-blur-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-5">
                    <DollarSign className="h-12 w-12 text-gold" />
                  </div>
                  <p className="text-xs text-zinc-500 uppercase font-black tracking-wider">This Month Spending</p>
                  <p className="text-2xl font-black mt-1 font-mono text-gold-soft">{money(expenseStats.monthCents)}</p>
                  <p className="text-[10px] text-zinc-400 mt-1">Current monthly expenses</p>
                </div>
                <div className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl backdrop-blur-md relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-5">
                    <Layers className="h-12 w-12 text-gold" />
                  </div>
                  <p className="text-xs text-zinc-500 uppercase font-black tracking-wider">Lifetime Cost</p>
                  <p className="text-2xl font-black mt-1 font-mono text-white">{money(expenseStats.totalCents)}</p>
                  <p className="text-[10px] text-zinc-400 mt-1">Cumulative recorded spend</p>
                </div>
              </div>

              {/* Expense Log List */}
              <GlassCard className="space-y-4">
                <SectionEyebrow>Rig Expenses & Operating Costs Log</SectionEyebrow>
                <div className="space-y-2.5">
                  {expenses.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center p-4">
                      <FileText className="h-7 w-7 text-zinc-800 mb-1" />
                      <p className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">No Expenses Logged</p>
                    </div>
                  ) : (
                    expenses.slice(0, 40).map((r) => (
                      <div key={String(r.id)} className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-zinc-900/30 p-4 hover:border-gold/20 transition duration-200">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white uppercase tracking-wider text-[9px] font-mono rounded bg-white/5 px-2 py-0.5 border border-white/10">
                              {String(r.category ?? 'general')}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {String(r.incurred_on ?? r.incurred_at ?? r.created_at ?? '').slice(0, 10)}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300 mt-1.5 font-medium leading-relaxed">
                            {r.notes ? String(r.notes) : r.note ? String(r.note) : '(no description)'}
                          </p>
                        </div>
                        
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="font-mono font-black text-rose-400 text-sm">{money(r.amount_cents)}</span>
                          <div>
                            {r.receipt_url ? (
                              <a 
                                href={String(r.receipt_url)} 
                                target="_blank" 
                                rel="noreferrer" 
                                className="inline-flex items-center gap-1 rounded-xl border border-white/10 hover:border-gold/30 bg-black/40 px-3 py-1.5 text-[9px] font-black uppercase text-zinc-300 transition"
                              >
                                <Eye className="h-3 w-3 text-gold-soft" /> Receipt
                              </a>
                            ) : (
                              <ExpenseReceiptUpload expenseId={String(r.id)} onDone={() => { setMsg('Receipt uploaded successfully.'); window.location.reload(); }} />
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </GlassCard>
            </motion.div>
          ) : (
            <motion.div
              key="mileage-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              className="space-y-6"
            >
              {/* Mileage Stats */}
              {mileageSummary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Today (Round-trip)', val: mileageSummary.today, Icon: Fuel },
                    { label: 'This Month', val: mileageSummary.month, Icon: MapPin },
                    { label: 'This Year', val: mileageSummary.year, Icon: Calendar },
                    { label: 'Lifetime Mileage', val: mileageSummary.lifetime, Icon: Wrench },
                  ].map(({ label, val, Icon }) => (
                    <div key={label} className="bg-zinc-950/60 border border-white/5 p-4 rounded-2xl backdrop-blur-md relative overflow-hidden">
                      <div className="flex justify-between items-center text-zinc-500">
                        <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
                        <Icon className="h-4 w-4 text-gold-soft opacity-60" />
                      </div>
                      <p className="mt-2.5 font-mono text-xl font-black text-white">{Number(val).toFixed(1)} mi</p>
                    </div>
                  ))}
                </div>
              )}

              {/* API Alert */}
              {mapsAutoNote && (
                <div className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-4 text-xs text-amber-200 flex items-start gap-2.5">
                  <AlertTriangle className="h-4.5 w-4.5 text-amber-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    Auto-distance estimation requires a configured Google Maps API credential (<code className="text-amber-300">GOOGLE_MAPS_API_KEY</code>). Manual mileage entry has been loaded as the fallback tracker.
                  </p>
                </div>
              )}

              {/* Mileage log list */}
              <GlassCard className="space-y-4">
                <SectionEyebrow>Travel Logs Directory</SectionEyebrow>
                <div className="space-y-2.5">
                  {mileage.length === 0 ? (
                    <div className="py-12 text-center border border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center p-4">
                      <Fuel className="h-7 w-7 text-zinc-800 mb-1" />
                      <p className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">No Mileage Logged</p>
                    </div>
                  ) : (
                    mileage.slice(0, 40).map((r) => (
                      <div 
                        key={String(r.id)} 
                        onClick={() => setEditingMileageId(String(r.id))}
                        className="flex items-center justify-between gap-4 rounded-2xl border border-white/5 bg-zinc-900/30 p-4 hover:border-gold/20 transition duration-200 cursor-pointer group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm group-hover:text-gold-soft transition">
                              {String(r.customer_name ?? 'Field Mileage')}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {String(r.logged_date ?? r.logged_at ?? '').slice(0, 10)}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-300 mt-1 truncate">
                            {String(r.vehicle ?? 'No vehicle specified')} · {String(r.address ?? '')}
                          </p>
                          {r.notes && (
                            <p className="text-[11px] text-zinc-500 mt-1 italic">
                              "{String(r.notes)}"
                            </p>
                          )}
                        </div>
                        
                        <div className="flex items-center gap-4 shrink-0 text-right">
                          <div>
                            <p className="font-mono font-black text-gold-soft text-sm">
                              {String(r.round_trip_miles ?? (Number(r.miles_one_way ?? 0) * 2))} mi
                            </p>
                            <span className="text-[9px] font-mono text-zinc-500 block">
                              (One-way: {String(r.miles_one_way ?? '—')} mi)
                            </span>
                          </div>
                          <button className="p-1.5 bg-zinc-900 border border-white/5 group-hover:border-gold/30 rounded-lg text-zinc-400 group-hover:text-white transition">
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>
      ) : (
        <div className="py-16 text-center border border-white/5 rounded-2xl bg-zinc-950/40">
          <SectionEyebrow>Operations Framework Unavailable</SectionEyebrow>
          <p className="text-xs text-zinc-500 mt-2">Database schema required for operations tracking is not active.</p>
        </div>
      )}

      {/* ADD EXPENSE SLIDE-OUT DRAWER */}
      <AnimatePresence>
        {isAddExpenseOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddExpenseOpen(false)}
              className="fixed inset-0 z-50 bg-black"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">Record Cost Expense</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Add business expenses for tax & profit auditing.</p>
                </div>
                <button
                  onClick={() => setIsAddExpenseOpen(false)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <ToastActionForm
                className="flex-1 overflow-y-auto py-5 space-y-4 pr-1"
                action={addBusinessExpenseActionState}
              >
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Amount Dollars ($) *</label>
                  <input 
                    name="amountDollars" 
                    type="number" 
                    step="0.01" 
                    min="0.01" 
                    required 
                    placeholder="0.00"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 font-mono transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Expense Category *</label>
                  <input 
                    name="category" 
                    required
                    placeholder="e.g. gas, chemical supplies, advertising"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Internal Description / Notes</label>
                  <input 
                    name="note" 
                    placeholder="e.g. Microfiber compound pads from Chemical Guys"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Incurred Date</label>
                  <input 
                    name="incurredOn" 
                    type="date" 
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 font-mono transition"
                  />
                </div>

                <div className="pt-4 border-t border-white/5 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsAddExpenseOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <SubmitStatusButton pendingText="Logging…" className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300">
                    Log Expense
                  </SubmitStatusButton>
                </div>
              </ToastActionForm>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* LOG MILEAGE SLIDE-OUT DRAWER */}
      <AnimatePresence>
        {isLogMileageOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsLogMileageOpen(false)}
              className="fixed inset-0 z-50 bg-black"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">Log Travel Mileage</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Record trip distances for mobile service logistics.</p>
                </div>
                <button
                  onClick={() => setIsLogMileageOpen(false)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <ToastActionForm
                className="flex-1 overflow-y-auto py-5 space-y-4 pr-1"
                action={addJobMileageLogActionState}
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">One-way miles *</label>
                    <input 
                      name="milesOneWay" 
                      type="number" 
                      step="0.1" 
                      min="0.1" 
                      required 
                      placeholder="0.0"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 font-mono transition"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Trip Mode</label>
                    <select 
                      name="tripMode" 
                      defaultValue="round_trip"
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition"
                    >
                      <option value="round_trip">Round-trip (×2)</option>
                      <option value="one_way">One-way only</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Appointment ID (Optional)</label>
                  <input 
                    name="appointmentId" 
                    placeholder="Paste UUID if linking to specific job"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 font-mono transition text-[11px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Travel Date</label>
                  <input 
                    name="loggedOn" 
                    type="date" 
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 font-mono transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Notes / Destination</label>
                  <input 
                    name="note" 
                    placeholder="e.g. Travel to West Austin driveway client"
                    className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40 focus:ring-1 focus:ring-gold/30 transition"
                  />
                </div>

                <div className="pt-4 border-t border-white/5 flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsLogMileageOpen(false)}
                    className="px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <SubmitStatusButton pendingText="Logging…" className="px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider text-black bg-gold hover:bg-gold-soft transition duration-300">
                    Log Travel
                  </SubmitStatusButton>
                </div>
              </ToastActionForm>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* EDIT MILEAGE LOG DRAWER */}
      <AnimatePresence>
        {activeMileageLog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingMileageId(null)}
              className="fixed inset-0 z-50 bg-black"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-zinc-950 border-l border-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="text-lg font-black text-white">Configure Travel Log</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Edit parameters for log: #{String(activeMileageLog.id).slice(0, 8)}</p>
                </div>
                <button
                  onClick={() => setEditingMileageId(null)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-5 pr-1 space-y-6 scrollbar-thin scrollbar-thumb-zinc-900">
                <ToastActionForm
                  action={updateJobMileageLogActionState}
                  className="space-y-4"
                >
                  <input type="hidden" name="id" value={String(activeMileageLog.id)} />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">One-way miles</label>
                      <input
                        name="milesOneWay"
                        type="number"
                        step="0.1"
                        min="0.1"
                        defaultValue={String(
                          activeMileageLog.miles_one_way ??
                            (Number(activeMileageLog.round_trip_miles ?? activeMileageLog.total_miles ?? 0) / 2 || '')
                        )}
                        className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white font-mono"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Trip Mode</label>
                      <select 
                        name="tripMode" 
                        defaultValue={String(activeMileageLog.trip_mode ?? 'round_trip')}
                        className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white"
                      >
                        <option value="round_trip">Round-trip</option>
                        <option value="one_way">One-way</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Note / Destination</label>
                    <input 
                      name="note" 
                      defaultValue={String(activeMileageLog.notes ?? activeMileageLog.note ?? '')}
                      className="w-full text-xs rounded-xl border border-white/10 bg-black/60 px-3 py-2.5 text-white focus:outline-none focus:border-gold/40"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <SubmitStatusButton pendingText="saving…" className="rounded-xl bg-gold px-5 py-2.5 text-xs font-black uppercase text-black hover:brightness-110 transition">
                      Save Changes
                    </SubmitStatusButton>
                  </div>
                </ToastActionForm>

                <div className="border-t border-white/10 pt-4 bg-rose-500/5 -mx-6 px-6 pb-6">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-rose-400">Danger Zone</h4>
                  <p className="text-[11px] text-zinc-500 mt-1">This action cannot be undone. It will remove the travel log from calculations.</p>
                  
                  <ToastActionForm 
                    action={deleteJobMileageLogActionState}
                    className="mt-3.5"
                  >
                    <input type="hidden" name="id" value={String(activeMileageLog.id)} />
                    <SubmitStatusButton pendingText="deleting…" className="w-full py-2 bg-rose-950/20 border border-rose-500/25 text-rose-300 hover:bg-rose-500/25 rounded-xl text-[10px] font-black uppercase tracking-wider transition">
                      Delete Travel Log
                    </SubmitStatusButton>
                  </ToastActionForm>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
