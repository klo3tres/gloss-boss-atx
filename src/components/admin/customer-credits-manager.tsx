'use client';

import { useState, useTransition } from 'react';
import { CreditCard, PlusCircle, Trash2, Calendar, Award, CheckCircle, Clock } from 'lucide-react';
import { clearTestCreditsAction, issueCreditAction, voidCreditAction } from '@/app/(dashboard)/admin/customer-credit-actions';
import { SubmitStatusButton } from '@/components/ui/submit-status-button';
import { displayMoney } from '@/lib/display-format';

export type CreditHistoryItem = {
  id: string;
  amount_cents: number;
  remaining_cents: number;
  type: string;
  reason: string;
  status: string;
  issued_at: string;
  expires_at: string | null;
  linked_work_order_id: string | null;
  linked_payment_id: string | null;
  issued_by_name?: string;
};

export type CreditRedemptionItem = {
  id: string;
  credit_id: string;
  payment_id: string;
  amount_cents: number;
  redeemed_at: string;
  redeemed_by_name: string;
  appointment_id?: string | null;
  fallback_booking_id?: string | null;
};

type Props = {
  customerId: string;
  credits: CreditHistoryItem[];
  redemptions: CreditRedemptionItem[];
  adminUserId?: string;
  showCompactButtonOnly?: boolean; // When rendered in context lists
};

