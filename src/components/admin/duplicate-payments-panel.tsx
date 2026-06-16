'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Trash2, Eye, ShieldAlert, Sparkles } from 'lucide-react';
import { displayMoney } from '@/lib/display-format';
import { managePaymentAction, repairAllDuplicatePaymentsAction } from '@/app/(dashboard)/admin/revenue/actions';

type AnyRow = {
  id: string;
  amount_cents?: number | null;
  final_total_cents?: number | null;
  status?: string | null;
  payment_method?: string | null;
  payment_kind?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  is_test?: boolean | null;
  exclude_from_revenue?: boolean | null;
  voided?: boolean | null;
  voided_at?: string | null;
  source_table?: string | null;
  stripe_payment_intent_id?: string | null;
  stripe_checkout_session_id?: string | null;
  appointment_id?: string | null;
};

type DuplicateGroup = {
  key: string;
  rows: AnyRow[];
};

type DuplicatePaymentsPanelProps = {
  initialGroups: DuplicateGroup[];
};

export function DuplicatePaymentsPanel({ initialGroups }: DuplicatePaymentsPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [repairMsg, setRepairMsg] = useState<string | null>(null);

  const handleRepairAll = async () => {
    setRepairMsg(null);
    setErrorMsg(null);
    try {
      const res = await repairAllDuplicatePaymentsAction();
      if (res.error) setErrorMsg(res.error);
      else setRepairMsg(`Repaired ${res.repaired ?? 0} group(s); excluded ${res.paymentsExcluded ?? 0} payment(s) and ${res.receiptsExcluded ?? 0} receipt(s).`);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Repair failed.');
    }
  };

  const handleAction = async (row: AnyRow, action: 'keep' | 'exclude' | 'mark_test' | 'soft_delete') => {
    setBusyId(row.id);
    setErrorMsg(null);
    try {
      const isReceipt = String(row.source_table || '').toLowerCase() === 'receipts';
      const res = await managePaymentAction(row.id, action, isReceipt ? 'receipts' : 'payments');
      if (res && 'error' in res && res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  if (initialGroups.length === 0) {
    return null;
  }

  return (
    <section className='rounded-3xl border border-amber-500/30 bg-zinc-950 p-6 shadow-xl'>
      <div className='flex items-center gap-3 border-b border-white/10 pb-4'>
        <AlertTriangle className='h-6 w-6 text-amber-500' />
        <div className='flex-1'>
          <h2 className='text-lg font-black uppercase tracking-wider text-white'>Duplicate Payments Manager</h2>
          <p className='text-xs text-zinc-400'>We found {initialGroups.length} groups of suspected duplicate transactions. Manage them below to keep, exclude, or soft delete rows.</p>
        </div>
        <button
          type='button'
          onClick={handleRepairAll}
          className='rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase text-emerald-200 hover:bg-emerald-500/20'
        >
          Repair all safely
        </button>
      </div>

      {repairMsg ? (
        <div className='mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs text-emerald-100'>
          {repairMsg}
        </div>
      ) : null}

      {errorMsg && (
        <div className='mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-200'>
          {errorMsg}
        </div>
      )}

      <div className='mt-5 space-y-4 max-h-[500px] overflow-y-auto pr-1'>
        {initialGroups.map((group) => {
          const amount = group.rows[0]?.amount_cents ?? group.rows[0]?.final_total_cents ?? 0;
          return (
            <div key={group.key} className='rounded-2xl border border-white/5 bg-black/40 p-4 flex flex-col gap-3'>
              <div className='flex items-center justify-between border-b border-white/5 pb-2'>
                <div className='min-w-0'>
                  <p className='text-[10px] font-mono text-zinc-500 truncate'>{group.key}</p>
                  <p className='text-xs font-bold text-zinc-300 mt-0.5'>{group.rows.length} matching rows</p>
                </div>
                <p className='font-mono text-sm font-black text-gold-soft'>{displayMoney(amount)}</p>
              </div>

              <div className='grid gap-2'>
                {group.rows.map((row) => {
                  const isExcluded = row.exclude_from_revenue === true;
                  const isTest = row.is_test === true;
                  const isVoided = row.voided === true || row.voided_at != null;
                  const isReceipt = String(row.source_table || '').toLowerCase() === 'receipts';

                  return (
                    <div key={row.id} className='rounded-xl bg-zinc-950/80 p-3 border border-white/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs'>
                      <div className='flex-1 min-w-0'>
                        <div className='flex items-center gap-2 flex-wrap'>
                          <span className='font-mono font-bold text-zinc-400'>{row.id.slice(0, 8)}…</span>
                          <span className='rounded bg-zinc-900 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-500'>
                            {isReceipt ? 'Receipt' : 'Payment'}
                          </span>
                          {isExcluded && (
                            <span className='rounded bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold text-amber-300'>
                              Excluded
                            </span>
                          )}
                          {isTest && (
                            <span className='rounded bg-indigo-500/10 border border-indigo-500/20 px-1.5 py-0.5 text-[9px] font-bold text-indigo-300'>
                              Test
                            </span>
                          )}
                          {isVoided && (
                            <span className='rounded bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 text-[9px] font-bold text-red-300'>
                              Voided
                            </span>
                          )}
                        </div>
                        <p className='mt-1 text-[11px] text-zinc-400'>
                          Created: {row.created_at ? new Date(row.created_at).toLocaleString() : 'No date'} · Method: {row.payment_method || row.payment_kind || 'Unknown'} · Status: {row.status || 'unknown'}
                        </p>
                      </div>

                      <div className='flex items-center gap-1.5 flex-wrap shrink-0'>
                        <button
                          onClick={() => handleAction(row, 'keep')}
                          disabled={busyId !== null}
                          className={`rounded-lg p-2 text-xs font-black uppercase flex items-center gap-1.5 ${
                            (!isExcluded && !isTest && !isVoided)
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 pointer-events-none'
                              : 'border border-white/10 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 text-zinc-400 transition'
                          }`}
                          title='Keep transaction as valid'
                        >
                          <Check className='h-3.5 w-3.5' /> Keep
                        </button>

                        <button
                          onClick={() => handleAction(row, 'exclude')}
                          disabled={busyId !== null}
                          className={`rounded-lg p-2 text-xs font-black uppercase flex items-center gap-1.5 ${
                            isExcluded
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 pointer-events-none'
                              : 'border border-white/10 hover:border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-300 text-zinc-400 transition'
                          }`}
                          title='Exclude from revenue calculations'
                        >
                          <ShieldAlert className='h-3.5 w-3.5' /> Exclude
                        </button>

                        <button
                          onClick={() => handleAction(row, 'mark_test')}
                          disabled={busyId !== null}
                          className={`rounded-lg p-2 text-xs font-black uppercase flex items-center gap-1.5 ${
                            isTest
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 pointer-events-none'
                              : 'border border-white/10 hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-300 text-zinc-400 transition'
                          }`}
                          title='Mark as a test payment'
                        >
                          <Sparkles className='h-3.5 w-3.5' /> Test
                        </button>

                        <button
                          onClick={() => handleAction(row, 'soft_delete')}
                          disabled={busyId !== null}
                          className={`rounded-lg p-2 text-xs font-black uppercase flex items-center gap-1.5 ${
                            isVoided
                              ? 'bg-red-500/20 text-red-300 border border-red-500/30 pointer-events-none'
                              : 'border border-white/10 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300 text-zinc-400 transition'
                          }`}
                          title='Soft delete transaction'
                        >
                          <Trash2 className='h-3.5 w-3.5' /> Void
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
