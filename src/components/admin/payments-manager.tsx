'use client';

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { 
  CreditCard, 
  Clock, 
  Undo2, 
  FileText, 
  X, 
  Settings, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Car, 
  ExternalLink, 
  HelpCircle,
  AlertTriangle,
  CheckCircle,
  Layers,
  Compass
} from 'lucide-react';
import { reconcileStripeSessionAction, refundStripePaymentAction } from '@/app/(dashboard)/admin/payments/payment-actions';

type PayRow = Record<string, any>;

function money(cents: unknown) {
  return typeof cents === 'number' ? `$${(cents / 100).toFixed(2)}` : '—';
}

function chicago(v: unknown) {
  if (!v) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago',
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(String(v)));
  } catch {
    return '—';
  }
}

export function PaymentsManager({ rows }: { rows: PayRow[] }) {
  const [activeTab, setActiveTab] = useState<'recent' | 'pending' | 'refunds' | 'receipts'>('recent');
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);

  // Group row items
  const grouped = useMemo(() => {
    const recent: PayRow[] = [];
    const pending: PayRow[] = [];
    const refunds: PayRow[] = [];
    const receipts: PayRow[] = [];

    rows.forEach((r, idx) => {
      const rowWithIndex = { ...r, _originalIndex: idx };
      const hasPaymentRecord = !!r.id;
      const isSucceeded = r.status === 'succeeded' || r.payment_status === 'paid' || r.payment_status === 'deposit_paid';
      const isPending = r.source === 'fallback_session' || r.source === 'appointment_session';

      // 1. Pending
      if (isPending) {
        pending.push(rowWithIndex);
      } else {
        // 2. Recent (any valid payment record)
        recent.push(rowWithIndex);
      }

      // 3. Refunds (succeeded and has session/intent)
      if (isSucceeded && (r.stripe_checkout_session_id || r.stripe_payment_intent_id)) {
        refunds.push(rowWithIndex);
      }

      // 4. Receipts (succeeded and has database payment record)
      if (hasPaymentRecord && isSucceeded) {
        receipts.push(rowWithIndex);
      }
    });

    return { recent, pending, refunds, receipts };
  }, [rows]);

  const activeRow = activeRowIndex !== null ? rows[activeRowIndex] : null;

  return (
    <div className="space-y-6">
      {/* Tab controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950/40 p-4 rounded-2xl border border-white/5 backdrop-blur-sm">
        <div className="flex rounded-xl bg-black/60 border border-white/10 p-1">
          {[
            { id: 'recent', label: `Recent Payments (${grouped.recent.length})` },
            { id: 'pending', label: `Pending Sessions (${grouped.pending.length})` },
            { id: 'refunds', label: `Refunds Console (${grouped.refunds.length})` },
            { id: 'receipts', label: `Receipts (${grouped.receipts.length})` }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-200 ${
                activeTab === t.id 
                  ? 'bg-gold/15 text-gold-soft border border-gold/25' 
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <Link href="/admin/receipts" className="text-[10px] font-black uppercase tracking-wider bg-zinc-900 border border-white/5 hover:border-zinc-700 text-zinc-300 px-3.5 py-2.5 rounded-xl transition">
          Open Receipts Board
        </Link>
      </div>

      {/* Grid panels list */}
      <div className="relative min-h-[300px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {grouped[activeTab].map((r) => {
                const customerName = String(r.guest_name || r.customer_name || 'Guest');
                const serviceLabel = String(r.service_slug ?? r.payment_kind ?? 'service').replace(/-/g, ' ');
                const vehicleLabel = Array.isArray(r.booking_vehicles) ? `${r.booking_vehicles.length} vehicle(s)` : String(r.vehicle_description ?? '—');
                const costLabel = money(r.base_price_cents);
                const depositLabel = money(r.deposit_amount_cents ?? r.amount_cents);
                
                return (
                  <div
                    key={r._originalIndex}
                    onClick={() => setActiveRowIndex(r._originalIndex)}
                    className="rounded-2xl border border-white/5 bg-zinc-900/35 p-5 flex flex-col justify-between hover:border-gold/20 transition duration-300 cursor-pointer group"
                  >
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-bold text-white text-sm group-hover:text-gold-soft transition">
                            {customerName}
                          </h4>
                          <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{chicago(r.created_at)}</p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${
                          r.status === 'succeeded' || r.payment_status === 'paid'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-zinc-800 text-zinc-500'
                        }`}>
                          {String(r.payment_status ?? r.status ?? 'unknown').replace(/_/g, ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-400 border-t border-white/5 pt-3">
                        <p className="truncate">
                          <span className="text-zinc-500 block">Service</span>
                          <strong className="text-zinc-200 capitalize font-medium">{serviceLabel}</strong>
                        </p>
                        <p className="truncate">
                          <span className="text-zinc-500 block">Vehicle Specification</span>
                          <strong className="text-zinc-200 font-medium">{vehicleLabel}</strong>
                        </p>
                        <p>
                          <span className="text-zinc-500 block">Total Price</span>
                          <strong className="text-zinc-200 font-mono font-medium">{costLabel}</strong>
                        </p>
                        <p>
                          <span className="text-zinc-500 block">Deposit Charged</span>
                          <strong className="text-gold-soft font-mono font-medium">{depositLabel}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="pt-4 mt-4 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[9px] font-mono text-zinc-600">
                        {r.appointment_id ? `Appt #${r.appointment_id.slice(0, 8)}` : r.fallback_booking_id ? `Fallback #${r.fallback_booking_id.slice(0, 8)}` : 'No backlink'}
                      </span>
                      <button className="text-[9px] font-black uppercase tracking-wider text-zinc-400 group-hover:text-white transition flex items-center gap-1 bg-zinc-900 border border-white/5 px-2.5 py-1.5 rounded-lg">
                        <Settings className="h-3.5 w-3.5 text-gold-soft" /> Configure
                      </button>
                    </div>
                  </div>
                );
              })}
              {grouped[activeTab].length === 0 && (
                <div className="col-span-2 py-16 text-center rounded-2xl border border-dashed border-white/5 flex flex-col items-center justify-center p-4">
                  <CreditCard className="h-7 w-7 text-zinc-800 mb-1" />
                  <p className="text-[10px] text-zinc-500 uppercase font-black tracking-wider">No Transaction Records Found</p>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* TRANSACTION CONTROL CENTER DRAWER */}
      <AnimatePresence>
        {activeRow && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveRowIndex(null)}
              className="fixed inset-0 z-50 bg-black"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-zinc-950 border-l border-l-white/10 p-6 flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)]"
            >
              <div className="flex items-start justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/30 to-gold/5 border border-gold/20 text-sm font-black text-gold-soft">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-white text-base leading-tight">
                      {String(activeRow.guest_name || activeRow.customer_name || 'Guest')}
                    </h3>
                    <p className="text-[10px] font-black uppercase tracking-wider text-gold-soft mt-1">
                      Session: {String(activeRow.stripe_checkout_session_id ?? 'No Session ID').slice(0, 15)}...
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setActiveRowIndex(null)}
                  className="p-1.5 bg-zinc-900 border border-white/5 rounded-xl text-zinc-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-5 space-y-5 pr-1 scrollbar-thin scrollbar-thumb-zinc-900">
                {/* Contact & Links */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Customer Credentials</h4>
                  
                  <div className="bg-zinc-900/30 border border-white/5 p-3.5 rounded-2xl space-y-2 text-xs text-zinc-300">
                    {activeRow.guest_email && (
                      <p className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-gold-soft shrink-0" />
                        <span className="truncate">{String(activeRow.guest_email)}</span>
                      </p>
                    )}
                    {activeRow.guest_phone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-gold-soft shrink-0" />
                        <span>{String(activeRow.guest_phone)}</span>
                      </p>
                    )}
                    {activeRow.customer_id && (
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        <span className="text-[9px] uppercase font-black text-zinc-500">CRM Profile:</span>
                        <Link 
                          href={`/admin/customers/${activeRow.customer_id}`}
                          onClick={() => setActiveRowIndex(null)}
                          className="inline-flex items-center gap-1 text-[10px] text-gold-soft hover:underline font-bold"
                        >
                          Customer File <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Transaction Balance</h4>
                  <div className="grid grid-cols-2 gap-3 bg-zinc-900/20 border border-white/5 p-3 rounded-xl text-xs">
                    <div>
                      <span className="text-zinc-500 block">Total Base Price</span>
                      <strong className="text-white font-mono text-sm">{money(activeRow.base_price_cents)}</strong>
                    </div>
                    <div>
                      <span className="text-zinc-500 block">Deposit Captured</span>
                      <strong className="text-gold-soft font-mono text-sm">{money(activeRow.deposit_amount_cents ?? activeRow.amount_cents)}</strong>
                    </div>
                  </div>
                </div>

                {/* Checkout session / Payment intent keys */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Stripe Keys</h4>
                  <div className="space-y-2 bg-black/45 border border-white/5 p-3.5 rounded-2xl text-[10px] text-zinc-400 font-mono">
                    <p className="flex justify-between items-center gap-2">
                      <span className="text-zinc-600">Checkout Session:</span>
                      <span className="truncate max-w-[200px] text-zinc-200">{activeRow.stripe_checkout_session_id ?? '—'}</span>
                    </p>
                    <p className="flex justify-between items-center gap-2">
                      <span className="text-zinc-600">Payment Intent:</span>
                      <span className="truncate max-w-[200px] text-zinc-200">{activeRow.stripe_payment_intent_id ?? '—'}</span>
                    </p>
                  </div>
                </div>

                {/* RECONCILE / REPAIR TOOL */}
                {activeRow.stripe_checkout_session_id && (
                  <div className="border-t border-white/5 pt-4 space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Reconciliation Services</h4>
                    <p className="text-[10px] text-zinc-500">Run manual checkout session syncing if transaction webhook failed.</p>
                    <form 
                      action={async (fd) => {
                        await reconcileStripeSessionAction(fd);
                        setActiveRowIndex(null);
                        window.location.reload();
                      }}
                    >
                      <input type="hidden" name="sessionId" value={activeRow.stripe_checkout_session_id} />
                      <button type="submit" className="w-full py-2.5 bg-zinc-900 border border-white/5 hover:border-gold/30 hover:bg-gold/5 rounded-xl text-[10px] font-black uppercase tracking-wider text-zinc-300 transition duration-200">
                        Repair & Synchronize Session
                      </button>
                    </form>
                  </div>
                )}

                {/* REFUND TOOL */}
                {(activeRow.stripe_checkout_session_id || activeRow.stripe_payment_intent_id) && (
                  <div className="border-t border-white/5 pt-4 space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Refund Matrix</h4>
                    <p className="text-[10px] text-zinc-500">Reconcile customer disputes by issuing a complete or partial refund.</p>
                    
                    <form 
                      action={async (fd) => {
                        await refundStripePaymentAction(fd);
                        setActiveRowIndex(null);
                        window.location.reload();
                      }}
                      className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-2xl space-y-3"
                    >
                      <input type="hidden" name="sessionId" value={activeRow.stripe_checkout_session_id || ''} />
                      <input type="hidden" name="paymentIntentId" value={activeRow.stripe_payment_intent_id || ''} />
                      
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-zinc-500">Refund Amount (cents)</label>
                          <input 
                            name="amountCents" 
                            placeholder="e.g. 5000 for $50.00" 
                            className="w-full rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-white font-mono"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[9px] uppercase font-bold text-rose-400">Confirm (Type 'REFUND')</label>
                          <input 
                            name="confirm" 
                            required
                            placeholder="Type REFUND" 
                            className="w-full rounded-xl border border-rose-500/20 bg-black/60 px-3 py-2 text-white font-bold"
                          />
                        </div>
                      </div>

                      <button type="submit" className="w-full py-2.5 bg-rose-950/20 border border-rose-500/20 text-rose-300 hover:bg-rose-500/30 rounded-xl text-[10px] font-black uppercase tracking-wider transition">
                        Execute Stripe Refund
                      </button>
                    </form>
                  </div>
                )}

                {/* Receipt links */}
                {activeRow.id && (
                  <div className="border-t border-white/5 pt-4 space-y-3">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-zinc-500">Receipts</h4>
                    <div className="flex gap-2">
                      <Link
                        href={`/admin/payments/${activeRow.id}`}
                        onClick={() => setActiveRowIndex(null)}
                        className="flex-1 py-2.5 bg-zinc-900 border border-white/5 hover:border-zinc-700 rounded-xl text-[10px] font-black text-center uppercase tracking-wider text-zinc-300 transition"
                      >
                        Payment details
                      </Link>
                      <Link
                        href={`/admin/receipts/${activeRow.id}`}
                        onClick={() => setActiveRowIndex(null)}
                        className="flex-1 py-2.5 bg-zinc-900 border border-white/5 hover:border-zinc-700 rounded-xl text-[10px] font-black text-center uppercase tracking-wider text-emerald-300 transition"
                      >
                        View receipt
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