export function CustomerCreditsManager({ customerId, credits, redemptions, adminUserId, showCompactButtonOnly = false }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeCredits = credits.filter(c => c.status === 'active' || c.status === 'partially_used');
  const totalBalanceCents = activeCredits.reduce((sum, c) => sum + c.remaining_cents, 0);

  const handleIssue = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData(e.currentTarget);
    formData.set('customerId', customerId);

    startTransition(async () => {
      const res = await issueCreditAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.message ?? 'Credit issued successfully.');
        setIsOpen(false);
        (e.target as HTMLFormElement).reset();
      }
    });
  };

  const handleVoid = async (creditId: string) => {
    if (!confirm('Are you sure you want to void this credit? Remaining balance will be set to zero.')) return;
    setErrorMsg(null);
    setSuccessMsg(null);

    const formData = new FormData();
    formData.set('creditId', creditId);

    startTransition(async () => {
      const res = await voidCreditAction(formData);
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setSuccessMsg(res.message ?? 'Credit voided.');
      }
    });
  };

  const handleClearTestCredits = async () => {
    if (!confirm('Clear active credits with test, QA, or demo labels for this customer?')) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    const formData = new FormData();
    formData.set('customerId', customerId);
    startTransition(async () => {
      const res = await clearTestCreditsAction(formData);
      if (res.error) setErrorMsg(res.error);
      else setSuccessMsg(res.message ?? 'Test credits cleared.');
    });
  };

  if (showCompactButtonOnly) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-gold/45 bg-gold/10 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-gold-soft hover:bg-gold/20 transition duration-200"
        >
          <PlusCircle className="h-4 w-4" /> Issue Credit
        </button>

        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-gold/25 bg-zinc-950 p-6 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
                <h3 className="text-sm font-bold uppercase text-gold-soft flex items-center gap-2">
                  <CreditCard className="h-4 w-4" /> Issue Customer Credit
                </h3>
                <button type="button" onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white text-sm">✕</button>
              </div>

              <form onSubmit={handleIssue} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500">Amount ($)</label>
                  <input name="amountDollars" type="number" step="0.01" min="0.01" required placeholder="0.00" className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
                </div>

                <div className="grid gap-2 grid-cols-2">
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-500">Credit Type</label>
                    <select name="type" className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white">
                      <option value="apology">Apology / Make-good</option>
                      <option value="service">Service Credit</option>
                      <option value="membership">Membership Credit</option>
                      <option value="promo">Promo Credit</option>
                      <option value="refund">Refund Credit</option>
                      <option value="manual">Manual Owner Credit</option>
                      <option value="gift_card">Gift Card Conversion</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase font-bold text-zinc-500">Expires At (Optional)</label>
                    <input name="expiresAt" type="date" className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500">Reason / Details</label>
                  <input name="reason" required placeholder="Reason for issuing credit..." className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
                </div>

                {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}

                <button type="submit" disabled={isPending} className="w-full rounded bg-gold py-2 text-xs font-black uppercase text-black hover:bg-gold-soft transition">
                  {isPending ? 'Processing...' : 'Issue Credit'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Available Credits Balance</p>
            <p className="text-2xl font-black text-gold-soft mt-1">{displayMoney(totalBalanceCents)}</p>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-400 border-t border-white/5 pt-2">
            <span>Outstanding count: <strong className="text-white">{activeCredits.length}</strong></span>
          </div>
        </div>

        <div className="bg-black/40 border border-white/5 rounded-2xl p-4 flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Total Credits Ever Issued</p>
            <p className="text-2xl font-black text-white mt-1">
              {displayMoney(credits.filter(c => c.status !== 'voided').reduce((s, c) => s + c.amount_cents, 0))}
            </p>
          </div>
          <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-400 border-t border-white/5 pt-2">
            <span>Voided count: <strong className="text-white">{credits.filter(c => c.status === 'voided').length}</strong></span>
          </div>
        </div>

        {/* Action Button Card */}
        <div className="bg-black/20 border border-dashed border-gold/30 rounded-2xl p-4 flex flex-col justify-center items-center">
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-xs font-black uppercase text-black hover:bg-gold-soft transition"
          >
            <PlusCircle className="h-4 w-4" /> Issue Customer Credit
          </button>
          <button
            type="button"
            onClick={handleClearTestCredits}
            disabled={isPending}
            className="mt-3 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2 text-[10px] font-black uppercase text-red-300 hover:bg-red-500/10 disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Clear Test Credits
          </button>
        </div>
      </div>

      {(errorMsg || successMsg) && (
        <div className={`rounded-xl border px-4 py-3 text-xs font-bold ${errorMsg ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
          {errorMsg || successMsg}
        </div>
      )}

      {/* Slide-out Form / Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-gold/25 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <h3 className="text-sm font-bold uppercase text-gold-soft flex items-center gap-2">
                <CreditCard className="h-4 w-4" /> Issue Customer Credit
              </h3>
              <button type="button" onClick={() => setIsOpen(false)} className="text-zinc-500 hover:text-white text-sm">✕</button>
            </div>

            <form onSubmit={handleIssue} className="space-y-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500">Amount ($)</label>
                <input name="amountDollars" type="number" step="0.01" min="0.01" required placeholder="0.00" className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
              </div>

              <div className="grid gap-2 grid-cols-2">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500">Credit Type</label>
                  <select name="type" className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white">
                    <option value="apology">Apology / Make-good</option>
                    <option value="service">Service Credit</option>
                    <option value="membership">Membership Credit</option>
                    <option value="promo">Promo Credit</option>
                    <option value="refund">Refund Credit</option>
                    <option value="manual">Manual Owner Credit</option>
                    <option value="gift_card">Gift Card Conversion</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-zinc-500">Expires At (Optional)</label>
                  <input name="expiresAt" type="date" className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-zinc-500">Reason / Details</label>
                <input name="reason" required placeholder="Reason for issuing credit..." className="mt-1 w-full rounded border border-zinc-700 bg-black px-3 py-2 text-sm text-white" />
              </div>

              {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}

              <button type="submit" disabled={isPending} className="w-full rounded bg-gold py-2 text-xs font-black uppercase text-black hover:bg-gold-soft transition">
                {isPending ? 'Processing...' : 'Issue Credit'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Credit Ledger Table */}
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
        <h3 className="text-sm font-bold uppercase text-gold-soft mb-3">Credits History Ledger</h3>
        {credits.length === 0 ? (
          <p className="text-xs text-zinc-500 italic py-4 border border-dashed border-white/5 rounded-xl text-center">
            No credits have been issued to this customer yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Reason</th>
                  <th className="py-2.5">Type</th>
                  <th className="py-2.5">Original</th>
                  <th className="py-2.5">Remaining</th>
                  <th className="py-2.5">Status</th>
                  <th className="py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {credits.map((c) => {
                  const isVoidable = c.status === 'active' || c.status === 'partially_used';
                  const expiresText = c.expires_at ? ` (Expires ${new Date(c.expires_at).toLocaleDateString()})` : '';
                  return (
                    <tr key={c.id} className={c.status === 'voided' ? 'opacity-50' : ''}>
                      <td className="py-3 font-mono text-[10px]">{new Date(c.issued_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        <p className="font-semibold text-white">{c.reason}</p>
                        {expiresText && <span className="text-[9px] text-zinc-500">{expiresText}</span>}
                        {c.issued_by_name && <p className="text-[9px] text-zinc-500">By: {c.issued_by_name}</p>}
                      </td>
                      <td className="py-3">
                        <span className="rounded bg-white/5 border border-white/10 px-1.5 py-0.5 text-[8px] font-mono uppercase text-zinc-400">
                          {c.type}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-zinc-400">{displayMoney(c.amount_cents)}</td>
                      <td className="py-3 font-mono font-bold text-white">{displayMoney(c.remaining_cents)}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black uppercase ${
                          c.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          c.status === 'partially_used' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' :
                          c.status === 'used' ? 'bg-zinc-500/15 text-zinc-400 border border-white/10' :
                          c.status === 'voided' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                          'bg-zinc-800 text-zinc-500'
                        }`}>
                          {c.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        {isVoidable && (
                          <button
                            type="button"
                            onClick={() => handleVoid(c.id)}
                            className="rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[9px] font-bold uppercase text-red-400 hover:bg-red-500/10 transition"
                          >
                            Void
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Redemption History Table */}
      <section className="rounded-2xl border border-white/10 bg-zinc-950 p-5">
        <h3 className="text-sm font-bold uppercase text-gold-soft mb-3">Redemption History</h3>
        {redemptions.length === 0 ? (
          <p className="text-xs text-zinc-500 italic py-4 border border-dashed border-white/5 rounded-xl text-center">
            No redemptions recorded.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-300">
              <thead>
                <tr className="border-b border-white/10 text-[10px] font-black uppercase tracking-wider text-zinc-500">
                  <th className="py-2.5">Date</th>
                  <th className="py-2.5">Redeemed At</th>
                  <th className="py-2.5">Amount</th>
                  <th className="py-2.5">Redeemed By</th>
                  <th className="py-2.5">Credit Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {redemptions.map((r) => {
                  const jobText = r.appointment_id 
                    ? `Appointment: #${r.appointment_id.slice(0, 8)}` 
                    : r.fallback_booking_id 
                    ? `Booking: #${r.fallback_booking_id.slice(0, 8)}`
                    : 'Work Order';
                  const matchCredit = credits.find(c => c.id === r.credit_id);
                  return (
                    <tr key={r.id}>
                      <td className="py-3 font-mono text-[10px]">{new Date(r.redeemed_at).toLocaleDateString()}</td>
                      <td className="py-3">
                        <p className="font-semibold text-white">{jobText}</p>
                        <p className="text-[9px] text-zinc-500 font-mono">ID: {r.payment_id.slice(0, 8)}...</p>
                      </td>
                      <td className="py-3 font-mono font-bold text-emerald-300">-{displayMoney(r.amount_cents)}</td>
                      <td className="py-3 text-zinc-400">{r.redeemed_by_name}</td>
                      <td className="py-3 text-zinc-400">
                        <p className="text-[10px] truncate max-w-[200px]">{matchCredit?.reason || 'Store Credit'}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
